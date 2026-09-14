"use client";
import { useId, type KeyboardEvent, type Ref } from "react";
import { Field } from "@/ui/shared/Field";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { Textarea } from "@/ui/shared/Textarea";
import { useDraftField } from "./use-draft-field";
import { useWorkingLock } from "../working-lock";

// A labelled one-line field over one document text (T025): the shared `Field` with the
// draft behaviour of `useDraftField`, the schema's cap mirrored as `maxLength` so the
// volunteer sees where it stops, and — when asked — a `{n}/80` counter in the reading
// voice. Enter commits without leaving the field.

export interface DraftFieldProps {
  /** A fixed element id, for a field something else must find (the name); generated otherwise. */
  id?: string;
  label: string;
  /** What the document holds now. */
  value: string;
  /** The cap from `FIELD_LIMITS`; the schema is what refuses, this only shows it. */
  maxLength: number;
  onCommit: (value: string) => void;
  /** Show the `{n}/{max}` counter (the tagline). */
  counter?: boolean;
  placeholder?: string;
  ref?: Ref<HTMLInputElement>;
}

/** One line of text with its label, cap and draft behaviour. F9: disabled while the
 * helper works, like every other edit control — this one field covers the facts, every
 * caption and every card title in one place. */
export function DraftField(props: DraftFieldProps) {
  const { label, value, maxLength, onCommit, counter = false, placeholder, ref } = props;
  const generated = useId();
  const id = props.id ?? generated;
  const draft = useDraftField(value, onCommit);
  const working = useWorkingLock();
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      draft.flush();
    }
  };
  return (
    <div className="relative">
      <Field
        id={id}
        name={id}
        label={label}
        value={draft.value}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={working}
        ref={ref}
        onChange={(event) => draft.onChange(event.target.value)}
        onBlur={draft.flush}
        onKeyDown={onKeyDown}
      />
      {counter ? (
        <MonoLabel
          variant="reading"
          className="absolute top-0 right-0 text-meta"
          aria-live="polite"
        >
          {draft.value.length}/{maxLength}
        </MonoLabel>
      ) : null}
    </div>
  );
}

export interface DraftTextareaProps {
  label: string;
  value: string;
  maxLength: number;
  onCommit: (value: string) => void;
  placeholder?: string;
}

/** A few lines of text with the same label, cap and draft behaviour; Enter makes a new line. */
export function DraftTextarea(props: DraftTextareaProps) {
  const { label, value, maxLength, onCommit, placeholder } = props;
  const id = useId();
  const draft = useDraftField(value, onCommit);
  const working = useWorkingLock();
  return (
    <Textarea
      id={id}
      name={id}
      label={label}
      value={draft.value}
      maxLength={maxLength}
      placeholder={placeholder}
      disabled={working}
      onChange={(event) => draft.onChange(event.target.value)}
      onBlur={draft.flush}
    />
  );
}
