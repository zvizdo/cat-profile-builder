"use client";
import { useRef, type RefObject } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { HelperStatus, Turn } from "@/core/helper/reducer";
import type { DocumentSession } from "@/ui/builder/use-document";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { useDialogKeys } from "@/ui/shared/dialog-focus";
import { useHydrated, useMediaQuery } from "@/ui/shared/use-media-query";
import { CardSlot } from "./CardSlot";
import { Chips } from "./Chips";
import { CollapsedTab } from "./CollapsedTab";
import { Composer } from "./Composer";
import { greeting } from "./greeting";
import type { HelperLayout } from "./layout";
import { ASSISTANT_TEXT, MessageList } from "./MessageList";
import { PanelHeader } from "./PanelHeader";
import { useCollapse, type Collapse } from "./use-collapse";
import { canSend, type Helper } from "./use-helper";

export type { HelperLayout } from "./layout";

// The helper panel (hi-fi 3a/3b; CONTENT.md → Helper): the column T036 builds in place of
// the placeholder `HelperSlot` held. `helper` (the one `useHelper`/`useChat` instance for
// the whole builder page — F11) is built by `Builder.tsx`, above the full/phone split, and
// handed down here; this panel just renders it, whichever layout is mounted, so
// collapsing only hides the markup and a resize never tears the conversation down
// (CONTENT.md → Collapsed: "the helper remembers where you left off"). Collapsed, the
// column folds to the 52px tab of hi-fi 7b (`CollapsedTab.tsx`, F27) and the canvas takes
// the width — the `flex-1` main beside it in `Builder.tsx` grows by the difference.
//
// F46 (F28 review #1; comp 7b "opens as overlay", 7c "helper as bubble"): the column is
// there at every builder width from 768px. From 1180px it docks beside the canvas; below
// that the tab is the column, and opening it lays the panel over the canvas at the right
// edge (the aside keeps the tab's width, the body is absolute inside it), closed again
// by its toggle or Escape.

/** CONTENT.md → Helper, Locked (FR-032). */
const LOCKED = "Add one photo and I can help.";
/** The locked state's kicker (hi-fi "Helper locked" card), in the label voice. */
const LOCKED_KICKER = "CATalyst locked";

/** Under 1180px (TOKENS.json `breakpoints.touch`) the open column lies over the canvas. */
export const HELPER_OVERLAY_QUERY = "(max-width: 1179px)";

export interface HelperPanelProps {
  session: DocumentSession;
  /** The one helper conversation for the whole page (F11) — built once by `Builder.tsx`
   * above the full/phone split and passed down, so both surfaces render the exact same
   * `useChat` state and a resize can never strand a pending tool call. */
  helper: Helper;
  /** The docked column from 768px (`docked`), or the phone sheet's content (`sheet`). */
  layout?: HelperLayout;
  /** False inside the phone's Half sheet (F45), whose own title row names the panel and
   * carries Close: the panel then starts at the conversation. */
  header?: boolean;
  /** An element id, so a readiness gap only the helper can fill can scroll here. */
  id?: string;
  /** F59: `library.assets`, for a proposal card's photo and removal previews —
   * defaulted to `[]` so every other caller (component tests included) is unaffected. */
  assets?: readonly AssetView[];
}

// The docked column animates its one dimension, width, between the panel and the tab
// (320ms `panel`, DESIGN.md §5) — layout motion, not compositor motion, and deliberately
// so: the canvas reflowing wider *is* what the volunteer asked for. `overflow-hidden` on
// the body clips content laid out at the width the column is heading for, so the motion
// reads as a reveal, not a squeeze. The global reduced-motion rule zeroes the duration:
// it snaps. The sheet's panel has no width of its own: the sheet gives it one.
const SHAPE: Record<HelperLayout, string> = {
  docked:
    "relative flex shrink-0 flex-col border-l border-line-chrome bg-card transition-[width] duration-panel ease-default",
  sheet: "flex min-h-0 flex-1 flex-col",
};

// The column's width, and — docked — the clip that makes the width motion a reveal. The
// overlay's aside is never clipped: its body lies outside the tab's 52px. `unknown` is
// the server's markup and the render that hydrates it: the window has not answered
// yet, so CSS alone gives a window under `wide` the tab's width and hides the body,
// and the first client render after hydration swaps in the state (review round 1,
// finding 4 — the 308px jump a tablet load made).
const COLUMN = {
  open: "w-helper overflow-hidden",
  collapsed: "w-helper-tab overflow-hidden",
  overlay: "w-helper-tab",
  unknown: "w-helper overflow-hidden max-wide:w-helper-tab",
} as const;

// The open body: docked, it fills the column at the open width whatever the column
// measures mid-transition; as an overlay it lies over the canvas from the aside's right
// edge, lifted, on the card ground, with the chrome hairline the docked column has.
const BODY = {
  docked: "flex min-h-0 w-helper flex-1 flex-col overflow-hidden",
  unknown: "flex min-h-0 w-helper flex-1 flex-col overflow-hidden max-wide:hidden",
  overlay:
    "absolute inset-y-0 right-0 z-10 flex w-helper flex-col overflow-hidden border-l border-line-chrome bg-card shadow-lifted",
  sheet: "flex min-h-0 flex-1 flex-col",
} as const;

/**
 * The panel's one display-serif moment (hi-fi "Helper locked" card): the reason is
 * written in the panel itself, in the helper's own first person — no spinner, no greyed
 * mystery, and nothing else: no composer, no chips.
 */
function LockedBody() {
  return (
    <div className="flex flex-col gap-8 px-16 py-20">
      <MonoLabel className="text-meta">{LOCKED_KICKER}</MonoLabel>
      <p className="font-display text-locked-head text-ink">{LOCKED}</p>
    </div>
  );
}

interface ConversationProps {
  session: DocumentSession;
  helper: Helper;
  layout: HelperLayout;
  assets: readonly AssetView[];
}

/**
 * The unlocked panel's live content: the conversation, the current turn, and the
 * composer. `helper` is mounted once, above the full/phone split (F11), for as long as
 * the page is unlocked — visually hidden while collapsed, but never torn down, or "the
 * helper remembers where you left off" (CONTENT.md) would be false.
 */
function Conversation({ session, helper, layout, assets }: ConversationProps) {
  const { state } = session;
  const { turn } = state.helper;
  const emptyPage = state.doc.blocks.length === 1;
  // The composer and chips take input whenever `send` would act on it (`canSend`): ready,
  // or working only because a card is waiting *and* the stream has ended — typing then
  // is "Not this" (F35).
  const composerDisabled = !canSend(state.helper, helper.status);

  // 16px panel padding and 16px between the three things in it (DESIGN.md §3) — only
  // steps the spacing scale has; a step it lacks is silently dropped, and the panel is
  // drawn with none (the F25 audit's first finding). The card slot is the one thing that
  // enters with motion (`enter-panel`, 320ms), and only because a request caused it: it is
  // hidden while empty, so it takes no gap and the animation starts when it fills.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-16 overflow-hidden p-16">
      {/* F49 (F28 review #8): the list only takes its own content's height (no more
          `flex-1`), so `max-h-full` is the backstop that keeps it from ever pushing past
          this column's own bound — the composer stack's `mt-auto` below is what absorbs
          whatever height the list doesn't use. */}
      <MessageList messages={helper.messages} className="max-h-full" />
      <div className="enter-panel shrink-0 empty:hidden">
        <CardSlot session={session} helper={helper} turn={turn} assets={assets} />
      </div>
      <div className="mt-auto flex shrink-0 flex-col gap-8">
        {/* F55 item 6: the one line above the composer while nothing has been said —
            in the helper's reply voice (`ASSISTANT_TEXT`), outside the log, so a screen
            reader is told nothing new. */}
        {helper.messages.length === 0 ? (
          <p className={ASSISTANT_TEXT}>{greeting(state.doc.name, emptyPage)}</p>
        ) : null}
        <Composer disabled={composerDisabled} onSend={helper.send} />
        <Chips
          onSend={helper.send}
          emptyPage={emptyPage}
          layout={layout}
          disabled={composerDisabled}
        />
      </div>
    </div>
  );
}

/** The aside's width and the body's shape for one layout and state (`SHAPE`, `COLUMN`, `BODY`). */
function shellClasses(
  layout: HelperLayout,
  overlay: boolean | "unknown",
  collapsed: boolean,
  toggled: boolean,
): { column: string; body: string } {
  const fade = toggled ? " enter-panel" : "";
  if (layout === "sheet") return { column: "", body: BODY.sheet + fade };
  if (overlay === "unknown") return { column: COLUMN.unknown, body: BODY.unknown };
  if (overlay) return { column: COLUMN.overlay, body: BODY.overlay + fade };
  return { column: COLUMN[collapsed ? "collapsed" : "open"], body: BODY.docked + fade };
}

/** Escape folds an open overlay (F46), the way it closes any surface laid over the page:
 * a surface on the dialog stack (no trap), so a modal opened over it takes the key first
 * (review round 1, finding 3). */
function useOverlayEscape(
  active: boolean,
  collapse: Collapse,
  root: RefObject<HTMLElement | null>,
) {
  useDialogKeys(active, collapse.dismiss, root, { trap: false });
}

/** The shell's state for one layout: whether it overlays, whether it is folded, its classes. */
function useShell(
  layout: HelperLayout,
  status: HelperStatus,
  turn: Turn,
  root: RefObject<HTMLElement | null>,
) {
  const docked = layout === "docked";
  const overlay = useMediaQuery(HELPER_OVERLAY_QUERY) && docked;
  const known = useHydrated() || !docked;
  const collapse = useCollapse(status, turn, root, overlay);
  const collapsed = docked && collapse.collapsed;
  useOverlayEscape(overlay && !collapsed, collapse, root);
  return {
    docked,
    collapse,
    collapsed,
    ...shellClasses(layout, known ? overlay : "unknown", collapsed, collapse.toggled),
  };
}

// F59, review round 1 N7: one shared empty array, not a fresh `[]` per render — every
// caller without a library yet (most component tests) would otherwise give
// `useCardPreviews`'s memo a new `assets` reference on every render, recomputing for no
// reason.
const NO_ASSETS: readonly AssetView[] = [];

/** F59: `props.assets`, or `NO_ASSETS` before the caller has a library to hand it — its
 * own function so the branch is not one more of `HelperPanel`'s own. */
function assetsOf(props: HelperPanelProps): readonly AssetView[] {
  return props.assets ?? NO_ASSETS;
}

/**
 * The helper's column (T036): the header always shows; the body is the locked sentence or
 * the live conversation — or, collapsed on the docked layout, the whole column is the
 * 52px tab (hi-fi 7b, F27). `helper` (F11: one `useHelper`/`useChat` instance per page,
 * built by `Builder.tsx` above the full/phone split) outlives `collapsed`, and outlives
 * this component too if a resize swaps it out for the other surface's own `HelperPanel`
 * — collapsing only hides the markup (the `hidden` attribute, so the tab's own screen is
 * free of an off-screen composer a screen reader could still tab into).
 *
 * In the sheet (design 2026-09-13 §4) there is no toggle and no tab: the sheet's own
 * Close is the way out, and the panel is never hidden while the sheet is up.
 */
export function HelperPanel(props: HelperPanelProps) {
  const { session, helper, layout = "docked", header = true, id } = props;
  const assets = assetsOf(props);
  const { status, turn } = session.state.helper;
  const locked = status === "locked";
  const root = useRef<HTMLDivElement>(null);
  const { docked, collapse, collapsed, column, body } = useShell(layout, status, turn, root);

  // Docked, the root is the `aside` landmark; in a sheet the sheet itself is the named
  // landmark (a dialog at Full, a region at Half), so the root is a plain `div` — two
  // nested landmarks of one name would list twice (review round 1, finding 6).
  const Root = docked ? "aside" : "div";
  return (
    // `tabIndex={-1}`: F9's own read-only lock moves focus here (by `id`) when it engages
    // over a canvas control that had it — the composer is disabled for the same turn, so
    // this root is the one thing in the column guaranteed reachable throughout.
    <Root
      ref={root}
      id={id}
      tabIndex={-1}
      aria-label={docked ? "CATalyst AI Assistant" : undefined}
      className={`${SHAPE[layout]} ${column}`}
    >
      {collapsed ? (
        <CollapsedTab
          suggestions={turn.card === null ? 0 : 1}
          unread={collapse.unread}
          onOpen={collapse.toggle}
        />
      ) : null}
      {/* Fades in (`enter-panel`) only once a press has reopened it. */}
      <div hidden={collapsed} data-helper-body="" className={body}>
        {header ? (
          <PanelHeader
            showToggle={docked && !locked}
            working={status === "working"}
            onToggle={collapse.toggle}
          />
        ) : null}
        {locked ? (
          <LockedBody />
        ) : (
          <Conversation session={session} helper={helper} layout={layout} assets={assets} />
        )}
      </div>
    </Root>
  );
}
