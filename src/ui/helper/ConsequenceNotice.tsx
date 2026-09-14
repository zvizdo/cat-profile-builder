// CONTENT.md → Helper, Consequence; DESIGN.md §4 ("consequence notice as a 3px clay left
// border on paper"). `turn.card` is only ever raised for a destructive edit — T036's
// `handleToolCall` opens it exactly inside the `if (destructive)` branch `describeOperation`
// decides — so whenever this renders, the heading already names what will be lost; `detail`
// is `describeOperation`'s own `Description.detail` (T038 review, finding 2): CONTENT.md's
// verbatim "You wrote that paragraph. …" for the bio's authored-text loss, the generic "The
// original is recoverable with one undo, and only one." for every other destructive branch.
// This component never guesses which — `describe.ts` already knows, per branch, whether the
// loss is authored text, a photo, a gallery id or a card.

export interface ConsequenceNoticeProps {
  /** The consequence half of `describeOperation`'s summary — its own last sentence. */
  heading: string;
  /** `describeOperation`'s own `Description.detail` for this op. */
  detail: string;
}

export function ConsequenceNotice({ heading, detail }: ConsequenceNoticeProps) {
  return (
    <div className="edge-clay flex flex-col gap-6 bg-paper px-12 py-12">
      <p className="text-ui-dense font-medium text-ink">{heading}</p>
      <p className="text-ui-dense font-normal text-body">{detail}</p>
    </div>
  );
}
