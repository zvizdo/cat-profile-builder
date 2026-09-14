"use client";
import { useId, useRef } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { formatClock } from "@/core/format/clock";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { Play } from "@/ui/shared/icons";
import { PhotoSlot, type PhotoSlotHandle } from "../PhotoSlot";
import { TrimTrack, type TrimTrackProps } from "../TrimTrack";
import { useRefocus } from "../use-refocus";
import { BlockShell } from "./BlockShell";
import type { EditorFor } from "./editor-props";

// The video section (hi-fi 3a; FR-016, FR-078): the clip's poster with the play mark, the
// `trim 0:04 – 0:12 of 2:07 · muted autoplay + loop` line read from the record with, while
// a trim exists, the track showing where that stretch sits in the clip, and on
// the label row `replace clip`, `re-trim` — T023's trim editor, opened directly, since a
// trim is a media-record edit the helper never makes (FR-093) — `duplicate` and `remove`.
// The design's `cover frame` is not built (research.md): the poster is the trim's start.

/**
 * The reading under a finished clip: the stretch that plays over the original's length.
 * An untrimmed clip plays whole. Nothing while the clip is not ready to play.
 */
export function videoLine(asset: AssetView): string | null {
  const original = asset.originalDurationSeconds;
  if (asset.status !== "ready" || original === undefined) return null;
  const start = asset.trim?.start ?? 0;
  const end = asset.trim?.end ?? original;
  return `trim ${formatClock(start)} – ${formatClock(end)} of ${formatClock(original)} · muted autoplay + loop`;
}

/** The track under the line: the stored trim over the original's length, only while one exists on a clip ready to play. */
export function videoTrim(asset: AssetView): TrimTrackProps | null {
  const original = asset.originalDurationSeconds;
  if (asset.status !== "ready" || original === undefined || asset.trim === undefined) return null;
  return { range: asset.trim, max: original };
}

// The play mark over the poster (hi-fi): a white disc with the blue glyph, decorative.
function PlayMark() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-linear-to-b from-night/10 to-night/45">
      <span className="grid size-44 place-items-center rounded-pill bg-card text-blue">
        <Play />
      </span>
    </div>
  );
}

/** The video section's editor. */
export function VideoEditor(props: EditorFor<"video">) {
  const { block, assets, onApply, onOpenTrim } = props;
  const slot = useRef<PhotoSlotHandle>(null);
  const replaceId = useId();
  const refocus = useRefocus();
  const asset = assets.find((candidate) => candidate.id === block.mediaId);
  const line = asset === undefined ? null : videoLine(asset);
  const track = asset === undefined ? null : videoTrim(asset);
  const actions = [
    { id: replaceId, label: "replace clip", onClick: () => slot.current?.open() },
    ...(asset === undefined ? [] : [{ label: "re-trim", onClick: () => onOpenTrim(asset.id) }]),
  ];
  return (
    <BlockShell
      block={block}
      labelId={props.labelId}
      actions={actions}
      onDuplicate={props.onDuplicate}
      onRemove={props.onRemove}
    >
      <div className="flex flex-wrap items-center gap-16">
        <div className="w-full max-w-helper">
          <PhotoSlot
            ref={slot}
            mediaId={block.mediaId}
            assets={assets}
            kind="video"
            replaceOnSlot={false}
            onFilledFocus={() => refocus(replaceId)}
            onPick={(mediaId) => onApply({ op: "replace_image", blockId: block.id, mediaId })}
          >
            {line === null ? null : <PlayMark />}
          </PhotoSlot>
        </div>
        {line === null ? null : (
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            <MonoLabel variant="reading" as="p" className="text-meta">
              {line}
            </MonoLabel>
            {track === null ? null : <TrimTrack {...track} />}
          </div>
        )}
      </div>
    </BlockShell>
  );
}
