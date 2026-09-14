"use client";
import Image from "next/image";
import type { ReactNode, Ref } from "react";
import type { MediaKind } from "@/core/media/schema";
import { Button } from "@/ui/shared/Button";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { mediaWord, type TileFace, type TileMark } from "./media-state";

// The two faces a slot can wear (T025; DESIGN.md §4 Media), split out of `PhotoSlot.tsx`
// for the lint line ceiling: the stripes with the word for what belongs here and the
// pick button, or the image on its focal point with its `replace photo` chip and, on a
// placed enhanced copy, the `enhanced` mark (FR-052). `Mark`, the one word a library
// tile or a picker choice wears over its image, lives here too so every surface that
// draws a record draws it the same way. `PhotoSlot` decides which face and holds the
// picker.

/** The face of a slot: the record's tile face, `empty`, or `missing` for an id the library lost. */
export type SlotFace = TileFace | { kind: "empty" } | { kind: "missing" };

/**
 * The word on the stripes, and on a small tile its short form (the long one stays for
 * assistive tech). F55: on touch an empty slot says `Add a photo` — nothing drops on a
 * phone, and the words are the button (`MergedPick` below).
 */
export function stripesLabel(
  face: SlotFace,
  kind: MediaKind,
  touch = false,
): { full: string; short: string } {
  const word = mediaWord(kind);
  if (face.kind === "empty") {
    const label = touch ? `Add a ${word}` : `drop a ${word}`;
    return { full: label, short: label };
  }
  if (face.kind === "missing") {
    return { full: `${word} missing — pick another`, short: `${word} missing` };
  }
  const label = face.kind === "placeholder" ? face.label : "";
  return { full: label, short: label };
}

// The chip over a filled slot: mono on the ink scrim, 44px tall, keyed off its own tile's
// hover and focus (`group/slot`), so a grid of tiles shows one chip at a time.
const CHIP =
  "absolute right-8 bottom-8 inline-flex min-h-44 items-center rounded-control bg-ink/70 px-12 " +
  "font-label text-mono-label tracking-normal text-card opacity-0 transition-opacity duration-hover " +
  "ease-default group-focus-within/slot:opacity-100 group-hover/slot:opacity-100 " +
  "focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-card disabled:pointer-events-none";

/** The mark on a placed enhanced copy (FR-052): told apart from its original at a glance. */
const ENHANCED_MARK =
  "pointer-events-none absolute top-8 left-8 rounded-control bg-ink/70 px-8 py-4 text-card";

/**
 * The one mark over a record's image: a fact (the clip length, `ENHANCED`) is the tracked
 * mono word on an ink band along the bottom edge, which fits any tile a 3-up rail or a
 * picker can draw; something that needs doing is a clay bar on the same edge. Both are
 * decorative here — the words are in the record's accessible name.
 */
export function Mark({ mark }: { mark: TileMark }) {
  if (mark.tone === "clay") {
    return <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-4 bg-clay" />;
  }
  // The mono voice at its 10px floor (`text-mono-floor`, DESIGN.md §2) rather than
  // `MonoLabel`'s 11px: eight tracked characters at 11px overrun a 3-up rail tile. Set
  // solid (`leading-none`) on 4px of padding the band is 18px, a quarter of a 67px tile
  // rather than a third (F38).
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-0 bottom-0 overflow-hidden bg-ink/70 py-4 text-center font-label text-mono-floor leading-none text-card uppercase"
    >
      {mark.text}
    </span>
  );
}

export interface StripesProps {
  label: { full: string; short: string };
  /** A small tile shows the short label and keeps the full one for assistive tech. */
  small: boolean;
  /** The pick button's accessible name. */
  pickName: string;
  word: "photo" | "clip";
  onPick: () => void;
  disabled: boolean;
  /**
   * One line, not two (F28 review #12, comp 3a): the mono label itself is the pick
   * button — `pickName` is still its accessible name — instead of a separate blue
   * `Pick a photo` link under it. Only the gallery's own pickable cell asks for this;
   * every other slot keeps the label and the link apart.
   */
  merged?: boolean;
  /**
   * F55 item 2: on touch every empty slot is the one-line kind, reading `Add a photo`,
   * and the whole striped face is the button — a thumb taps the slot, not a word.
   */
  fill?: boolean;
  children: ReactNode;
}

const MERGED =
  "inline-flex min-h-44 cursor-pointer items-center justify-center transition-colors duration-hover " +
  "ease-default hover:text-ink focus-visible:outline-2 focus-visible:outline-blue disabled:pointer-events-none " +
  "disabled:cursor-default disabled:opacity-50";

// The comp's one-line empty cell (F28 review #12): the mono label itself is the pick
// button, styled like `StripedPlaceholder`'s own `as="button"` — no separate blue link.
// Filling (F55), it covers the face and draws its focus ring inside the slot's own edge.
function MergedPick({
  label,
  pickName,
  onPick,
  disabled,
  fill = false,
}: Pick<StripesProps, "label" | "pickName" | "onPick" | "disabled" | "fill">) {
  const shape = fill
    ? "absolute inset-0 -outline-offset-4"
    : "rounded-control focus-visible:outline-offset-2";
  return (
    <button
      type="button"
      aria-label={pickName}
      disabled={disabled}
      onClick={onPick}
      className={`${MERGED} ${shape}`}
    >
      <MonoLabel className="text-center">{label.full}</MonoLabel>
    </button>
  );
}

/** The striped face: the word for what belongs here and the pick button. */
export function Stripes({
  label,
  small,
  pickName,
  word,
  onPick,
  disabled,
  merged = false,
  fill = false,
  children,
}: StripesProps) {
  const shortened = small && label.short !== label.full;
  if (merged || fill) {
    return (
      <>
        <MergedPick
          label={label}
          pickName={pickName}
          onPick={onPick}
          disabled={disabled}
          fill={fill}
        />
        {children}
      </>
    );
  }
  return (
    <>
      {shortened ? (
        <>
          <MonoLabel aria-hidden="true" className="text-center">
            {label.short}
          </MonoLabel>
          <span className="sr-only">{label.full}</span>
        </>
      ) : (
        <MonoLabel className="text-center">{label.full}</MonoLabel>
      )}
      <Button variant="ghost" aria-label={pickName} disabled={disabled} onClick={onPick}>
        Pick a {word}
      </Button>
      {children}
    </>
  );
}

export interface FaceProps {
  face: Extract<TileFace, { kind: "image" }>;
  alt: string;
  priority: boolean;
  /** The chip's label, or `null` for no chip. */
  replace: string | null;
  onReplace: () => void;
  /** Whether the placed record is an enhanced copy, for the mark. */
  enhanced: boolean;
  disabled: boolean;
  chipRef: Ref<HTMLButtonElement>;
  children: ReactNode;
}

/** The image on its focal point, the caller's overlay, the enhanced mark, and the chip. */
export function Face(props: FaceProps) {
  const { face, alt, priority, replace, onReplace, enhanced, disabled, chipRef } = props;
  return (
    <>
      <Image
        src={face.src}
        alt={alt}
        fill
        priority={priority}
        unoptimized
        className="object-cover"
        style={{ objectPosition: face.position }}
      />
      {props.children}
      {enhanced ? <MonoLabel className={ENHANCED_MARK}>enhanced</MonoLabel> : null}
      {replace === null ? null : (
        <button
          ref={chipRef}
          type="button"
          disabled={disabled}
          className={CHIP}
          onClick={onReplace}
        >
          {replace}
        </button>
      )}
    </>
  );
}
