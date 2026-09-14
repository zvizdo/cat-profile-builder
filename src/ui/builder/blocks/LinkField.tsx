"use client";
import { useId, useState, type KeyboardEvent } from "react";
import { HttpUrlSchema } from "@/core/profile/rich-text";
import { Button } from "@/ui/shared/Button";
import { Field } from "@/ui/shared/Field";

// The bio's link question (T025; ADR-013): a small inline field for the address, checked
// against the core's `HttpUrlSchema` before it can become a link — `javascript:`, `data:`
// and relative strings are refused with the schema's own sentence. Enter adds, Escape
// closes, `Remove link` takes the mark off the selection.
//
// F12: `theme-chrome` alongside `bg-paper`, same as `NeedsEditor`'s card — `Field`'s wrong
// state (a clay border, and a clay error sentence once the schema refuses an address) would
// otherwise read the canvas's *themed* paper and fall under 4.5:1 on Sand and Night.

export interface LinkFieldProps {
  /** The address the selection already links to, if any. */
  current: string | undefined;
  onAdd: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** The address field with `Add link`, `Remove link` (when linked) and `Cancel`. */
export function LinkField({ current, onAdd, onRemove, onClose }: LinkFieldProps) {
  const id = useId();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | undefined>(undefined);

  const add = () => {
    const parsed = HttpUrlSchema.safeParse(value.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    onAdd(parsed.data);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="theme-chrome flex flex-col gap-12 rounded-control border border-line-panel bg-paper p-16">
      <Field
        id={id}
        name="href"
        label="Link address"
        type="url"
        value={value}
        placeholder="https://"
        error={error}
        // The field opens on a press of `Link` and is the point of that press.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        onChange={(event) => {
          setValue(event.target.value);
          setError(undefined);
        }}
        onKeyDown={onKeyDown}
      />
      <LinkButtons
        linked={current !== undefined}
        onAdd={add}
        onRemove={onRemove}
        onClose={onClose}
      />
    </div>
  );
}

interface LinkButtonsProps {
  linked: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onClose: () => void;
}

// `Add link`, `Remove link` while the selection is linked, and `Cancel`.
function LinkButtons({ linked, onAdd, onRemove, onClose }: LinkButtonsProps) {
  return (
    <div className="flex flex-wrap gap-12">
      <Button variant="primary" onClick={onAdd}>
        Add link
      </Button>
      {linked ? (
        <Button variant="destructive" onClick={onRemove}>
          Remove link
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
}
