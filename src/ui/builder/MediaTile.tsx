"use client";
import Image from "next/image";
import type { KeyboardEvent } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { mediaCardId } from "./MediaCard";
import { tileFace, tileName, type TileFace } from "./media-state";
import { Mark } from "./SlotFaces";

// One record in the media grid (hi-fi 3a: a square thumbnail; F38: only ever a square).
// The tile is a button: Enter or a click selects it — the media card under the grid
// (`MediaCard`) opens on it — and the Delete key asks to remove it. What the square shows
// is decided by `tileFace`; this file only draws it, in its four states: rest, hover (a
// quiet ink ring), focus (the blue outline with its halo) and selected (the blue outline
// alone — the one blue thing in the rail, the same device as a selected canvas block).

export interface MediaTileProps {
  asset: AssetView;
  /** Whether this is the selected tile, the one the card is open on. */
  expanded: boolean;
  onToggle: () => void;
  /** Asks to remove; the library confirms first. */
  onRemove: () => void;
}

/**
 * The word on a small tile's stripes (`processing`, `queued`, `uploading`): the mono
 * voice at its 10px floor without tracking, rather than `MonoLabel`'s tracked 11px —
 * `processing` is ten glyphs, and tracked at 11px they overran a 3-up rail tile.
 */
export const STRIPES_WORD = "font-label text-mono-floor tracking-normal uppercase text-center";

// The square: stripes with a word, or the image on its focal point with one mark
// (`SlotFaces.Mark`, so the picker draws the same). The crop position is data from the
// record, so it is the only thing the inline style carries.
function Face({ face }: { face: TileFace }) {
  if (face.kind === "placeholder") {
    return <span className={STRIPES_WORD}>{face.label}</span>;
  }
  return (
    <>
      <Image
        src={face.src}
        alt=""
        fill
        unoptimized
        className="object-cover"
        style={{ objectPosition: face.position }}
      />
      {face.mark === null ? null : <Mark mark={face.mark} />}
    </>
  );
}

/** The element id of a record's square, so a surface can hand it focus (phone mode, T045). */
export function tileButtonId(mediaId: string): string {
  return `tile-${mediaId}`;
}

// The outline is always drawn, 2px and 2px off the square, and only its colour changes —
// so hover, focus and selection are one ring fading between transparent, ink and blue
// over 180ms, and nothing in the grid ever moves.
const RING =
  "outline-2 outline-offset-2 transition-[outline-color] duration-hover ease-default " +
  "focus-visible:outline-blue focus-visible:shadow-focus-ring";
const RING_REST = "outline-transparent hover:outline-line-button";
const RING_SELECTED = "outline-blue";

/**
 * A grid cell: a square button named by its description, its file and its state (`A tabby
 * cat on a windowsill., rain-day.mov, 0:10`, `long.mp4, needs a trim`, `blurry.jpg, needs
 * a description`) with `aria-expanded` and, while selected, `aria-controls` naming the
 * card. It stays a square in its place whether or not it is selected. Enter, Space and a
 * click toggle it; Delete asks to remove it.
 */
export function MediaTile({ asset, expanded, onToggle, onRemove }: MediaTileProps) {
  const face = tileFace(asset);
  const name = tileName(asset, face);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove();
    }
  };
  const button = [
    "relative block aspect-square w-full cursor-pointer overflow-hidden rounded-control bg-paper-deep",
    RING,
    expanded ? RING_SELECTED : RING_REST,
    face.kind === "placeholder" ? "stripes grid place-items-center p-8 text-meta" : undefined,
  ];
  return (
    <li>
      <button
        id={tileButtonId(asset.id)}
        type="button"
        aria-label={name}
        aria-expanded={expanded}
        aria-controls={expanded ? mediaCardId(asset.id) : undefined}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={button.filter(Boolean).join(" ")}
      >
        <Face face={face} />
      </button>
    </li>
  );
}
