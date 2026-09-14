import { DASHED_BOX, LINK_BUTTON } from "./styles";

// CONTENT.md → Helper, Failure (adapted; FR-040/046): a single tool call that fails
// validation tells the volunteer at once, in plain language naming the reason — never
// waiting for the turn to end, and never a card, since nothing was ever proposed to Apply
// or decline (the document was already untouched, and stays that way). Same dashed-box
// voice as the turn's own failure summary (DESIGN.md §4) — the same `DASHED_BOX` (styles.ts).

export interface RefusedNoticeProps {
  /** `applyOperation`'s own reason the change did not validate. */
  reason: string;
  onRetry: () => void;
}

/**
 * `sentence` with its first letter lowered (F28 review #15): `reason` is core's own full
 * sentence, capitalised to stand alone — joined here after a dash, mid-sentence, it reads
 * in sentence case instead. Only ever applied to this one clause; `reason` itself, and
 * every other place it is shown standing alone, keeps its own capital.
 */
function lowerFirst(sentence: string): string {
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

export function RefusedNotice({ reason, onRetry }: RefusedNoticeProps) {
  return (
    <div className={DASHED_BOX}>
      {/* `reason` (`applyOperation`'s own `OperationError.reason`) always ends in its own
          period — never add a second one after it. */}
      <p className="text-ui-dense font-normal text-body">
        {`I couldn't apply that — ${lowerFirst(reason)} Nothing on your page changed.`}
      </p>
      <button type="button" className={LINK_BUTTON} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
