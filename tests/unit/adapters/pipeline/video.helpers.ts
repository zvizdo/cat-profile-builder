import type { ProbeResult, TranscodeResult } from "@/core/ports";

// The scripted answers every video pipeline test plays: what `ffprobe` would say about the
// two fixtures, and what a transcode would hand back. The bytes are stand-ins — the
// scripted processor never runs ffmpeg — but they are distinct, so their revs are too.

/** `clip-2s.mp4` as ffprobe reports it: stored landscape, shot portrait, with sound. */
export const PROBE_2S: ProbeResult = {
  durationSeconds: 2,
  width: 1920,
  height: 1080,
  rotation: -90,
  hasAudio: true,
};

/** `clip-20s.mp4` as ffprobe reports it: 20 s, already upright, with sound. */
export const PROBE_20S: ProbeResult = {
  durationSeconds: 20,
  width: 406,
  height: 720,
  rotation: 0,
  hasAudio: true,
};

export const WEB_BYTES = new TextEncoder().encode("web clip one");
export const POSTER_BYTES = new TextEncoder().encode("poster one");
export const WEB_BYTES_2 = new TextEncoder().encode("web clip two");
export const POSTER_BYTES_2 = new TextEncoder().encode("poster two");

/** The whole 2 s clip, autorotated to portrait. */
export const TRANSCODED_2S: TranscodeResult = {
  web: WEB_BYTES,
  poster: POSTER_BYTES,
  durationSeconds: 2,
  width: 1080,
  height: 1920,
};

/** A 10 s trim of the long clip. */
export const TRANSCODED_TRIM: TranscodeResult = {
  web: WEB_BYTES_2,
  poster: POSTER_BYTES_2,
  durationSeconds: 10,
  width: 406,
  height: 720,
};
