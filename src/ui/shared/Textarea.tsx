import type { Ref, TextareaHTMLAttributes } from "react";
import { fieldErrorId, LABEL_CLASSES } from "./Field";

// A labelled multi-line field in the same token language as `Field` (DESIGN.md §4): same
// radius, hairline, padding and blue focus ring, so a caption box and the media description
// read as the same control family as a one-line field — never a smaller, denser cousin of
// it. Rows are fixed rather than a browser resize grip: the shape a volunteer sees is the
// shape the block keeps, on every screen and every browser.

// The two sizes: the general 15px field, or the dense-chrome 13px one (DESIGN.md §2) that
// grows with what is typed — `rows` is its floor, 120px (about four lines) its ceiling —
// for the helper's composer, where a fixed two-line box would sit empty most of the time.
const SIZE_DEFAULT = "text-ui";
const SIZE_DENSE = "max-h-120 field-sizing-content text-ui-dense";

/** The textarea's classes: `Field`'s input classes, plus a fixed height (`resize-none`,
 * the caller sets `rows`) and the extra line-height a sentence or two of prose wants. */
export function textareaClasses(wrong: boolean, dense = false): string {
  const border = wrong ? "border-clay" : "border-line-field hover:border-blue";
  const size = dense ? SIZE_DENSE : SIZE_DEFAULT;
  return `w-full resize-none rounded-control border bg-card px-16 py-12 font-text font-normal leading-relaxed text-ink placeholder:text-meta transition-[border-color,box-shadow] duration-hover ease-default focus:border-blue focus:shadow-focus-ring focus:outline-none disabled:opacity-50 ${size} ${border}`;
}

/** What a textarea needs; anything else a `textarea` takes passes through. */
export interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "name" | "aria-describedby"
> {
  id: string;
  name: string;
  label: string;
  /** Keeps `label` as the accessible name but takes it off the page — the media description
   * says what it is through the block around it, not a repeated heading. */
  hideLabel?: boolean;
  /** The sentence to show under the field; rendered as an alert and tied to the textarea. */
  error?: string;
  /** Marks the field wrong without its own sentence — when one message covers several fields. */
  invalid?: boolean;
  /** Extra `aria-describedby` targets, such as a notice sitting above the field. */
  describedBy?: string;
  /** Fixed row count; `Field`'s radius and padding are the shape, this is the height. */
  rows?: number;
  /** The dense-chrome size: 13px, and the box grows from `rows` with what is typed. */
  dense?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

/**
 * Label, textarea and error slot as one accessible unit, matching `Field` exactly: the
 * label is tied to the textarea by `id`, an error is announced (`role="alert"`) and named
 * in `aria-describedby`, and `aria-invalid` is set whenever the field is wrong for any
 * reason.
 */
export function Textarea({
  id,
  name,
  label,
  hideLabel = false,
  error,
  invalid = false,
  describedBy,
  rows = 3,
  dense,
  ...rest
}: TextareaProps) {
  const wrong = invalid || error !== undefined;
  const described = [describedBy, error === undefined ? undefined : fieldErrorId(id)]
    .filter((part) => part !== undefined)
    .join(" ");
  return (
    <div className="flex flex-col gap-8">
      <label htmlFor={id} className={hideLabel ? "sr-only" : LABEL_CLASSES}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        aria-invalid={wrong || undefined}
        aria-describedby={described === "" ? undefined : described}
        className={textareaClasses(wrong, dense === true)}
        {...rest}
      />
      {error === undefined ? null : (
        <p id={fieldErrorId(id)} role="alert" className="text-ui-dense text-clay">
          {error}
        </p>
      )}
    </div>
  );
}
