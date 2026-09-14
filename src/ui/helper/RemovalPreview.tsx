"use client";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { RemovalPreview as Preview } from "@/core/profile/media-change";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { faceAsset, Thumb } from "./PhotoChange";

// F59 (review round 1, S2/N4): a `remove_block` card draws the section's own one-line
// preview struck through — the same line `read_outline` writes (`blockPreview`, core's
// `removalPreview` reads it once so this and the outline can never say two different
// things) — with its photo, when it has exactly one (a hero, a photo section, a video's
// poster, a quote's photo). A gallery or a day section (several photos) and a bio or
// needs section (a written list, not one line) draw no face: `removalPreview` already
// answered `face: null`, so there is no "which blocks get one" decision here. The line
// reads in the ledger's own mono voice; the photo dims the way `PhotoChange.tsx`'s
// leaving face does — the image only, never the struck line, which is already at full
// contrast — so "what leaves" reads the same on both cards.

export function RemovalBlock({
  preview,
  assets,
}: {
  preview: Preview;
  assets: readonly AssetView[];
}) {
  return (
    <div className="flex items-center gap-8">
      {preview.face === null ? null : (
        <div className="opacity-60">
          <Thumb asset={faceAsset(assets, preview.face)} />
        </div>
      )}
      <del className="line-through">
        <span className="sr-only">was: </span>
        <MonoLabel variant="reading" className="text-meta">
          {preview.text}
        </MonoLabel>
      </del>
    </div>
  );
}
