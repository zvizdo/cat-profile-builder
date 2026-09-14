"use client";
import { useRef, useState } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { formatClock } from "@/core/format/clock";
import { checkTrim, LIMITS, CAROUSEL_CLIP_SECONDS, type TrimCheck } from "@/core/media/validation";
import { Button } from "@/ui/shared/Button";
import { Modal } from "@/ui/shared/Modal";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { trimLabel } from "./time-format";
import { Track } from "./TrimControls";
import { panelWidth, Preview, previewSize } from "./TrimPreview";
import type { TrimRange as Range } from "./TrimTrack";

// The trim modal (CONTENT.md → Modals, decision Q4; FR-077–FR-079, FR-085): the original
// plays muted and looping over the chosen stretch, two handles set it, and every move is
// judged by core's `checkTrim` — its sentence is the inline refusal and gates `Use this
// stretch`. The poster is the frame at the start of the stretch (ADR-006), so choosing
// the start is choosing the cover frame. No sound control exists (FR-085).

// The modal's sentences (decision Q4 supersedes CONTENT.md's twelve seconds). A clip
// already inside the limit gets the short title (F28 review #13) — the cap and the
// carousel's shorter cut only matter to a clip that needs trimming down to fit them.
// F55: the body says what to do and what the start frame is, rather than repeating
// the title's "pick the seconds" (the phone sweep read the two as one sentence twice).
const COPY = {
  title: (original: number) =>
    original <= LIMITS.maxClipSeconds
      ? `That clip is ${formatClock(original)}. Pick the seconds worth watching.`
      : `That clip is ${formatClock(original)}. A profile plays up to ${LIMITS.maxClipSeconds} seconds; the carousel shows the first ${CAROUSEL_CLIP_SECONDS}.`,
  body: "Drag the handles to choose the stretch. Its first frame is the cover.",
  use: "Use this stretch",
  cancel: "Cancel",
  remove: "Remove trim",
} as const;

export interface TrimEditorProps {
  profileId: string;
  /** A video record; `originalDurationSeconds` is what the handles run over. */
  asset: AssetView;
  /** Sends the stretch; the modal closes at once and the tile shows the cut happening. */
  onTrim: (start: number, end: number) => Promise<boolean>;
  /** Removes the stored trim; the modal closes at once. */
  onClearTrim: () => Promise<boolean>;
  onClose: () => void;
}

// Core's sentence when the stretch breaks the rule; no reserved band while it is fine
// (F28 review #13 — the old fixed min-height left empty ground under the track).
function Refusal({ check }: { check: TrimCheck }) {
  return (
    <p role="status" className="text-ui-dense leading-relaxed text-clay">
      {check.ok ? null : check.message}
    </p>
  );
}

/** Where the handles start: the stored trim, else the clip's first fifteen seconds. */
function initialRange(asset: AssetView, original: number): Range {
  return asset.trim ?? { start: 0, end: Math.min(LIMITS.maxClipSeconds, original) };
}

// The stretch, core's verdict on it, and the preview to seek: a moved handle seeks to its
// own end, so the volunteer sees the frame under it — the start frame is the poster.
function useTrimRange(asset: AssetView, original: number) {
  const [range, setRange] = useState<Range>(() => initialRange(asset, original));
  const video = useRef<HTMLVideoElement>(null);
  const check = checkTrim({ ...range, originalDurationSeconds: original });
  const move = (next: Range) => {
    const seekTo = next.start !== range.start ? next.start : next.end;
    if (video.current !== null) video.current.currentTime = seekTo;
    setRange(next);
  };
  return { range, move, video, check };
}

/**
 * The modal, sized to the clip: `That clip is 2:07…` over the original playing muted and
 * looping through the stretch, then at full width the live `0:04 – 0:12 of 2:07 · muted ·
 * loops` reading, the track with its two handles, core's refusal inline (a live region, empty while the stretch is fine), `Remove
 * trim` while a trim exists, and `Cancel` / `Use this stretch` — disabled until core says
 * ok — in a footer pinned to the panel's foot (`size="sheet"`, F39's rule, F55: on a
 * phone the buttons were a 26px sliver under the fold). Sends once and closes at once —
 * the tile shows the cut happening.
 */
export function TrimEditor({ profileId, asset, onTrim, onClearTrim, onClose }: TrimEditorProps) {
  const original = asset.originalDurationSeconds ?? 0;
  const { range, move, video, check } = useTrimRange(asset, original);

  // Either send closes at once: the cut takes seconds, and the tile shows it happening
  // (striped `processing`, then the new poster); a failure is the library's toast.
  const sendAndClose = (send: () => Promise<boolean>) => {
    void send();
    onClose();
  };

  return (
    <Modal
      open
      size="sheet"
      width={panelWidth(asset)}
      title={COPY.title(original)}
      body={COPY.body}
      safeAction={{ label: COPY.cancel, onClick: onClose }}
      dangerAction={{
        label: COPY.use,
        onClick: () => sendAndClose(() => onTrim(range.start, range.end)),
        disabled: !check.ok,
      }}
    >
      <div className="flex flex-col gap-12">
        <Preview
          src={`/api/profiles/${profileId}/media/${asset.id}/original`}
          range={range}
          size={previewSize(asset)}
          videoRef={video}
        />
        <MonoLabel as="p" variant="reading" aria-live="polite" className="text-meta">
          {trimLabel(range.start, range.end, original)}
        </MonoLabel>
        <Track range={range} max={original} onChange={move} />
        <Refusal check={check} />
        {asset.trim === undefined ? null : (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => sendAndClose(onClearTrim)}
          >
            {COPY.remove}
          </Button>
        )}
      </div>
    </Modal>
  );
}
