import { execFileSync } from "node:child_process";

// What the journeys ask the real ffprobe: a derived file's length and which streams it
// carries — the proof that the audio track is gone (FR-085) and the trim landed (FR-078).

/** ffprobe's report for a file: its duration in seconds and the codec type of every stream. */
export function probe(path: string): { duration: number; streams: string[] } {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type",
    "-of",
    "json",
    path,
  ]).toString();
  const json = JSON.parse(out) as {
    format: { duration: string };
    streams: { codec_type: string }[];
  };
  return { duration: Number(json.format.duration), streams: json.streams.map((s) => s.codec_type) };
}
