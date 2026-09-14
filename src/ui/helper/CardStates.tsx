"use client";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { notAppliedLine } from "./card-text";
import { DASHED_BOX, LINK_BUTTON } from "./styles";

// T038 review, finding 1 ("the card itself owns its resolved states, independent of the
// turn summary"): once the reducer's `cardResolution(turn, toolCallId)` says the card was
// declined, the card's own slot keeps showing something — `DismissedCard`, or
// `NotAppliedNote` under the turn's summary when the same turn had already applied an
// edit (F26) — rather than handing off to `TurnSummary`, which only ever knew how to
// summarise a *whole* turn and would render nothing for "declined, nothing else
// happened". `CardSlot.tsx` is what actually switches between them. They lived in
// `ProposalCard.tsx` as the same card's own later states until F58 grew the card past the
// component ceiling; they are still that, in a file of their own.

/** CONTENT.md → Helper, Dismissed. */
const DISMISSED = "Left as it was. Nothing on your page changed.";

export interface DismissedCardProps {
  /**
   * Re-sends the volunteer's last request (the same function `TurnSummary`'s "Try again"
   * already uses) — the declined tool output has already reached the model, so "again"
   * here means asking it to propose something for this same request over again, not
   * retrying a failed call.
   */
  onReopen: () => void;
}

/** What the card's own slot shows once its op comes back `declined` (T038 review, finding
 * 1) and nothing else happened this turn — CONTENT.md's Dismissed state, in place of the
 * card, for as long as nothing newer has happened. Its "Nothing on your page changed." is
 * only ever true when the turn applied nothing; otherwise `NotAppliedNote` speaks. */
export function DismissedCard({ onReopen }: DismissedCardProps) {
  return (
    <div className={DASHED_BOX}>
      <p className="text-ui-dense font-normal text-body">{DISMISSED}</p>
      <button type="button" className={LINK_BUTTON} onClick={onReopen}>
        show the suggestion again
      </button>
    </div>
  );
}

export interface NotAppliedNoteProps extends DismissedCardProps {
  /** The declined card's own summary, as `describeOperation` gave it. */
  summary: string;
}

/** The declined card's one-line note under the turn's summary (F26, audit §3.6) — for a
 * turn that applied an edit *and* carded one the volunteer declined: "Not applied:
 * shortening the bio." with the same reopen link, so the applied edit's "Applied — …"
 * and its "Undo these" stay in view and nothing claims the page is unchanged. */
export function NotAppliedNote({ summary, onReopen }: NotAppliedNoteProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-16 gap-y-4">
      <MonoLabel as="p" variant="reading" className="text-meta">
        {notAppliedLine(summary)}
      </MonoLabel>
      <button type="button" className={LINK_BUTTON} onClick={onReopen}>
        show the suggestion again
      </button>
    </div>
  );
}
