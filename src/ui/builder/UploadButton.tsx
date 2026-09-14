"use client";
import type { ChangeEvent, RefObject } from "react";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { Add } from "@/ui/shared/icons";
import { ACCEPTED_TYPES } from "./upload-client";
import { useWorkingLock } from "./working-lock";

// The `+` tile that ends the media grid (hi-fi 3a): a real file input, hidden, behind a
// square dashed button. `accept` names the five formats so a phone converts HEIC before it
// hands the file over (FR-006), and `multiple` takes a whole camera roll at once.

export interface UploadButtonProps {
  /** The hidden input, so `Choose another` can reopen the picker. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** The tile itself, so focus can land here once a tile is removed. */
  buttonRef: RefObject<HTMLButtonElement | null>;
  onFiles: (files: File[]) => void;
  /** The dashed square tile ending the grid, or a full-width 44px row above it (the
   * phone's Media drawer, where Upload comes first — design 2026-09-13 §5). */
  shape?: "tile" | "row";
}

const SHAPE = {
  tile: "aspect-square flex-col gap-4",
  row: "flex-row gap-8 px-16",
} as const;

/** The row's word: a sentence, where the tile has room for one word. */
const LABEL = { tile: "add", row: "Add photos or video" } as const;

/**
 * A dashed square tile named `Add photos or video`, ≥44px, keyboard-operable, that opens
 * the picker; the picked files go to `onFiles` and the input is cleared so the same file
 * can be picked again after a refusal.
 */
export function UploadButton({ inputRef, buttonRef, onFiles, shape = "tile" }: UploadButtonProps) {
  const working = useWorkingLock();
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onFiles(files);
  };
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Add photos or video"
        disabled={working}
        onClick={() => inputRef.current?.click()}
        className={`flex min-h-44 w-full items-center justify-center rounded-control border border-dashed border-line-tag text-meta transition-colors duration-hover ease-default hover:border-blue hover:text-blue focus-visible:border-blue focus-visible:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:pointer-events-none disabled:opacity-50 ${SHAPE[shape]}`}
      >
        <Add />
        <MonoLabel variant={shape === "row" ? "reading" : "label"}>{LABEL[shape]}</MonoLabel>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        hidden
        onChange={onChange}
      />
    </>
  );
}
