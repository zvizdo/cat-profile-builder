import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Helper } from "@/ui/helper/use-helper";
import { HELPER_PANEL_ID } from "../working-lock";
import { isQuestion, peekLine, type HelperTurn } from "./peek-line";
import { TAB_IDS, type SheetController } from "./use-sheet";

// The CATalyst drawer's four heights on the phone (design 2026-09-13 §4): Full (the
// modal sheet, `useSheet`'s `open === "catalyst"`), Half (a plain region at half the
// window), Peek (the 48px bar on the bottom bar) and nothing at all — before the first
// request, when there is no conversation to peek at. The moves between them are the
// turn's own: a send is Peek (the canvas is what to watch now); a card, or a turn
// ending in a question, is Half — or Full for a card whose change would put Apply under
// the Half sheet's fold, which is any card that draws a change block (F58: at 390×664
// the Half body holds the ledger line and the notice, not two more lines and the
// buttons; Full covers the block F60 revealed, and shows it again at Peek); answering
// the card, or closing Half or Full, is Peek.
// The peek itself can be put away (its chevron, a swipe down — the F45 addendum): the
// drawer is closed until the next turn starts or a card arrives, and a turn that ends
// behind it is unseen, so the tab's disc lights. The conversation lives above in
// `helper` (F11): the heights only choose what is drawn.

/** Which of the drawer's heights is up. */
export type DrawerHeight = "full" | "half" | "peek" | "closed";

export interface CatalystDrawer {
  height: DrawerHeight;
  /** The peek bar's one line. */
  line: string;
  /** The helper with its `send`, `retry`, `applyCard` and `declineCard` wrapped: each
   * one drops the drawer to Peek as it acts, so the panel inside the sheet needs no
   * knowledge of the sheet. */
  helper: Helper;
  /** A tap on the peek, or on the bar's tab: Full. */
  toFull: () => void;
  /** The sheet's Close, at either height: Peek. */
  toPeek: () => void;
  /** The peek's chevron or a swipe down on it: closed, until the next turn or card. */
  hide: () => void;
}

/** The height below Full the drawer would take: Half, Peek once a conversation exists
 * (`rest`), or nothing — put away by hand (`hidden`). */
type Low = "half" | "rest" | "hidden";

/**
 * A card arriving: Half, read during render (the way `useUnread` does); or Full when the
 * card draws a change block (`opensFull`, F58), raised in an effect keyed on the card's
 * id — `sheet.show` reads the focused element for its return focus, which is not a
 * render's business. A card already waiting when this mounts (a resize onto the phone
 * mid-turn, F11) is an arrival too, on both paths.
 */
function useCardRaise(
  helper: HelperTurn,
  opensFull: boolean,
  toHalf: () => void,
  show: SheetController["show"],
) {
  const id = helper.turn.card?.toolCallId ?? null;
  const card = id !== null;
  const [prevCard, setPrevCard] = useState(false);
  if (card !== prevCard) {
    setPrevCard(card);
    if (card && !opensFull) toHalf();
  }
  useEffect(() => {
    if (id !== null && opensFull) show("catalyst");
  }, [id, opensFull, show]);
}

/**
 * The turn's edges that raise or restore the drawer on their own, read during render: a
 * card arriving ({@link useCardRaise}), and a turn ending on a question with no card to
 * show — Half.
 */
function useRaises(
  helper: HelperTurn,
  line: string,
  opensFull: boolean,
  setLow: Dispatch<SetStateAction<Low>>,
  show: SheetController["show"],
) {
  useCardRaise(helper, opensFull, () => setLow("half"), show);
  const [prevStatus, setPrevStatus] = useState(helper.status);
  if (helper.status !== prevStatus) {
    setPrevStatus(helper.status);
    const ended = prevStatus === "working" && helper.status === "ready";
    if (ended && helper.turn.card === null && isQuestion(line)) setLow("half");
    // A turn starting brings a hidden peek back (a retry, a send from a chip).
    if (helper.status === "working") setLow((low) => (low === "hidden" ? "rest" : low));
  }
}

/** Once Half or Full has gone to Peek, focus that fell with it lands on the bar; once
 * the peek has been put away, on the CATalyst tab — never on the body. */
function useFocusPeek(height: DrawerHeight) {
  const prev = useRef(height);
  useEffect(() => {
    const from = prev.current;
    prev.current = height;
    if (document.activeElement !== document.body) return;
    if (height === "peek" && from !== "peek" && from !== "closed") {
      document.getElementById(HELPER_PANEL_ID)?.focus({ preventScroll: true });
    } else if (height === "closed" && from === "peek") {
      document.getElementById(TAB_IDS.catalyst)?.focus({ preventScroll: true });
    }
  }, [height]);
}

/**
 * The drawer's height from the sheet controller and the helper's turn, and the helper
 * with the four acts that drop it to Peek wrapped. `opensFull` says the waiting card
 * draws a change block (`drawsBlock`, F58), which would put Apply under the Half sheet's
 * fold: it opens Full instead.
 */
export function useCatalystDrawer(
  helper: Helper,
  turn: HelperTurn,
  sheet: SheetController,
  opensFull = false,
): CatalystDrawer {
  const [low, setLow] = useState<Low>("rest");
  const line = peekLine(turn, helper.messages);
  useRaises(turn, line, opensFull, setLow, sheet.show);
  const full = sheet.open === "catalyst";
  const started = helper.messages.length > 0 || turn.status === "working";
  const height: DrawerHeight = full
    ? "full"
    : low === "half"
      ? "half"
      : started && low === "rest"
        ? "peek"
        : "closed";
  useFocusPeek(height);

  const toPeek = () => {
    setLow("rest");
    if (full) sheet.close();
  };
  const dropping =
    <A extends unknown[]>(act: (...args: A) => void) =>
    (...args: A) => {
      toPeek();
      act(...args);
    };
  return {
    height,
    line,
    helper: {
      ...helper,
      send: dropping(helper.send),
      retry: dropping(helper.retry),
      applyCard: dropping(helper.applyCard),
      declineCard: dropping(helper.declineCard),
    },
    toFull: () => sheet.show("catalyst"),
    toPeek,
    hide: () => setLow("hidden"),
  };
}
