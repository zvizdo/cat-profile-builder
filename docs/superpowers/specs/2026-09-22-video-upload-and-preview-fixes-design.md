# Video upload and trim preview fixes — design

Date: 2026-09-22
Status: approved; revised after an independent review (2026-09-22)

## Problem

Two bugs, both found with production logs (Cloud Run service `south-county-cats-adopt`,
2026-09-10 → 2026-09-22):

1. **The trim preview never plays a long original.** `GET /api/profiles/{id}/media/{mid}/original`
   answers `500` for any original over 32 MiB. Cloud Run logs `Response size was too large`
   at the same moment each time. Cloud Run refuses a single HTTP/1 response over 32 MiB that
   has a declared length. The route answers the browser's first `Range: bytes=0-` with the
   whole rest of the file, read into memory, with a `Content-Length`. A 29 MB original
   previewed fine; 41 MB and 61 MB originals failed on both iPhone and Android. Trimming
   still works (it reads the original on the server), and the published page plays (it uses
   the small `web.mp4`), which matches what volunteers reported.

2. **Uploads sometimes fail at the byte step, with no trace.** Every Server Action call
   answered `200`. In two cases (Android 2026-09-13 18:20:49Z, iPhone 2026-09-17 03:42:04Z)
   `beginUpload` ran and no original ever reached the private bucket, and no `finalizeUpload`
   followed. So the browser → Cloud Storage transfer failed. The client sends the whole file
   in one `PUT` to the resumable session and shows `Upload failed. Nothing was added.` on any
   error, with no retry and nothing logged. The Android case landed on `Try again` about
   four minutes later.

## Goals

- A long original previews in the trim editor on iPhone Safari and Android Chrome.
- An upload whose connection drops part-way resumes on its own before any toast.
- Every upload failure, and every upload a retry rescued, leaves one structured log line
  that says which step failed and how.

## Non-goals

- Uploading in fixed-size chunks (option C in brainstorming): not needed unless the new logs
  show single resumed `PUT`s still failing.
- Serving originals from signed bucket URLs: this would change the privacy model (originals
  are served only through the app to a signed-in volunteer).
- Changing the toast wording, the upload queue, or the finalize pipeline.

## Design

### 1. Capped range answers

**Core rule** — `src/core/media/byte-range.ts` gains:

```ts
/** Longest slice any media route answers in one response: well under Cloud Run's 32 MiB. */
export const MAX_RANGE_BYTES = 8 * 1024 * 1024;

/** `range` with its end pulled in so it spans at most `MAX_RANGE_BYTES`. */
export function capRange(range: ByteRange): ByteRange;
```

Pure; unit-tested at the boundaries (exactly 8 MiB, one byte over, a range already shorter,
a single byte).

**`/original`** — `serveOriginal` (`src/app/api/_lib/original.ts`):

- With a satisfiable `Range`: resolve it as today, then `capRange`, then read that slice with
  the existing `mediaStore.readRange` and answer `206` with `Content-Range: bytes
  {start}-{cappedEnd}/{size}`.
- With no `Range` header: answer as if `bytes=0-` had been sent — a capped `206` — instead
  of streaming the whole file as `200`. RFC 9110 defines `206` as the answer to a range
  request, so this is a deliberate departure: the route's only caller is the trim editor's
  `<video>`, which always sends `Range` (Chrome `bytes=0-`, Safari `bytes=0-1` first), and
  the alternative — a whole-file `200` — is exactly what Cloud Run refuses over 32 MiB.
- `416` and every error answer stay as they are. An original that vanishes between the size
  lookup and the read now answers `416` (it was `404` on the no-`Range` path).
- At most 8 MiB is held in memory per request, using the existing buffered `readRange`. No
  new port method is needed. This is a deliberate simplification (Principle VII) over adding
  a streaming range read to three stores.

**`/media`** — `serveDerived` (`src/app/api/_lib/derived.ts`) applies `capRange` to every
`206` it streams. It already sends a `206` for a `Range` request and a `200` for none. The
`200` path is unchanged: derived clips are transcoded to 15 s at up to 1080p and stay far
below the limit. This removes the same hidden limit from the range path without changing
what a plain `GET` of a poster returns.

**Contract** — `specs/001-cat-profile-builder/contracts/server-boundary.md` records that a
range answer covers at most 8 MiB, and that `/original` answers a request without `Range`
with a capped `206`. The cap is asserted in `tests/contract/server-boundary.test.ts` for both
routes, and those tests change first (Principle II).

### 2. Resumable upload with retries

All client-side, in `src/ui/builder/upload-client.ts`. The `PUT` path, used by the local
`fs` dev store, is unchanged. Only the GCS resumable path (`method: "POST"`) resumes.

**Flow:**

Every request goes through one `exchange` helper that never rejects: a transport error, an
abort, or **no upload progress for 30 s** (`STALL_MS`) all become status `0`. The stall
watchdog aborts the request. A hung mobile connection can go minutes without the browser
reporting an error; the Android case took about four minutes to reach `Try again`, which
fits that. The watchdog turns the hang into a retry.

A status is **retryable** when it is `0`, `408`, `429` or `5xx` (GCS's own retry guidance).
Retries wait **1 s, 4 s, then 15 s** — three retries, about 20 s for a phone to move between
networks; a resume only re-sends what storage lacks, so the longer tail is cheap.

1. `POST` the session start with the signed headers, retried on a retryable status.
   Any other failure ends it at once.
2. `PUT` the file to the session URL from `Location`, reporting progress.
3. On a retryable status during the `PUT`, and while retries remain:
   - Status check: `PUT` with an empty body and `Content-Range: bytes */{size}`.
   - `308` with `Range: bytes=0-N` → resume from `N + 1`. `308` with no `Range` → resume
     from 0. A `308` claiming every byte (`N + 1 ≥ size`) → check again on the next retry.
   - A retryable status on the check itself → check again on the next retry.
   - `200`/`201` → the object is complete; go to finalize.
   - Anything else (`404`/`410`: session gone; `4xx`) → fail.
   - Resume: `PUT file.slice(offset, file.size, file.type)` (keeping the type) with
     `Content-Range: bytes {offset}-{size-1}/{size}`.
     Progress reports `(offset + loaded) / size`, so the bar never jumps back.
4. When retries run out, throw `UploadFailure("network", UPLOAD_FAILED)` as today. The toast
   and `Try again` are unchanged.

**Pure helpers** (new, `src/ui/builder/resumable.ts`, unit-tested):

- `parseResumeOffset(status: number, rangeHeader: string | null, size: number): { done: true } | { offset: number } | { retry: true } | { fail: true }`
- `resumeRange(offset: number, size: number): string`
- `isRetryable(status: number): boolean`: `true` for 0, 408, 429 and 5xx.
- `RETRY_DELAYS_MS = [1000, 4000, 15000]`, `STALL_MS = 30_000`.

The wait between retries goes through an injectable `sleep` so tests do not wait.

### 3. Upload event reports

A new Server Action `reportUploadEvent` in `src/app/actions/media.ts`, with its logic in
`_lib/media.ts` beside the others. It takes a strict zod schema:

| Field | Type | Notes |
|---|---|---|
| `profileId` | `ProfileIdSchema` | |
| `mediaId` | `MediaIdSchema` | required: a report is only sent once `beginUpload` answered |
| `stage` | `"start" \| "send" \| "finalize"` | |
| `outcome` | `"failed" \| "resumed"` | `resumed` = a retry saved it |
| `status` | int 0–599 | last HTTP status seen; 0 = no response |
| `byteSize` | positive int | |
| `declaredType` | string ≤ 100 | |
| `confirmedBytes` | int ≥ 0 | bytes storage confirmed, or sent before a failure |
| `attempts` | int 1–10 | |

The action re-checks the session (`withSession`), validates the input, and writes one line
through the container logger: `warn` for `failed`, `info` for `resumed`. The line carries the
fields above plus the request's `User-Agent`. It never logs the file name, the signed URL or
the session URL. The session URL is a bearer credential (constitution, Logging and secrets).
The schema has no field that could carry either, and `strictObject` refuses extra fields.

The client never awaits a report. When it reports:
- a failed `start` or `send` (after retries), or a `finalizeUpload` call that rejects (the
  call itself threw, not an `ok: false` answer): at once, before the toast;
- a `start` or `send` that succeeded only on a retry (`outcome: "resumed"`): **after**
  `finalizeUpload` has answered. Next runs one client's Server Actions one at a time, so a
  report sent first would make finalize wait behind it.

**Reports are best-effort.** When the retries run out the network is usually still down, so
the failure report often cannot be sent either. A report whose call rejects is held in
memory (at most 20, oldest dropped) and sent again after the next upload that lands — in
practice, the volunteer's `Try again`. A failure followed by a page reload, or by no further
upload, is lost. The rejection handler re-holds the event, so no error is swallowed.

### 4. Bucket CORS

`infra/terraform/buckets.tf`, private bucket `cors.response_header` adds `Content-Range` and
`Range`. GCS uses this list both for the request headers a browser may send (`Content-Range`
on the status check and resume) and the response headers it may read (`Range` on the `308`).
It is applied with `terraform apply`, confirmed with the user first, before the client change
is deployed.

## Error handling summary

| Situation | Before | After |
|---|---|---|
| Original > 32 MiB in the trim preview | `500`, blank preview | capped `206`s, plays |
| Connection drops mid-upload | toast, nothing logged | resumes, up to 3 retries; `info` line |
| Connection stalls with no error | toast after minutes | aborted after 30 s, then resumes as above |
| Retries exhausted | toast, nothing logged | same toast; `warn` line with stage/status, sent now or after the next upload that lands |
| Session start refused (`4xx`) | toast | same toast, no retry; `warn` line |
| Finalize call never answers | toast | same toast; `warn` line (`stage: finalize`) |

## Testing

- Unit: `capRange`; the `resumable.ts` helpers; the upload client against a fake
  `XMLHttpRequest`, covering resume after a drop, `308` with and without `Range`, `200` on the
  status check, the 30 s stall watchdog, a `4xx` with no retry, retries exhausted, progress
  never going backwards (a drop after 90%, resumed from 40%), the resumed slice keeping the
  file's type, a rescue reported after finalize, and a report that could not be sent held
  and sent after the next upload.
- Contract (`tests/contract/server-boundary.test.ts`): `/original` capped `206` for
  `bytes=0-` on a > 8 MiB file and for a request without `Range`; `/media` range answers
  capped (`tests/contract/server-boundary.media.test.ts` for the action): `reportUploadEvent` refuses extra fields,
  requires a session, and its log line contains no URL or file name.
- Manual, after deploy: preview a video over 32 MB on iPhone Safari and Android Chrome;
  upload a long video and switch airplane mode on for about 3 s mid-upload; confirm it lands
  and an `upload event` line with `outcome: "resumed"` appears in Cloud Run logs. In Safari's
  Web Inspector, confirm the 308 carries `access-control-expose-headers` naming `Range`.

## Rollout

1. `terraform apply` for the CORS change (asks first).
2. Deploy the app.
3. Manual checks above.
4. Watch the logs for `upload event` lines over the following week. If failures show
   `stage: send` with retries exhausted, revisit option C (chunked upload).
