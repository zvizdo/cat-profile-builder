import type { AmountRefusals, EditField } from "@/core/fundraiser/edit-session";
import { AMOUNT_FIT, codePointLength, fitStep } from "@/core/fundraiser/fit";
import type { MeterParts } from "@/ui/fundraiser/strings";
import { DISPLAY, EDIT } from "@/ui/fundraiser/strings";
import { REFUSAL_ID } from "@/ui/fundraiser/EditRow";
import { InPlaceField } from "@/ui/fundraiser/InPlaceField";
import styles from "@/ui/fundraiser/fundraiser.module.css";

/** What the open `amounts` session holds: the two drafts as text and what was last refused. */
export interface AmountsEditing {
  raised: string;
  goal: string;
  refusals: AmountRefusals;
}

/** The three callbacks every in-place field takes, as `useEditSession` hands them out. */
export interface FieldHandlers {
  onChange(field: EditField, text: string): void;
  onConfirm(): void;
  onCancel(): void;
}

export interface FiguresProps {
  /** The formatted amount raised and goal of the fundraiser on show (`describeProgress`). */
  parts: MeterParts;
  /** The open `amounts` session, or `null` while the figures are plain text. */
  editing: AmountsEditing | null;
  field: FieldHandlers;
}

type FieldName = "raised" | "goal";

/** One amount field: its name, its draft, its refusal wiring, and the session's callbacks. */
function AmountField({
  name,
  editing,
  field,
}: {
  name: FieldName;
  editing: AmountsEditing;
  field: FieldHandlers;
}) {
  return (
    <InPlaceField
      kind="line"
      label={name === "raised" ? EDIT.raisedLabel : EDIT.goalLabel}
      value={editing[name]}
      onChange={(text) => field.onChange(name, text)}
      onConfirm={field.onConfirm}
      onCancel={field.onCancel}
      invalid={editing.refusals[name] !== undefined}
      describedBy={REFUSAL_ID[name]}
      inputMode="decimal"
    />
  );
}

/**
 * The amount raised and the goal line: the figures, and the region a mouse hovers to open them
 * (`data-figures`). While an `amounts` session is open each figure's text is replaced by an
 * in-place field in the same element, so the size, position and spacing are the display's own.
 * The amount steps its size by the draft being typed, as the committed one will, so a long entry
 * gets smaller instead of running out of the column. Everything else is plain text.
 */
export function Figures({ parts, editing, field }: FiguresProps) {
  const raisedText = editing ? editing.raised : parts.raised;
  const raisedFit = fitStep(codePointLength(raisedText), AMOUNT_FIT);
  return (
    <div className={styles.figures} data-figures>
      <p className={styles.amount} data-raised data-fit={raisedFit}>
        {editing ? <AmountField name="raised" editing={editing} field={field} /> : parts.raised}
      </p>
      <p className={styles.goalLine} data-goal-line>
        <span>
          {DISPLAY.raisedOf}{" "}
          <b className={styles.goalFigure}>
            {editing ? <AmountField name="goal" editing={editing} field={field} /> : parts.goal}
          </b>{" "}
          {DISPLAY.goalWord}
        </span>
        {parts.reached ? <span className={styles.pill}>{DISPLAY.goalReached}</span> : null}
      </p>
    </div>
  );
}
