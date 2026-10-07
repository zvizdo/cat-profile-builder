import type { EditState } from "@/core/fundraiser/edit-session";
import { Button } from "@/ui/shared/Button";
import styles from "@/ui/fundraiser/fundraiser.module.css";
import { amountRefusal, EDIT, headlineRefusal } from "@/ui/fundraiser/strings";
import type { DoneProps } from "@/ui/fundraiser/use-edit-session";

/**
 * The ids of the refusal sentences. A refused field points at its sentence with
 * `aria-describedby`, so the sentence and the field must agree on the id.
 */
export const REFUSAL_ID = {
  raised: "fundraiser-refusal-raised",
  goal: "fundraiser-refusal-goal",
  headline: "fundraiser-refusal-headline",
} as const;

/** One refusal sentence, with the name of its field when more than one is showing. */
interface Line {
  id: string;
  lead?: string;
  text: string;
}

/**
 * The sentences a session's refusals call for. When both amount fields were refused each one
 * leads with its field's name, because two refusals can be the same words ("Type an amount").
 */
function refusalLines(state: EditState): Line[] {
  if (state.kind === "headline") {
    return state.refusal ? [{ id: REFUSAL_ID.headline, text: headlineRefusal(state.refusal) }] : [];
  }
  if (state.kind !== "amounts") return [];
  const { raised, goal } = state.refusals;
  const both = raised !== undefined && goal !== undefined;
  const lines: Line[] = [];
  for (const [name, code, lead] of [
    ["raised", raised, EDIT.raisedLabel],
    ["goal", goal, EDIT.goalLabel],
  ] as const) {
    if (code === undefined) continue;
    lines.push({ id: REFUSAL_ID[name], ...(both ? { lead } : {}), text: amountRefusal(code) });
  }
  return lines;
}

export interface EditRowProps {
  /** The session. Nothing is drawn in the row unless one is open. */
  state: EditState;
  /** The Done button's handlers, from `useEditSession`. */
  done: DoneProps;
}

/**
 * The shared edit row: a reserved, fixed-height row under the goal line that exists in every
 * mode and is empty when nothing is open, so opening a session or entering full screen never
 * moves anything. While a session is open it holds Done and an alert for the refusal sentence;
 * the alert is there from the start, empty, so a sentence that arrives is announced.
 */
export function EditRow({ state, done }: EditRowProps) {
  if (state.kind === "idle") return <div className={styles.editRow} data-edit-row />;
  return (
    <div className={styles.editRow} data-edit-row>
      <Button variant="primary" dense className={styles.doneButton} {...done}>
        {EDIT.done}
      </Button>
      <p role="alert" className={styles.refusal}>
        {refusalLines(state).map((line) => (
          <span key={line.id}>
            {line.lead ? `${line.lead}: ` : null}
            <span id={line.id}>{line.text}</span>{" "}
          </span>
        ))}
      </p>
    </div>
  );
}
