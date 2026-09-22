# Contract: Server boundary

Every Server Action and Route Handler validates its input with Zod, returns an explicitly
typed result, and never passes an unvalidated body into core. Errors share one body shape:

```
{ error: { code: string, message: string } }     // message is plain language, safe to show
```

Auth: `src/proxy.ts` guards `/builder/**`, `/api/helper/**`, `/api/profiles/**`; every
Server Action re-checks the session itself (ADR-011).

HTTP mapping for Route Handlers, with the `error.code` string each carries (the whole
vocabulary; `AppError` subclasses in `src/core/errors.ts` map one-to-one):
`400 invalid` bad input · `401 unauthorized` not signed in · `404 not_found` ·
`409 refused` refused by a rule (e.g. media in use) · `413 too_large` · `422 unsupported` content ·
`502 upstream` model or storage failure · `500 internal` anything else (message is generic;
detail is logged). Server Actions return `{ ok: true, ... } | { ok: false, error }` with the
same codes.

## Server Actions (signed-in unless marked public)

| Action | Input | Output | Notes |
|---|---|---|---|
| `signIn` | `{ username, password, next? }` | redirect or `{ ok: false, error, username }` | Single error string (FR-003). `username` echoes the submitted value so the form can re-seed the field after React's post-action reset; the password is never returned. ADR-011. |
| `signOut` | — | redirect | Clears cookie. |
| `listProfiles` | — | `{ profiles: ProfileSummary[] }` where `ProfileSummary = { id, name, thumbnailUrl: string \| null, line: string, state: "draft" \| "live" \| "archived", updatedAt }` (`line` is `displayLine(doc)` stored as object metadata at write time) | FR-028. One `objects.list`; fields come from object metadata (ADR-015). |
| `createProfile` | — | `{ id }` | Empty draft with default theme. Called from the "New cat" button; there is no GET route that creates (a prefetch must never create a draft). `IdSource` supplies the id; the store retries once on an existing folder. |
| `loadDraft` | `{ id }` | `{ document, assets: MediaAssetView[], state, url }` | Migrated and validated (FR-018/019). `assets` carry ready-made public URLs; `state` is `draft \| live \| archived` (from which files exist) and `url` the public address, so the topbar knows whether to offer Publish or Published without a second call. |
| ~~`saveDraft`~~ | — | — | Moved to `PUT /api/profiles/{id}/draft` (below) so `keepalive` saves on `pagehide` work. |
| `publish` | `{ id }` | `{ ok: true, url } \| { ok: false, error, problems: string[] }` | `problems` lists every missing item (FR-060). Contrast warning is returned separately as `warnings` and does not block. Writes the media manifest into `published.json` (ADR-015). |
| `unpublish` | `{ id }` | `{ ok }` | Immediate (FR-058). Deletes `published.json` (or `archived.json` via `deleteArchived`). |
| `archive` | `{ id }` | `{ ok }` | Moves `published.json` → `archived.json`. Page 404s, leaves carousel and index (FR-086). Only from `live`. |
| `restore` | `{ id }` | `{ ok, url }` | Moves `archived.json` → `published.json` unchanged (FR-087). Only from `archived`. |
| `deleteProfile` | `{ id }` | `{ ok } \| { ok: false, error }` | Drafts only (FR-092): `409` "Unpublish first" for live or archived. Deletes `profiles/{id}/` in both buckets. Confirmed in the UI first. |
| `beginUpload` | `{ profileId, fileName, byteSize, declaredType }` | `{ mediaId, uploadUrl, method, headers }` | Rejects over-limit sizes before any bytes move (FR-007); writes nothing. `method`/`headers` are exactly what the signed upload requires (GCS resumable POST with `x-goog-resumable` and `x-goog-content-length-range`; fs dev route PUT). Media is per cat (ADR-015). |
| `finalizeUpload` | `{ profileId, mediaId, fileName, declaredType }` | `{ asset, warnings } \| { ok: false, error }` | Sniff, size, dimensions, strip metadata, poster, describer. Deletes the object on failure. An id that already has a record is refused (`409` "This file was already added.") so a retry can never delete or overwrite an existing asset. |
| `reportUploadEvent` | `{ profileId, mediaId, stage: "start" \| "send" \| "finalize", outcome: "failed" \| "resumed", status, byteSize, declaredType, confirmedBytes, attempts }` | `{}` | Diagnostics only (2026-09-22): writes one `upload event` log line — `warn` for `failed`, `info` for `resumed` — with the fields and the request's `User-Agent` (≤ 300 chars). Strict schema: any other field is `invalid`, so a file name or signed/session URL can never be logged. The browser sends it without awaiting; a report that cannot be sent is held and resent after the next upload that lands — best-effort, so a failure while the network stays down may never arrive. |
| `setFocalPoint` | `{ profileId, mediaId, focal }` | `{ asset }` | |
| `setAltText` | `{ profileId, mediaId, text }` | `{ asset }` | Allowed any time (FR-011). Sets `alt.source = "volunteer"`. |
| `trimVideo` | `{ profileId, mediaId, start, end }` | `{ asset }` | `1 ≤ end - start ≤ 15`; refused otherwise naming the number (FR-078). Regenerates web, poster, alt from the clip only (FR-079). |
| `clearTrim` | `{ profileId, mediaId }` | `{ asset }` | |
| `enhancePhoto` | `{ profileId, mediaId }` | `{ asset }` (new id) | Deterministic `auto-v1` recipe (ADR-016); synchronous. Returns the new asset; the client shows before/after and, on accept, applies `replace_image` so it is one undoable step (FR-053). |
| `deleteMedia` | `{ profileId, mediaId }` | `{ ok } \| { ok: false, error }` | `409` naming the live or archived profile if in use (FR-076/087). Never edits the draft: a block still referencing the id renders the missing-media state and readiness lists it. |

Every Server Action returns `{ ok: true, ...fields } | { ok: false, error }`; rows above
abbreviate the success half.

## Route Handlers

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/profiles/{id}/media/{mid}/original` | signed-in | Streams the private original with `Range` support, for the trim editor only (ADR-006). Every answer is a `206` of at most 8 MiB (`MAX_RANGE_BYTES`) with `Content-Range`; a request without `Range` is answered as `bytes=0-` (Cloud Run refuses a response over 32 MiB). `416` with `Content-Range: bytes */size` for a range it cannot satisfy, or when the original vanishes between the size lookup and the read. `404` unless the asset is a video of this profile. |
| `GET` / `HEAD /media/profiles/{pid}/media/{mid}/{kind}.{rev}.{ext}` | public | *(F23, 2026-09-12)* One derived revision (`clean.{rev}.jpg`, `poster.{rev}.jpg`, `web.{rev}.mp4`), streamed by the app under **every** store — no bucket carries a public grant, so this is the only way a browser gets a derived file. `Range` (one `bytes=` range, `a-b` / `a-` / `-n`) → `206` with `Content-Range`, at most 8 MiB per answer (`MAX_RANGE_BYTES`; the player asks for the rest); `416` with `Content-Range: bytes */size` for a parsed range that starts past the end, runs backwards, or is a suffix of nothing; any other `Range` (another unit, several ranges) is ignored → `200` (RFC 9110 §14.2); `Accept-Ranges: bytes`; `ETag: "{rev}"` and `If-None-Match` → `304`; `Cache-Control: public, max-age=31536000, immutable`; `HEAD` answers the same headers with no body. `404` in the one error shape for a name outside the ADR-015 grammar or a rev never written; `502` when the store fails. Never an `original`. |
| `PUT /api/profiles/{id}/draft` | signed-in | Body: the whole `ProfileDocument`. Validated, `updatedAt` stamped, `draft.json` overwritten with list metadata (ADR-015). Returns `{ updatedAt }`. `400` on schema failure — the browser keeps its copy and shows the error (FR-027). |
| `POST /api/helper/chat` | signed-in | [helper-protocol.md](helper-protocol.md) |
| `GET /api/carousel` | public | `{ cats: CarouselCat[] }` — every **live** profile (not archived), most recently published first — no cap (the spec's scale is ~50 cats; Principle VII forbids a guard for a state that cannot occur): `{ url, name, line, age?, sex?, photos: [{ src, alt, focal }] (≤ 5, stack order, hero first), video?: { src, poster?, alt, durationSeconds } }` (`poster` absent when extraction failed, ADR-006). `line` is `displayLine(doc)` (tagline, else first sentence of bio); `age`/`sex` are the live document's own facts, omitted rather than sent empty (`sex` is only ever `"female"` or `"male"` here — FR-060's publish gate refuses `"unknown"`). `url` is the full public URL — it is also the QR target (FR-088). No ids beyond the URL, no draft data (FR-059). Kiosk polls every five minutes (FR-066). |

`POST /api/helper/chat`'s test-only `x-fake-scenario` header (T039): honoured only when
`MODEL=fake`, where it builds a fresh scripted model for that one request — an unknown
scenario name is `400 invalid`, the shared error shape, not a crash. Ignored entirely when
`MODEL=vertex`: the real model always answers, regardless of the header. Exists only so the
e2e suite can select a scripted conversation per run against its one shared server.

## Pages

| Route | Auth | Renders |
|---|---|---|
| `/sign-in` | public | Sign-in form |
| `/builder` | signed-in | Profile list with draft / live / archived badges; "New cat" calls `createProfile` and navigates |
| `/builder/{id}` | signed-in | Builder. Below **768 px** renders **phone mode** (FR-091): read-only canvas preview, helper panel, and editors for name, age, sex, tagline, media (focal, alt, trim, enhance), publish/unpublish/archive/restore. 768–1179 px is the touch layout, ≥ 1180 the full three-column layout. |
| `/builder/{id}/preview` | signed-in | The draft, rendered exactly as the public page (FR-026) |
| `/cats` | public | Public index of every live cat (FR-090) |
| `/cats/{slug}-{id}` | public | Published profile; `404` when no `published.json` — archived included (FR-083). Lookup by trailing id only; a stale slug is a `308` to the current one. |
| `/carousel?hold=` | public | Carousel page with visible controls; `hold` 4–20 s, default 8 (FR-089) |
| `/kiosk?hold=` | public | Fullscreen carousel, no builder chrome, wake-lock requested; same `hold`. Pointer controls (pause, previous, next, "open this cat") appear on pointer movement and fade after 3 s, so FR-063 holds on a laptop with a mouse. |

## Contract tests (`tests/contract/server-boundary.test.ts`)

For every action and handler: a malformed input returns `400`/`ok: false` with the shared
error shape; an unauthenticated call to a guarded action returns `401`; the happy path returns
the declared output shape. Plus the denials: `publish` with an empty name lists it;
`deleteMedia` on used media names the profile (live and archived); `finalizeUpload` on a
PNG renamed `.mp4` is `422`; `trimVideo` with a 0.5 s range is refused with "1 second" and
with a 16 s range is refused with "15 seconds"; `archive` on a draft is `409`; `restore`
reproduces the archived document byte-for-byte; `GET /api/carousel` omits archived cats;
`?hold=99` is clamped to 20; after `trimVideo` on a live cat, the live page's `src` is
unchanged and the draft's differs; `PUT …/draft` with a body missing `schemaVersion` is `400`.
