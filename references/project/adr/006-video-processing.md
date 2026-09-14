# ADR-006: Video processing

**Status**: accepted · **Date**: 2026-09-10

## Context

Trimming (FR-078), poster extraction (FR-077), metadata stripping, and a web-sized transcode
(FR-075) need a real media tool. Neither Next.js image optimisation nor any of the three
models does this.

## Decision

**`ffmpeg` (and `ffprobe`) installed in the Cloud Run container image**, called through a
`VideoProcessor` port:

```ts
interface VideoProcessor {
  probe(input): Promise<{ durationSeconds; width; height }>;
  transcode(input, { trim?: { start; end } }): Promise<{ web: Stream; poster: Stream }>;
}
```

- The adapter shells out to the `ffmpeg` binary with fixed argument sets: H.264 video, **no
  audio stream** (`-an` — videos are silent on every surface, FR-085, so the file carries no
  sound to turn on), `-map_metadata -1` after ffmpeg's default autorotate has
  applied the phone's rotation matrix, poster at the trim start + 0.5 s, 1080p ceiling. Input
  is streamed from the bucket to a temp file, output streamed back. A portrait-shot fixture in
  the adapter test guards the rotation.
- **Failure paths.** Transcode failure at finalize → the upload is rejected as a whole and the
  original deleted ("We couldn't process {file}. Nothing was added."). Transcode failure at
  re-trim → the previous revisions stay current and the trim is refused with the same message.
  Poster extraction failing alone → the asset is `ready` with no `revisions.poster`; renderers
  show the striped placeholder (spec edge case).
- **The trim editor's source.** Originals are private (ADR-015), so the builder fetches them
  through one signed-in, `Range`-aware Route Handler,
  `GET /api/profiles/{pid}/media/{mid}/original`, used only by the trim editor. Chunked range
  responses keep each response under Cloud Run's 32 MiB limit. No other surface ever reads an
  original.
- Processing runs **inside the finalize / trim request**, awaited. Cloud Run's request timeout
  is raised to 15 minutes for the app and the builder shows a "processing" state on the
  media tile until `asset.json` says ready. At tens of profiles this is fine; a queue is not.
- A trim is **1 to 15 seconds** long; outside that it is refused naming the number (FR-078).
  An original longer than 15 s is stored with status `needs-trim` and **nothing is produced**
  — no web version, no poster, no description — until a trim exists. An original of 15 s or
  less is processed immediately. `ffprobe` decides the duration at finalize.
- The **describer input** for video is the finished `web.mp4` — the trimmed clip, therefore
  never more than 15 s — passed as a `gs://` file part (ADR-001). The original is never sent
  to any model (FR-079). This is asserted by a contract test, not left to convention.
- Locally, `STORE=fs` (ADR-015) answers a clip's URI as `file:///…`, not `gs://…`; Vertex runs
  in Google's cloud and cannot open a path on this laptop, so video description always fails
  by design under `STORE=fs` + `MODEL=vertex` — not a bug, and not fixable without `STORE=gcs`.
- Tests: the adapter is covered by one contract test that runs real `ffmpeg` on a 2-second
  fixture (skipped with a clear message if the binary is absent); everything above the port
  uses a fake.

## Alternatives rejected

- **Cloud Transcoder API** — a second GCP service, job polling, per-minute billing; overkill
  for tens of short clips.
- **ffmpeg.wasm in the browser** — 200 MB in a phone browser is slow and flaky, and
  re-trimming later (FR-078) would mean re-uploading.
- **A separate worker service** — YAGNI until a request-time transcode proves too slow.
