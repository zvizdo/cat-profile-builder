"use client";
import type { KeyboardEvent } from "react";
import type { ProfileDocument } from "@/core/profile/schema";
import { Modal } from "@/ui/shared/Modal";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { BLOCK_TYPES, pickerLabel } from "./block-content";
import { PICKER_BODY, PICKER_TITLE, pickerDescription } from "./section-picker-content";
import type { SectionPickerController } from "./use-section-picker";
import { useSurface } from "./use-surface";

// The picker the canvas's `+ add section` tile opens (F2). Every option is its own action —
// choosing one adds that type at the end of the page and closes at once, nothing to
// confirm — so the shared `Modal` carries only `safeAction` (`Cancel`); the seven types are
// its `children`, never a `dangerAction`. Escape and Cancel both run `close`, and the
// shared `Modal` already returns focus to the tile that opened it. F55 (the phone sweep,
// finding 4): under 768px it is a bottom sheet like the slot picker's — the centred card
// stood taller than a phone's window, Cancel under the fold — the list scrolling inside
// and Cancel pinned to the sheet's foot.

const OPTION_SELECTOR = "[data-section-option]";

const OPTION =
  "flex min-h-44 w-full flex-col gap-4 rounded-control border border-line-tag px-12 py-8 text-left " +
  "transition-colors duration-hover ease-default hover:border-blue " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";

// ArrowDown/ArrowUp walk the seven options, wrapping; Tab already reaches every one of
// them plus Cancel (the panel's own focus trap) — this is the second way in the brief asks
// for, not a replacement for it. Lives on each option (an interactive element already —
// jsx-a11y refuses a key handler on the plain `ul` around them) rather than the list.
function onOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const list = event.currentTarget.closest("ul");
  const options = Array.from(list?.querySelectorAll<HTMLButtonElement>(OPTION_SELECTOR) ?? []);
  const index = options.indexOf(event.currentTarget);
  if (index === -1) return;
  event.preventDefault();
  const step = event.key === "ArrowDown" ? 1 : -1;
  options[(index + step + options.length) % options.length]?.focus();
}

export interface SectionPickerProps extends Pick<
  SectionPickerController,
  "open" | "close" | "choose"
> {
  /** Whose page this is — four of the seven descriptions use the cat's own pronoun. */
  sex: ProfileDocument["sex"];
}

/** The modal itself: `Add a section`, `Pick what comes next on the page.`, then the list. */
export function SectionPicker({ open, sex, close, choose }: SectionPickerProps) {
  const surface = useSurface();
  return (
    <Modal
      open={open}
      title={PICKER_TITLE}
      body={PICKER_BODY}
      safeAction={{ label: "Cancel", onClick: close }}
      placement={surface === "phone" ? "bottom" : "center"}
    >
      <ul className="flex flex-col gap-8">
        {BLOCK_TYPES.map((type) => (
          <li key={type}>
            <button
              type="button"
              data-section-option={type}
              className={OPTION}
              onClick={() => choose(type)}
              onKeyDown={onOptionKeyDown}
            >
              <MonoLabel variant="reading" className="text-meta">
                {pickerLabel(type)}
              </MonoLabel>
              <span className="font-text text-ui text-body">{pickerDescription(type, sex)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
