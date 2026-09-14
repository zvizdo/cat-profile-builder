"use client";
import Image from "next/image";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { altOf } from "@/core/profile/block-preview";
import type { MediaChange, MediaFace } from "@/core/profile/media-change";
import { STRIPES_WORD } from "@/ui/builder/MediaTile";
import { tileFace } from "@/ui/builder/media-state";
import { MonoLabel } from "@/ui/shared/MonoLabel";

// F59 (the memo's §3, "image changes — feasibility"; review round 1, S1/S2/N4/N5): the
// non-text half of F58's change block. A `replace_image` card draws the current photo
// above the proposed one — the shape `RemovalPreview.tsx`'s single face already has,
// each 56px face (`tileFace`, the rail's own reader) beside its own caption line, never
// squeezed under it in a 56px column: the first draft's captions wrapped to three lines
// and overran the face on both sides. No arrow — "was, then now" stacked vertically is
// F58's own two-line order. Every caption reads in the ledger's own mono voice at the
// ledger's own size (`MonoLabel variant="reading"`, `text-meta`), not the panel's base
// text. A gallery's `set_field mediaIds` draws the dropped faces the same way, struck,
// above the kept ones, plain.

const FACE = "relative size-56 shrink-0 overflow-hidden rounded-control";
const MISSING =
  "stripes grid size-56 shrink-0 place-content-center rounded-control p-4 text-center";

/** One 56px face: the record's clean photo or poster on its focal point, or a striped
 * square — for one the library has since lost, or one with nothing to show yet — never
 * a broken image. The striped word is the rail's own 10px floor (`STRIPES_WORD`), the
 * same as `MediaTile.tsx` draws it in a tile this size (review round 1, N5). Exported
 * for `RemovalPreview.tsx`'s own single face. */
export function Thumb({ asset }: { asset: AssetView | undefined }) {
  if (asset === undefined) {
    return (
      <div className={MISSING}>
        <span className={STRIPES_WORD}>missing</span>
      </div>
    );
  }
  const face = tileFace(asset);
  if (face.kind === "placeholder") {
    return (
      <div className={MISSING}>
        <span className={STRIPES_WORD}>{face.label}</span>
      </div>
    );
  }
  return (
    <div className={FACE}>
      <Image
        src={face.src}
        alt={altOf(asset)}
        fill
        unoptimized
        className="object-cover"
        style={{ objectPosition: face.position }}
      />
    </div>
  );
}

/** The face's own record in `assets`, or `undefined` for one it no longer known — never
 * looked up by an id the library has since lost. Exported for `RemovalPreview.tsx`. */
export function faceAsset(assets: readonly AssetView[], face: MediaFace): AssetView | undefined {
  return face.known ? assets.find((asset) => asset.id === face.mediaId) : undefined;
}

/** How one face's caption reads: struck for the one leaving, underlined for the one
 * arriving, plain for one that simply stays (a gallery's kept photos) — the ledger's own
 * mono voice either way (review round 1, S2). */
type FaceMode = "del" | "ins" | "plain";

function Caption({ text, mode }: { text: string; mode: FaceMode }) {
  const mono = (
    <MonoLabel variant="reading" className="text-meta">
      {text}
    </MonoLabel>
  );
  if (mode === "del") {
    return (
      <del className="line-through">
        <span className="sr-only">was: </span>
        {mono}
      </del>
    );
  }
  if (mode === "ins") {
    return (
      <ins className="no-underline">
        <span className="sr-only">now: </span>
        {mono}
      </ins>
    );
  }
  return mono;
}

/** One face beside its own caption line — the shape `RemovalPreview.tsx`'s single face
 * already has (review round 1, S1). Only the image dims for the one leaving: the struck
 * caption already reads as "leaving" at full contrast, and dimming it too dropped it
 * under 4.5:1 (caught by axe, F59's first browser check). */
function FaceRow({
  face,
  assets,
  mode,
}: {
  face: MediaFace;
  assets: readonly AssetView[];
  mode: FaceMode;
}) {
  const asset = faceAsset(assets, face);
  return (
    <div className="flex items-center gap-8">
      <div className={mode === "del" ? "opacity-60" : ""}>
        <Thumb asset={asset} />
      </div>
      <Caption text={altOf(asset)} mode={mode} />
    </div>
  );
}

/** The two faces `replace_image` proposes: the current one above, struck; the proposed
 * one below, plain. */
function PhotoPair({
  change,
  assets,
}: {
  change: Extract<MediaChange, { kind: "photo" }>;
  assets: readonly AssetView[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <FaceRow face={change.before} assets={assets} mode="del" />
      <FaceRow face={change.after} assets={assets} mode="ins" />
    </div>
  );
}

/** A gallery's `set_field mediaIds`: the dropped faces struck, the kept ones plain. */
function GalleryFaces({
  change,
  assets,
}: {
  change: Extract<MediaChange, { kind: "gallery" }>;
  assets: readonly AssetView[];
}) {
  return (
    <div className="flex flex-col gap-8">
      {change.dropped.map((face) => (
        <FaceRow key={face.mediaId} face={face} assets={assets} mode="del" />
      ))}
      {change.kept.map((face) => (
        <FaceRow key={face.mediaId} face={face} assets={assets} mode="plain" />
      ))}
    </div>
  );
}

/** The change block for a `replace_image` or a gallery's dropped photos (F59;
 * `TextChange.tsx`'s `ChangeBlock` draws the field and rich-text kinds). */
export function PhotoChange({
  change,
  assets,
}: {
  change: MediaChange;
  assets: readonly AssetView[];
}) {
  return change.kind === "photo" ? (
    <PhotoPair change={change} assets={assets} />
  ) : (
    <GalleryFaces change={change} assets={assets} />
  );
}
