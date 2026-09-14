"use client";
import Image from "next/image";
import { useState } from "react";
import type { Description, EditOperation } from "@/core/profile/operations";
import { Modal } from "@/ui/shared/Modal";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { CompareToggle, type SplitProps } from "./CompareToggle";
import { replaceIn, type Placement, type ReadyPhoto } from "./enhance-state";
import type { Enhancing } from "./use-enhance";

// The before/after view (T045; FR-052: shown beside the original before it is accepted;
// ADR-016: one fixed recipe). One photo box, the enhanced result laid over the original
// and clipped to a divider — original on the left, enhanced on the right, the
// conventional before/after — so the two are always at the same crop; a divider a pointer
// drags and a keyboard nudges (a native range, the trim editor's own handle), and a
// two-option toggle (`CompareToggle`) for anyone who would rather flip. Two answers: `Use
// enhanced` is exactly one `replace_image` on the placement it was opened from (FR-053,
// one undo), `Keep original` — and Escape — changes nothing; the enhanced copy is already
// in the library either way.

/** The compare view's sentences (CONTENT.md voice; the title is core's own sentence as a question). */
const COPY = {
  body:
    "It changes nowhere else on the page, and one undo brings the original back. " +
    "The enhanced copy stays in your library either way.",
  use: "Use enhanced",
  keep: "Keep original",
} as const;

/** Where the divider starts: half and half, so both are seen at once. */
const HALF = 50;

export interface EnhanceCompareProps {
  original: ReadyPhoto;
  /** The new record `enhancePhoto` answered: `enhancement.sourceMediaId` is `original.id`. */
  enhanced: ReadyPhoto;
  /** The slot the enhance was asked from — the one slot `Use enhanced` changes. */
  placement: Placement;
  /** Core's sentence for the swap, which names the placement (`Use the enhanced photo in the hero.`). */
  describe: (op: EditOperation) => Description;
  onApply: (op: EditOperation) => void;
  onClose: () => void;
}

/** The chip over a corner of the photo: mono on the ink scrim, decorative — the controls carry the words. */
const CORNER = "pointer-events-none absolute top-8 rounded-control bg-ink/70 px-8 py-4 text-card";

interface BoxProps extends Pick<EnhanceCompareProps, "original" | "enhanced"> {
  split: number;
  onSplit: (split: number) => void;
}

/** The photo box: this tall, its own proportions wide, never past the panel (the trim editor's rule). */
const PHOTO_HEIGHT = "60vh";

/** The box's proportions and width, from the record — data, so it is inline. */
function boxSize(photo: ReadyPhoto): { aspectRatio: string; width: string } {
  return {
    aspectRatio: `${photo.width} / ${photo.height}`,
    width: `min(100%, calc(${PHOTO_HEIGHT} * ${photo.width / photo.height}))`,
  };
}

/**
 * The photo decides the panel, as the clip decides the trim editor's: the box's width
 * plus the panel's padding, never narrower than half the profile width so the title
 * still reads in two lines over a portrait photo.
 */
function panelWidth(photo: ReadyPhoto): string {
  const box = `calc(${PHOTO_HEIGHT} * ${photo.width / photo.height} + 2 * var(--spacing-28))`;
  return `max(calc(var(--container-profile-max) / 2), ${box})`;
}

// The divider: a card-white line the full height of the box, and the trim editor's
// handle in its own row at mid-height, so the thumb sits on the line's middle. The line
// is a 2px border on a zero-width span — the spacing scale has no 2px step, and `w-2`
// resolved to nothing, so only the handle showed (F38).
function Divider({ split, onSplit }: SplitProps) {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-0 -translate-x-1/2 border-l-2 border-card"
        style={{ left: `${split}%` }}
      />
      <div className="absolute inset-x-0 top-1/2 h-44 -translate-y-1/2">
        <input
          type="range"
          aria-label="Divider"
          aria-valuetext={`${100 - split}% enhanced`}
          min={0}
          max={100}
          step={1}
          value={split}
          onChange={(event) => onSplit(Number(event.target.value))}
          className="trim-handle"
        />
      </div>
    </>
  );
}

// The photo box at the record's own proportions, held to the window's height: the
// original beneath, the enhanced result over it with its left `split`% clipped away —
// so the original shows left of the divider and the result right of it, under the
// corner chip that names each side — both on the same focal point. The divider is the
// trim editor's handle over a card-white line.
function CompareBox({ original, enhanced, split, onSplit }: BoxProps) {
  const position = `${original.focal.x}% ${original.focal.y}%`;
  const alt = original.alt?.text ?? "";
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-control bg-paper-deep"
      style={boxSize(original)}
    >
      <Image
        src={original.cleanUrl}
        alt={alt}
        fill
        unoptimized
        className="object-cover"
        style={{ objectPosition: position }}
      />
      <Image
        src={enhanced.cleanUrl}
        alt={alt === "" ? "" : `${alt} Enhanced.`}
        fill
        unoptimized
        data-layer="enhanced"
        className="object-cover"
        style={{ objectPosition: position, clipPath: `inset(0 0 0 ${split}%)` }}
      />
      <MonoLabel aria-hidden="true" className={`${CORNER} left-8`}>
        original
      </MonoLabel>
      <MonoLabel aria-hidden="true" className={`${CORNER} right-8`}>
        enhanced
      </MonoLabel>
      <Divider split={split} onSplit={onSplit} />
    </div>
  );
}

/**
 * A modal over the builder: `role="dialog"` named by core's sentence for the swap as a
 * question, described by what the recipe does and does not do. Focus starts on `Keep
 * original` and is trapped; Escape keeps the original. The toggle and the divider are
 * one state — `Original` is the divider at 100 (all original), `Enhanced` at 0, and a
 * divider between the ends checks neither. `Use enhanced` dispatches one `replace_image` on `placement`
 * to `enhanced.id` and closes; `Keep original` closes and dispatches nothing.
 */
export function EnhanceCompare(props: EnhanceCompareProps) {
  const { original, enhanced, placement, describe, onApply, onClose } = props;
  const [split, setSplit] = useState<number>(HALF);
  const op = replaceIn(placement, enhanced.id);
  return (
    <Modal
      open
      width={panelWidth(original)}
      title={describe(op).summary.replace(/\.$/, "?")}
      body={COPY.body}
      safeAction={{ label: COPY.keep, onClick: onClose }}
      dangerAction={{
        label: COPY.use,
        onClick: () => {
          onApply(op);
          onClose();
        },
      }}
    >
      <div className="flex flex-col gap-12">
        <CompareToggle split={split} onSplit={setSplit} />
        <CompareBox original={original} enhanced={enhanced} split={split} onSplit={setSplit} />
      </div>
    </Modal>
  );
}

export interface OpenEnhanceCompareProps extends Pick<EnhanceCompareProps, "describe" | "onApply"> {
  /** An editor's enhancement state (`useEnhance`); its open compare, if any, is drawn. */
  enhancing: Enhancing;
}

/** The compare view an editor's `useEnhance` has open, or nothing. */
export function OpenEnhanceCompare({ enhancing, describe, onApply }: OpenEnhanceCompareProps) {
  const { compare, closeCompare } = enhancing;
  if (compare === null) return null;
  return (
    <EnhanceCompare
      {...compare}
      describe={describe}
      onApply={onApply}
      onClose={() => closeCompare(compare)}
    />
  );
}
