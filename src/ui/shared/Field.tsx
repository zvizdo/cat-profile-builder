import type { InputHTMLAttributes, Ref } from "react";

// A labelled text field in the token language (DESIGN.md §4): mono uppercase label above,
// 4px radius, `.2` hairline, blue focus ring, and a clay sentence beneath when it is wrong.

/** The mono uppercase label above every field (DESIGN.md §4). */
export const LABEL_CLASSES = "font-label text-mono-label text-meta uppercase";

/** The input's classes, shared with the builder's textarea: 4px radius, hairline, blue focus ring. */
export function inputClasses(wrong: boolean): string {
  const border = wrong ? "border-clay" : "border-line-field hover:border-blue";
  return `w-full rounded-control border bg-card px-16 py-12 font-text text-ui font-normal text-ink placeholder:text-meta transition-[border-color,box-shadow] duration-hover ease-default focus:border-blue focus:shadow-focus-ring focus:outline-none disabled:opacity-50 ${border}`;
}

/** The `id` of the error sentence `Field` renders under the input with `id`. */
export function fieldErrorId(id: string): string {
  return `${id}-error`;
}

/** What a field needs; anything else an `input` takes passes through. */
export interface FieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "name" | "aria-describedby"
> {
  id: string;
  name: string;
  label: string;
  /** The sentence to show under the field; rendered as an alert and tied to the input. */
  error?: string;
  /** Marks the field wrong without its own sentence — when one message covers several fields. */
  invalid?: boolean;
  /** Extra `aria-describedby` targets, such as another field's error sentence. */
  describedBy?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Label, input and error slot as one accessible unit: the label is tied to the input by
 * `id`, an error is announced (`role="alert"`) and named in the input's `aria-describedby`,
 * and `aria-invalid` is set whenever the field is wrong for any reason.
 */
export function Field({
  id,
  name,
  label,
  error,
  invalid = false,
  describedBy,
  type = "text",
  ...rest
}: FieldProps) {
  const wrong = invalid || error !== undefined;
  const described = [describedBy, error === undefined ? undefined : fieldErrorId(id)]
    .filter((part) => part !== undefined)
    .join(" ");
  return (
    <div className="flex flex-col gap-8">
      <label htmlFor={id} className={LABEL_CLASSES}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        aria-invalid={wrong || undefined}
        aria-describedby={described === "" ? undefined : described}
        className={inputClasses(wrong)}
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
