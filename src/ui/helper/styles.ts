// The two class strings the helper's cards and notices share (F26 review, finding 8) —
// one place, so the link voice and the dashed box can never drift between the card's
// own later states (`ProposalCard.tsx`), the turn summary and the refusal.

/** A link-shaped action in the reading mono voice: blue, underlined on hover, a blue
 * outline for keyboard focus. Every "Undo these" / "Try again" / "show the suggestion
 * again" speaks it. */
export const LINK_BUTTON =
  "self-start font-label text-mono-label tracking-normal text-blue hover:underline " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";

/** The dashed box (DESIGN.md §4, `line-button` .28, panel radius, 12px): what a failure,
 * a refusal, a dismissed card and an undone turn speak from — nothing of it stands on
 * the page. */
export const DASHED_BOX =
  "flex flex-col gap-8 rounded-panel border border-dashed border-line-button px-12 py-12";
