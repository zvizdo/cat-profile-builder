"use client";
import { useEffect, useId, useRef } from "react";
import type { RefObject } from "react";
import type { HeadlineReason } from "@/core/fundraiser/fundraiser";
import { codePointLength, fitStep, HEADLINE_FIT } from "@/core/fundraiser/fit";
import { REFUSAL_ID } from "@/ui/fundraiser/EditRow";
import type { FieldHandlers } from "@/ui/fundraiser/Figures";
import { InPlaceField } from "@/ui/fundraiser/InPlaceField";
import { EDIT } from "@/ui/fundraiser/strings";
import type { OpenerProps } from "@/ui/fundraiser/use-edit-session";
import styles from "@/ui/fundraiser/fundraiser.module.css";

/** What the open `headline` session holds: the draft as text and what was last refused. */
export interface HeadlineEditing {
  text: string;
  refusal?: HeadlineReason | undefined;
}

export interface HeadlineFieldProps {
  /** The headline on show (the confirmed one), as plain text. */
  headline: string;
  /** The open `headline` session, or `null` while the headline is only a heading. */
  editing: HeadlineEditing | null;
  /** The editing view: false in display state, where the heading is a bare text node. */
  canEdit: boolean;
  /** The button's `ref` and `onClick`, from `useEditSession().headlineButton`. */
  button: OpenerProps;
  field: FieldHandlers;
}

/**
 * Puts the caret after the text and focuses the control as the field appears. The person
 * just chose to edit the headline; making them aim again at the very words they pressed would
 * be a second step for nothing, and the session cancels a field that lost focus to the page.
 */
function useFocusOnOpen(box: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const control = box.current?.querySelector("textarea");
    if (!control) return;
    control.focus();
    control.setSelectionRange(control.value.length, control.value.length);
  }, [box]);
}

/** The headline's in-place field: the same `InPlaceField` as the amounts, in the headline's own box. */
function Editor({ editing, field }: { editing: HeadlineEditing; field: FieldHandlers }) {
  const box = useRef<HTMLSpanElement>(null);
  useFocusOnOpen(box);
  return (
    <span className={styles.headlineBox} ref={box} data-headline>
      <InPlaceField
        kind="wrap"
        label={EDIT.headlineLabel}
        value={editing.text}
        onChange={(text) => field.onChange("headline", text)}
        onConfirm={field.onConfirm}
        onCancel={field.onCancel}
        invalid={editing.refusal !== undefined}
        describedBy={REFUSAL_ID.headline}
      />
    </span>
  );
}

/**
 * The one `<h1>`. In the editing view its words are a button, named by those words (WCAG 2.5.3)
 * and described as "Edit headline"; pressing it opens the headline field in the same place, at
 * the same size. While the field is open the button stays in the page but out of reach (its
 * focus return after a keyboard close needs it there) and the heading's size follows the draft,
 * so a long entry never clips. In display state it is the text and nothing else.
 */
export function HeadlineField(props: HeadlineFieldProps) {
  const { headline, editing, canEdit, button, field } = props;
  const hintId = useId();
  const shown = editing ? editing.text : headline;
  const fit = fitStep(codePointLength(shown), HEADLINE_FIT);
  if (!canEdit) {
    return (
      <h1 className={styles.headline} data-fit={fit}>
        {headline}
      </h1>
    );
  }
  return (
    <>
      <h1 className={styles.headline} data-fit={fit}>
        <button
          type="button"
          className={
            editing ? `${styles.headlineButton} ${styles.headlineAway}` : styles.headlineButton
          }
          aria-describedby={editing ? undefined : hintId}
          aria-hidden={editing ? true : undefined}
          tabIndex={editing ? -1 : undefined}
          {...button}
        >
          {headline}
        </button>
        {editing ? <Editor editing={editing} field={field} /> : null}
      </h1>
      <span id={hintId} className={styles.srOnly}>
        {EDIT.headlineHint}
      </span>
    </>
  );
}
