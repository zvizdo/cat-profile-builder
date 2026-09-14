"use client";
import type { RefObject, SyntheticEvent } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { TrimRange as Range } from "./TrimTrack";

// The trim editor's preview and the sizes the clip decides (split out of `TrimEditor.tsx`
// for the lint line ceiling, F55): the original playing muted and looping through the
// stretch, in a box of the clip's own proportions whose height is the window's — half of
// it on a laptop, `40dvh` on the phone, where the title, the track and the pinned footer
// must all fit 390×664 with nothing to scroll for.

interface PreviewProps {
  src: string;
  range: Range;
  /** The box's proportions and width, from the clip. */
  size: { aspectRatio: string; width: string };
  /** The element, so a moved handle can seek to its frame. */
  videoRef: RefObject<HTMLVideoElement | null>;
}

// The original, muted and looping through the stretch: past its end, or before its
// start, playback returns to the start. No controls, so no sound control (FR-085). The
// box has the clip's proportions, centred, and the panel is sized to it.
export function Preview({ src, range, size, videoRef }: PreviewProps) {
  const onTimeUpdate = (event: SyntheticEvent<HTMLVideoElement>) => {
    const { currentTime } = event.currentTarget;
    if (currentTime > range.end || currentTime < range.start) {
      event.currentTarget.currentTime = range.start;
    }
  };
  // `autoPlay` alone starts at 0: for a stored trim that begins well into the clip, the
  // volunteer would see the untrimmed opening for the one `timeupdate` tick before the
  // check above first runs (F40). `loadedmetadata` fires before that first frame paints,
  // so seeking there means the preview never visibly starts anywhere but the trim's start.
  const onLoadedMetadata = (event: SyntheticEvent<HTMLVideoElement>) => {
    event.currentTarget.currentTime = range.start;
  };
  return (
    <div
      className="mx-auto max-w-full overflow-hidden rounded-control bg-night [--trim-h:40dvh] md:[--trim-h:50vh]"
      style={size}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        className="size-full object-contain"
      />
    </div>
  );
}

/**
 * How tall the clip plays in the modal, so the whole sheet fits a laptop window; on the
 * phone (F55) the box carries `--trim-h: 40dvh` instead, so the title, the track and
 * the pinned footer all fit a 390×664 window with nothing to scroll for.
 */
const VIDEO_HEIGHT = "50vh";

/**
 * The clip decides the panel: half the window tall, its own proportions wide, plus the
 * panel's padding — and never narrower than half the profile width, so the title of a
 * portrait clip still reads in two lines.
 */
export function panelWidth(asset: AssetView): string {
  const ratio = asset.width / asset.height;
  const clip = `calc(${VIDEO_HEIGHT} * ${ratio} + 2 * var(--spacing-28))`;
  return `max(calc(var(--container-profile-max) / 2), ${clip})`;
}

/** The clip's box: `--trim-h` tall, its own proportions wide, never past the panel. */
export function previewSize(asset: AssetView): { aspectRatio: string; width: string } {
  return {
    aspectRatio: `${asset.width} / ${asset.height}`,
    width: `calc(var(--trim-h) * ${asset.width / asset.height})`,
  };
}
