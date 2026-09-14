import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { cardTarget, taggedBlocks, type PendingCard, type Turn } from "@/core/helper/reducer";
import type { ProfileDocument } from "@/core/profile/schema";
import { locateBlock, PULSE_MS, scrollToBlock } from "./follow-target";
import type { DocumentState } from "./use-document";

// F34, "follow, then overview" (FR-042): as each helper edit lands, the canvas scrolls the
// block it touched into the middle of the view and blinks it; when the turn ends the
// canvas goes back to the first block the turn touched, so the volunteer is left looking
// at the start of what changed rather than the end. The reducer's `turn.touched` grows
// by one block per edit (deduplicated, T036/F34), so the entries past what this hook has
// already followed are exactly the ones just landed. Everything here answers a change on
// the page — DESIGN.md §5: the builder responds, never animates on its own.
//
// F60 adds a second, smaller follow: a pending card (`turn.card`) names one block too —
// the block the volunteer is being asked about — and the canvas reveals it once per card
// (keyed by `toolCallId`) the same way, so the "where" is on screen while the "what" sits
// in the card. This never touches `touched`: a card that is declined leaves no tag, and
// the turn-end overview is unaffected either way (design 2026-09-13 §4).

/** The slice of the session the follow reads. */
export type FollowState = Pick<DocumentState, "doc" | "history" | "helper">;

/** Scrolls to and blinks one block, from wherever names it — the panel's change list. */
export type RevealBlock = (blockId: string) => void;

/** What the canvas draws from: which frames blink (by a count that changes for every new
 * blink, so a frame can start over), which wear the tag, and the way to ask for more. */
export interface Follow {
  pulsing: ReadonlyMap<string, number>;
  tagged: ReadonlySet<string>;
  reveal: RevealBlock;
}

/** The blinks in flight, each ended by its own timer unless a newer blink replaced it. */
function usePulses() {
  const [pulsing, setPulsing] = useState<ReadonlyMap<string, number>>(new Map());
  const count = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const pulse = useCallback((blockId: string) => {
    count.current += 1;
    const nonce = count.current;
    setPulsing((current) => new Map(current).set(blockId, nonce));
    clearTimeout(timers.current.get(blockId));
    timers.current.set(
      blockId,
      setTimeout(() => {
        timers.current.delete(blockId);
        setPulsing((current) => {
          if (current.get(blockId) !== nonce) return current;
          const next = new Map(current);
          next.delete(blockId);
          return next;
        });
      }, PULSE_MS),
    );
  }, []);

  const clear = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    setPulsing(new Map());
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);
  return { pulsing, pulse, clear };
}

/**
 * A pending card's own reveal (F60): scrolls to and blinks the block it names, once per
 * card (`toolCallId`) — a re-render of the same waiting card, and the card clearing on
 * Apply or Not this, both do nothing. `latestDoc` is the same committed-document ref
 * {@link useFollowHelper} keeps for its other two effects, so this reads the document as
 * it stood when the card was raised, not a stale closure.
 */
function useCardFollow(
  card: PendingCard | null,
  turn: Turn,
  latestDoc: RefObject<ProfileDocument>,
  reveal: RevealBlock,
): void {
  const followedCard = useRef<string | null>(null);
  useEffect(() => {
    const id = card?.toolCallId ?? null;
    if (id === followedCard.current) return;
    followedCard.current = id;
    if (card === null) return;
    const target = cardTarget(latestDoc.current, turn);
    if (target !== null) reveal(target);
  }, [card, turn, latestDoc, reveal]);
}

/**
 * The canvas's follow of the helper (F34). `pulsing` and `tagged` go to the frames;
 * `reveal` goes to the panel through `RevealProvider`, so a line of the change list can
 * bring its block back into view with the same scroll and the same blink.
 */
export function useFollowHelper(state: FollowState): Follow {
  const { doc } = state;
  const { touched, outcome, card } = state.helper.turn;
  const { pulsing, pulse, clear } = usePulses();
  const followed = useRef(0);
  const lastFollowAt = useRef(0);
  // The document as committed, for the effects and timers below: the overview must not
  // re-run on every later manual edit, which a `doc` dependency would make it do. Set in
  // an effect declared first, so the follow effect under it always reads this render's.
  const latest = useRef(doc);
  useEffect(() => {
    latest.current = doc;
  }, [doc]);

  const reveal = useCallback<RevealBlock>(
    (blockId) => {
      const element = locateBlock(blockId);
      if (element === null) return;
      scrollToBlock(element);
      pulse(blockId);
      lastFollowAt.current = Date.now();
    },
    [pulse],
  );

  // Follow: every touched block past the ones already followed has just landed.
  useEffect(() => {
    if (touched.length < followed.current) {
      // A new turn (`createTurn` on `send`): whatever the last one left blinking is stale.
      followed.current = 0;
      clear();
    }
    const landed = touched.slice(followed.current);
    followed.current = touched.length;
    for (const blockId of landed) reveal(blockId);
  }, [touched, reveal, clear]);

  // Card follow (F60): `card` is only ever non-null while `status` is `working` and every
  // editor is locked (F9), so nothing the volunteer does can move the document under this.
  useCardFollow(card, state.helper.turn, latest, reveal);

  // Overview: once the turn has ended, back to the first block it touched — after the
  // last blink has had its say, so the final edit is seen before the view leaves it.
  useEffect(() => {
    const first = touched[0];
    if (outcome === null || first === undefined) return;
    const wait = Math.max(0, lastFollowAt.current + PULSE_MS - Date.now());
    const timer = setTimeout(() => {
      const element = locateBlock(first);
      if (element !== null) scrollToBlock(element);
    }, wait);
    return () => clearTimeout(timer);
  }, [outcome, touched]);

  const tagged = useMemo(
    () => new Set(taggedBlocks({ history: state.history, turn: state.helper.turn })),
    [state.history, state.helper.turn],
  );
  return { pulsing, tagged, reveal };
}
