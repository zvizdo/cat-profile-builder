"use client";
import { useEffect, useRef } from "react";
import type { ChangeEvent, KeyboardEvent, PointerEvent, RefObject } from "react";
import styles from "@/ui/fundraiser/fundraiser.module.css";

/** What the on-screen keyboard should offer; passed straight to the control. */
type InputMode = "text" | "decimal" | "numeric";

export interface InPlaceFieldProps {
  /** `line` is one `<input>` (the amounts); `wrap` is a one-row `<textarea>` that wraps (the headline). */
  kind: "line" | "wrap";
  /** The control's accessible name, such as "Amount raised". */
  label: string;
  /** The text now in the field. The parent owns it; every change comes back through `onChange`. */
  value: string;
  /** The new text after a keystroke or paste. Line breaks are already single spaces. */
  onChange(next: string): void;
  /** Enter was pressed (outside an input method's composition). Blur never confirms. */
  onConfirm(): void;
  /** Escape was pressed (outside an input method's composition). */
  onCancel(): void;
  /** The id of the refusal sentence; only attached while `invalid`, so it never points at nothing. */
  describedBy?: string;
  /** The text was refused at confirm: sets `aria-invalid` and attaches `describedBy`. */
  invalid?: boolean;
  inputMode?: InputMode;
  /** Sizes the text: the caller's class gives the same font and line height as the display text it replaces. */
  className?: string;
}

/** A pasted or typed line break becomes one space, so the text is always one line of words. */
const LINE_BREAKS = /\r\n|[\r\n]/g;

/** An input method's keystroke: Safari reports the Enter that ends a composition as keyCode 229 after `compositionend`. */
const IME_KEY_CODE = 229;

/**
 * A virtual keyboard's Enter (Android) often arrives as keyCode 229 with no usable `key`, and
 * only `beforeinput` says what it is. React's own onBeforeInput is built from keypress and
 * carries no inputType, so this listens to the native event, once, on the box around the control.
 * A composing line break belongs to the input method and is left alone.
 */
function useConfirmOnLineBreak(box: RefObject<HTMLElement | null>, onConfirm: () => void): void {
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const beforeInput = (event: Event): void => {
      if (!(event instanceof InputEvent) || event.isComposing) return;
      if (event.inputType !== "insertLineBreak" && event.inputType !== "insertParagraph") return;
      event.preventDefault();
      onConfirm();
    };
    element.addEventListener("beforeinput", beforeInput);
    return () => element.removeEventListener("beforeinput", beforeInput);
  }, [box, onConfirm]);
}

/**
 * Replaces line breaks in the control's text with spaces and returns the clean text.
 * Handing React a string that differs from the DOM's would make it write the DOM value itself,
 * which throws the caret to the end; writing it here first, with the caret put back (measured
 * on the cleaned text before it), leaves React nothing to rewrite.
 */
function cleanText(control: HTMLInputElement | HTMLTextAreaElement): string {
  const raw = control.value;
  const clean = raw.replace(LINE_BREAKS, " ");
  if (clean === raw) return clean;
  const start = control.selectionStart ?? raw.length;
  const end = control.selectionEnd ?? start;
  control.value = clean;
  control.setSelectionRange(
    raw.slice(0, start).replace(LINE_BREAKS, " ").length,
    raw.slice(0, end).replace(LINE_BREAKS, " ").length,
  );
  return clean;
}

/**
 * The hidden copy of the control's text that gives the cell its size. After the text it keeps
 * the caret's room as a hairline-wide box (the stylesheet takes the same hairline back), because
 * a space would be a quarter of the text's size wide: it pushes the words after the field along,
 * or, in a centred heading, shifts the whole line when the field opens. An empty field keeps a
 * width the same way.
 */
function Mirror({ value }: { value: string }) {
  return (
    <span className={styles.fieldMirror} aria-hidden="true">
      {value}
      <span className={styles.fieldCaretRoom} data-caret-room />
    </span>
  );
}

/**
 * A real input or textarea that stands exactly where display text was, with no layout shift.
 * It sits in the same grid cell as a hidden copy of its own text, so the cell is as wide (and,
 * for `wrap`, as tall) as the text without measuring anything. Enter confirms and never inserts
 * a newline; Escape cancels; line breaks in pasted text become spaces and the caret stays where
 * the paste ended. It holds no rules of its own: what counts as a valid entry is decided in
 * core, and the session hook decides what blur means.
 */
export function InPlaceField(props: InPlaceFieldProps) {
  const { kind, label, value, onChange, onConfirm, onCancel, describedBy, invalid, inputMode } =
    props;
  const { className } = props;
  const outerRef = useRef<HTMLSpanElement>(null);
  useConfirmOnLineBreak(outerRef, onConfirm);

  const change = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    onChange(cleanText(event.currentTarget));
  };

  // An input method uses Enter and Escape to finish or abandon a composition; taking them
  // here would cut off a Japanese or Chinese entry, so they are left to the method.
  const keyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === IME_KEY_CODE) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onConfirm();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  const shared = {
    className: styles.fieldControl,
    "aria-label": label,
    "aria-invalid": invalid ? true : undefined,
    "aria-describedby": invalid ? describedBy : undefined,
    value,
    onChange: change,
    onKeyDown: keyDown,
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    enterKeyHint: "done",
    inputMode,
  } as const;

  // The stylesheet draws a taller pointer hit area on the box around a one-line control (a
  // pseudo-element, so no pixel moves). A press that lands on the box itself and not on the
  // control is sent to the control, as a press on the control would have been.
  const press = (event: PointerEvent<HTMLSpanElement>): void => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    event.currentTarget.querySelector<HTMLElement>("input, textarea")?.focus();
  };

  const outer = [styles.field, kind === "wrap" ? styles.fieldWrap : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={outer} ref={outerRef} onPointerDown={press}>
      <Mirror value={value} />
      {kind === "wrap" ? <textarea rows={1} {...shared} /> : <input type="text" {...shared} />}
    </span>
  );
}
