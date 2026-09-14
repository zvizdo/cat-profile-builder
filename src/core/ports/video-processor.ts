// The VideoProcessor port (contracts/ports.md, ADR-006). Type-only. The ffmpeg adapter
// implements it; tests use the scripted fake in `tests/fakes/video-processor.ts`.

/** A video file for the processor: its bytes, or a path/URI the adapter can open. */
export type VideoInput = Uint8Array | string;

/** What `ffprobe` reports about an original before anything is produced. */
export interface ProbeResult {
  durationSeconds: number;
  /** Stored dimensions, before the rotation below is applied. */
  width: number;
  height: number;
  /** The phone's rotation tag in degrees (`0`, `90`, `-90`, `180`); autorotate applies it. */
  rotation: number;
  /** Whether the file carries an audio track (it is removed at transcode, FR-085). */
  hasAudio: boolean;
}

/** The trim to apply, in seconds into the original; `1 ≤ end - start ≤ 15` (FR-078). */
export interface TranscodeOptions {
  trim?: { start: number; end: number };
}

/** The finished web clip and, when extraction succeeded, its poster frame. */
export interface TranscodeResult {
  /** H.264 MP4, silent, metadata stripped, rotation applied, ≤ 1080p. */
  web: Uint8Array;
  /** JPEG at trim start + 0.5 s; `null` when poster extraction alone failed (ADR-006). */
  poster: Uint8Array | null;
  durationSeconds: number;
  /** Dimensions of the web clip after rotation. */
  width: number;
  height: number;
}

/**
 * Probes and transcodes video. A file that is not a video, or a transcode the tool gives up
 * on, rejects with an `UnsupportedError` — the file is the problem, not this service — and
 * produces nothing; a missing binary is an `InternalError`; a poster failure alone still
 * resolves with `poster: null` (ADR-006).
 */
export interface VideoProcessor {
  probe(input: VideoInput): Promise<ProbeResult>;
  transcode(input: VideoInput, options: TranscodeOptions): Promise<TranscodeResult>;
}
