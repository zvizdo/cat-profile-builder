// The trim track (hi-fi video block): the paper-deep bar for the whole clip with the blue
// window over the chosen stretch. The trim editor lays its two handles over it; the video
// section shows it on its own, under the trim line, so where the stretch sits in the clip
// can be seen without opening the editor.

/** A stretch of a clip, in seconds. */
export interface TrimRange {
  start: number;
  end: number;
}

export interface TrimTrackProps {
  range: TrimRange;
  /** The original clip's length in seconds — the whole track. */
  max: number;
}

/**
 * The window over the track, as a fraction of the clip. Decorative: the trim line beside
 * it reads the same numbers aloud, and the editor's handles are the controls.
 */
export function TrimTrack({ range, max }: TrimTrackProps) {
  const left = `${(range.start / max) * 100}%`;
  const width = `${((range.end - range.start) / max) * 100}%`;
  return (
    <div
      aria-hidden="true"
      data-trim-track
      className="relative h-28 overflow-hidden rounded-control bg-paper-deep"
    >
      <div className="absolute inset-y-0 border-2 border-blue bg-blue/12" style={{ left, width }} />
    </div>
  );
}
