import type { AssetView } from "@/adapters/pipeline/asset-view";
import { formatClock } from "@/core/format/clock";
import type { MediaKind } from "@/core/media/schema";
import { placementsOf, type Placement } from "@/core/profile/image-slots";
import type { ProfileDocument } from "@/core/profile/schema";

// What a library tile shows for a media record (data-model.md → Media state transitions),
// decided here as data so `MediaTile` only draws it. Stripes while nothing can be shown
// (DESIGN.md §4 Media: never a spinner), otherwise the derived image on its focal point
// with at most one mark.

/** The one word on a tile's stripes, or over its image. */
export interface TileMark {
  text: string;
  /** `card` (white) for a fact like the clip length; `clay` for something that needs doing. */
  tone: "card" | "clay";
}

/** A striped slot with a mono word, or an image on its focal point with an optional mark. */
export type TileFace =
  | { kind: "placeholder"; label: string }
  | { kind: "image"; src: string; position: string; mark: TileMark | null };

/** The clay `needs a description` that blocks publishing (FR-073). */
const NEEDS_DESCRIPTION: TileMark = { text: "needs a description", tone: "clay" };

/** The mark on an enhanced copy (FR-052): told from its original on the closed tile. */
const ENHANCED: TileMark = { text: "ENHANCED", tone: "card" };

/** The word for `kind` in a sentence. */
export function mediaWord(kind: MediaKind): "photo" | "clip" {
  return kind === "photo" ? "photo" : "clip";
}

/** `0:10` for a clip — the trimmed length, else the original's; nothing for a photo. */
export function durationLabel(asset: AssetView): string | null {
  const seconds = asset.durationSeconds ?? asset.originalDurationSeconds;
  return seconds === undefined ? null : formatClock(seconds);
}

// Why a tile is striped: still processing, a long clip with no trim yet, or a finished
// clip whose poster frame could not be extracted (ADR-006 keeps the clip).
function placeholderLabel(asset: AssetView): string {
  if (asset.status === "needs-trim") return "needs a trim";
  if (asset.status === "processing") return "processing";
  return "no cover frame";
}

function readyMark(asset: AssetView): TileMark | null {
  if (asset.descriptionStatus === "failed") return NEEDS_DESCRIPTION;
  if (asset.enhancement !== undefined) return ENHANCED;
  const duration = durationLabel(asset);
  return duration === null ? null : { text: duration, tone: "card" };
}

/**
 * `original: {the source's description, or "photo"}` for an enhanced copy (FR-054) —
 * short, since a tile is narrow — or `null` when the source has left the library.
 */
export function originalLine(asset: AssetView, assets: readonly AssetView[]): string | null {
  const source = assets.find((candidate) => candidate.id === asset.enhancement?.sourceMediaId);
  return source === undefined ? null : `original: ${source.alt?.text ?? "photo"}`;
}

/**
 * How a record is named wherever it is drawn (the rail's tile, the picker's choice):
 * `{description}, {file}, {state}` — each part only when it exists, the state being the
 * stripes' word or the mark's (`A tabby cat on a windowsill., rain-day.mov, 0:10`,
 * `long.mp4, needs a trim`, `cat-1.jpg, ENHANCED`).
 */
export function tileName(asset: AssetView, face: TileFace): string {
  const state = face.kind === "placeholder" ? face.label : face.mark?.text;
  return [asset.alt?.text, asset.fileName, state].filter((part) => part !== undefined).join(", ");
}

/**
 * The face of a tile: stripes with `processing`, `needs a trim` or `no cover frame` while
 * there is nothing to show; else the clean photo or the clip's poster, positioned on the
 * focal point, marked `needs a description` in clay when the describer failed, or
 * `ENHANCED` on an enhanced copy, or with the clip's length, or with nothing.
 */
export function tileFace(asset: AssetView): TileFace {
  const src = asset.kind === "photo" ? asset.cleanUrl : asset.posterUrl;
  if (asset.status !== "ready" || src === undefined) {
    return { kind: "placeholder", label: placeholderLabel(asset) };
  }
  const { x, y } = asset.focal;
  return { kind: "image", src, position: `${x}% ${y}%`, mark: readyMark(asset) };
}

/**
 * A file name cut to `max` characters for a narrow line, from the middle, so the head and
 * the end that tell files apart both survive: `PXL_20260622_022941724.jpg` →
 * `PXL_2026…724.jpg`. The extension always stays; the last three characters of the stem
 * stay too when the budget allows a head of at least four (`…724.jpg`), otherwise only the
 * extension, without its dot — the ellipsis already stands for the gap (`PXL_…mp4`).
 */
export function shortFileName(name: string, max: number): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const roomy = max - 1 - ext.length >= 7;
  const tail = roomy ? `${stem.slice(-3)}${ext}` : ext.slice(1);
  return `${stem.slice(0, max - 1 - tail.length)}…${tail}`;
}

/** The media card's line for a record nothing on the page holds (CONTENT.md → Rail). */
const NOT_ON_PAGE = "Not on the page yet";

/** One placement in the card's own words: the frame's type word, then the slot where a section has several. */
function placementWord(doc: ProfileDocument, placement: Placement): string {
  const type = doc.blocks.find((b) => b.id === placement.blockId)?.type ?? "";
  if (placement.slot === undefined) return type;
  const unit = type === "day" ? "scene" : "slot";
  return `${type}, ${unit} ${placement.slot + 1}`;
}

/**
 * Where a record sits on the page, for the media card (F39; FR-013): `On the page ·
 * hero`, `On the page · gallery, slot 2 · day, scene 2` — every slot holding it, in page
 * order, each named by its frame's type word — or `Not on the page yet`.
 */
export function onPageLine(doc: ProfileDocument, mediaId: string): string {
  const words = placementsOf(doc, mediaId).map((placement) => placementWord(doc, placement));
  return words.length === 0 ? NOT_ON_PAGE : ["On the page", ...words].join(" · ");
}
