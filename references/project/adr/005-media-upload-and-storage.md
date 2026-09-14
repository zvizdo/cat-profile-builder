# ADR-005: Media upload and storage

**Status**: accepted · **Date**: 2026-09-10

## Context

Photos up to 25 MB and videos up to 200 MB, from phones on shelter wifi, several at once.
Cloud Run caps HTTP/1 request bodies at 32 MiB, so the app cannot proxy the bytes. Uploads
must be validated server-side for real content type, size and dimensions (FR-008), strip
location metadata (FR-009), never partially apply, and originals must be kept (FR-075).

## Decision

**Direct-to-bucket resumable upload with a signed URL, then a server-side finalize step.**

1. Browser calls Server Action `beginUpload({ profileId, fileName, byteSize, declaredType })`.
   The server checks the declared size against the limit up front (a plain rejection before
   any bytes move), allocates a media id, and returns a V4 signed resumable-upload URL for
   `profiles/{pid}/media/{mid}/original` in the private bucket, valid for 15 minutes (decision 2026-09-11: the window bounds when an upload must *start*; a retry is one tap, and a shorter link is tidier).
2. Browser uploads straight to GCS with progress events.
3. Browser calls `finalizeUpload({ mediaId })`. The server streams the object's first bytes
   through `file-type` (magic-byte sniffing) to find the real type; rejects if it is not
   JPEG/PNG/WebP or MP4/MOV, or over the limit for its real kind; reads dimensions with
   `sharp` (photo) or `ffprobe` (video); on any failure deletes the object and returns a
   plain-language error naming the file and the reason. Nothing else is written until every
   check passes, so an upload never partially applies. A photo under 1200 px on the long edge
   is accepted with a warning in the response (FR-008).
   **HEIC** is not decoded (prebuilt `sharp` lacks libheif): the file input's `accept` lists
   JPEG/PNG/WebP/MP4/MOV so iOS converts HEIC to JPEG on selection, and a HEIC that arrives
   anyway is refused with the accepted formats named.
4. On success the server writes the asset record and the derived files at the paths in
   ADR-015 — originals and `asset.json` in the private bucket, `clean.{rev}.jpg` /
   `web.{rev}.mp4` / `poster.{rev}.jpg` in the public bucket, each named by a content hash
   and never overwritten.

5. The describer runs after finalize (awaited inside the same request; small images, short
   clips) and writes `alt` into `asset.json`, or marks `descriptionStatus: "failed"` so the
   builder asks the volunteer to write it (FR-073).
6. **Enhancement** (ADR-016) creates a *new* id with `enhancement: { sourceMediaId, recipe }`
   and its own `clean.{rev}.jpg` (FR-053/054). **Trim** writes a new `web.{rev}.mp4` and
   `poster.{rev}.jpg`, points `asset.json` at them, and re-runs the describer (FR-079). The
   previous revisions stay (ADR-015) so an already-published page keeps its clip.
7. **Deletion** reads that cat's `published.json` and `archived.json` and refuses, naming the
   cat, if either manifest references the id (FR-076/087). Then deletes the media folder in
   both buckets.
8. Derived files are **publicly readable** by URL in the public bucket; originals and records
   are in the private bucket and cannot be fetched by anyone (FR-075 by construction). Media
   of an unpublished profile is not linked from anywhere but is not access-controlled.
   *(Amended 2026-09-12, F23: "by URL" is the app's own `/media/…` route, not the bucket —
   the bucket has no public reader; see the ADR-015 amendment of the same date.)*

The port is `MediaStore` as listed in `contracts/ports.md`. The sniff/validate *rules* live in
core (`src/core/media/validation.ts`) as pure functions over `{ mime, bytes, width, height,
durationSeconds }`; `file-type` and `sharp` are called from plain server modules in
`src/adapters/` — they are local, pure and fast, so they get no port (Principle VII).
**Abandoned uploads** (signed URL used, `finalizeUpload` never called) are cleared by a
lifecycle rule on the private bucket that deletes `original` objects older than one day whose
`asset.json` sibling does not exist — implemented as a tiny daily Cloud Scheduler job only if
the bucket shows it matters; until then a few stray originals cost cents.

## Alternatives rejected

- Proxying uploads through a Route Handler — blocked by the 32 MiB cap and would double
  egress.
- Cloud Storage "object finalize" events + a worker — the right answer at scale, but a second
  runtime and eventual consistency the builder would have to poll for. Tens of profiles do not
  justify it.
- Signed **read** URLs for private media — signed reads would break `next/image` caching and
  the kiosk; the public bucket holds only files a visitor is meant to see (ADR-015).
