# ADR-015: Bucket layout and draft persistence

**Status**: accepted · **Date**: 2026-09-10 · Refines ADR-004 and ADR-005, which now
defer to this record for anything about paths, buckets, and write rules.

## Context

Everything durable — profile documents and media — lives in Google Cloud Storage with no
database. Seven storage questions were put to the shelter on 2026-09-10 and this record is
the result. The constraints it has to satisfy: originals are never served (FR-075); editing
a draft never changes what a visitor sees (FR-055); archive/restore is byte-exact (FR-087);
media of a live or archived cat cannot be deleted (FR-076); deleting a cat deletes its media
(spec Assumption); last write wins (Accepted Risk); the list view shows name, thumbnail and
state for every cat (FR-028); the kiosk and `next/image` need stable, cacheable URLs.

## Decision

### Two buckets

Google Cloud Storage grants read access per bucket (uniform bucket-level access; per-object
permissions are discouraged), so one bucket would make every draft and every original
readable by anyone who guessed an id. Therefore:

| Bucket (env var) | Access | Versioning | Holds |
|---|---|---|---|
| `GCS_PRIVATE_BUCKET` | app service account only | **on**, lifecycle deletes non-current versions after 30 days | documents, media records, originals |
| `GCS_PUBLIC_BUCKET` | `allUsers: objectViewer` *(superseded 2026-09-12, F23: app service account only — see the amendment below)* | off | derived files visitors fetch; every object `Cache-Control: public, max-age=31536000, immutable` |

### Layout

Media belongs to one cat. Everything about a cat lives under its id in both buckets, so
deleting a cat is two prefix deletes and "is this photo in use?" only looks at that cat.

```
PRIVATE
  profiles/{pid}/draft.json
  profiles/{pid}/published.json               present ⇔ live
  profiles/{pid}/archived.json                present ⇔ archived        (never both)
  profiles/{pid}/media/{mid}/asset.json       MediaAsset record
  profiles/{pid}/media/{mid}/original         bytes as uploaded; never served, never sent to a model

PUBLIC
  profiles/{pid}/media/{mid}/clean.{rev}.jpg  photo: EXIF-rotated, metadata stripped, long edge ≤ 2560 px, q85
  profiles/{pid}/media/{mid}/web.{rev}.mp4    video: trimmed ≤ 15 s, muted, ≤ 1080p, metadata stripped
  profiles/{pid}/media/{mid}/poster.{rev}.jpg video: poster frame
```

`{pid}` and `{mid}` are 8 characters from `[a-z2-7]`. `{rev}` is the first 10 hex
characters of the SHA-256 of the file's bytes.

### Derived files are immutable

A derived file is **never overwritten**. Re-trimming a video, re-cleaning a photo after an
enhancement, or regenerating a poster writes a new `{rev}` and updates `asset.json` to point
at it. Old revisions stay until the cat is deleted — no garbage collection in v1 (a cat has a
handful of files; a stale one costs cents; a sweeper that deletes the wrong file costs a live
page). Because URLs never change meaning, the public bucket can be cached forever by
browsers, `next/image`, and an event laptop.

### Publish freezes the page

`publish` resolves every media id the document references into a **manifest** and writes it
inside `published.json`:

```
PublishedDocument = ProfileDocument
                  + { publishedAt, slug, media: Record<mediaId, ResolvedMedia> }
ResolvedMedia     = { kind, src, poster?, alt, focal, width, height, durationSeconds? }
```

The public page, the public index and `/api/carousel` read **only** `published.json` —
never `asset.json`, never the draft. So a focal nudge, an alt-text edit, or a re-trim after
publishing changes nothing a visitor sees until the next Publish (FR-055), and archive →
restore, which are server-side copies of that one object, are byte-identical (FR-087).

### Draft saves

- The browser owns the working document. One second after the last change, and at most
  every five seconds while dirty, it sends the **whole document** to
  `PUT /api/profiles/{pid}/draft` (a Route Handler rather than a Server Action so that
  `fetch(…, { keepalive: true })` on `pagehide` still lands). Documents are a few KB.
- The server parses the body with `ProfileDocumentSchema`, stamps `updatedAt`, and
  overwrites `draft.json` with no generation precondition — last write wins, as accepted.
- The write sets **custom object metadata** `name`, `thumbnail-url` and `updated-at`. The
  server computes `thumbnail-url` on each save from the draft's first photo in stack order
  (the hero when present; a video's poster if that is all there is) by reading that one
  `asset.json` — one small read per save, none per list. The list view is then a single
  `objects.list` over `profiles/` that returns every object name and its metadata: state
  comes from which of `published.json` / `archived.json` exist beside each draft, name and
  thumbnail from the draft's metadata. No document is read to render the list. The public
  index uses the same "first photo" rule from the published manifest.
- Helper edits are saved exactly like manual ones — there is no generation mode and no
  pause in autosave. A browser crash mid-response leaves whatever had landed, which on
  reopen is simply sections on a page (FR-081).
- **Offline**: every change also mirrors the working document to `localStorage` under the
  profile id (wrapped in try/catch; it is a convenience, not the store). While a `PUT` fails
  the builder shows "You're offline. Your last change is saved here and will sync when you're
  back." and retries with backoff. On reopen, if the local copy's `updatedAt` is newer than
  `draft.json`'s, the volunteer is offered "Restore unsaved changes" (FR-024, SC-007).
- **Canonical address**: `/cats/{anything}-{pid}` resolves by `pid`; if the readable part
  differs from the published slug the response is a `308` to the canonical path (FR-083).
- GCS allows about one write per second to the same object name; the one-second debounce
  keeps autosave under it.

### Delete

Deleting a cat is offered only while it is a draft (FR-092) and hard-deletes
`profiles/{pid}/` in both buckets after confirmation. Versioning
on the private bucket means an administrator can still recover the documents and originals
with `gcloud` for 30 days; public derived files are gone for good. No trash folder, no
restore-from-trash UI (spec: not undoable).

### Restore when the draft has moved on

`restore` copies `archived.json` back verbatim and leaves `draft.json` alone. If the draft
was edited meanwhile, the builder shows "The live page is older than this draft" until the
next Publish. Nothing is auto-published.

### Media-in-use guard

Before deleting a media id, read that cat's `published.json` and `archived.json` (if
present) and refuse if either manifest contains the id, naming the cat (FR-076/087). Only
that cat is checked, because media is per cat.

### Local development

`STORE=fs` swaps in a **filesystem adapter** that writes the same paths under
`DATA_DIR/private/` and `DATA_DIR/public/` (default `.data/`, git-ignored). Files can be
opened in an editor; `rm -rf .data` resets. End-to-end tests use it too. Unit and contract
tests keep the in-memory fake. Both implement the same `ProfileStore` and `MediaStore`
ports as the GCS adapter, so the layout is exercised without credentials. One consequence:
a clip's URI comes back as `file:///…` instead of `gs://…`, so pairing `STORE=fs` with
`MODEL=vertex` always fails video description by design — see ADR-006.

## Alternatives rejected

- **One public bucket** — drafts and originals readable by URL.
- **One private bucket with signed read URLs** — breaks caching, and the kiosk would need
  fresh links all day.
- **Global media library** — needed only for a photo shared across cats; would make delete
  and in-use checks cross-cat.
- **Live page reads `asset.json`** — a re-trim would change a reviewed page silently.
- **Overwriting derived files in place** — same problem, plus cache invalidation.
- **`profiles/index.json`** — a second source of truth that last-write-wins would let drift;
  object metadata gives the list in one call without it.
- **Trash folder with restore** — the spec says delete is not undoable; versioning already
  gives an administrator a net.
- **Sweeping stale revisions on publish** — a reference-scan bug deletes a live file; the
  saving is cents.

## Amendment 2026-09-12 (F23): no public grant; the app is the public bucket's only reader

The organisation the shelter's project lives in enforces `iam.allowedPolicyMemberDomains`,
which forbids `allUsers` (and `allAuthenticatedUsers`) in any IAM policy — the
`allUsers: objectViewer` grant above cannot be made. Rather than fight the policy, the
delivery side of this record changes and the storage side does not:

- **The public bucket keeps its name, its layout and its immutable-rev rule.** Objects are
  still written once with `Cache-Control: public, max-age=31536000, immutable`; the
  "public" in its name now means "holds what visitors may see", not "readable by anyone".
  Its only principal is the app's service account (`roles/storage.objectAdmin`, as before).
- **Delivery is the app's `/media` route under every store** — the route the filesystem
  store already used, now the only one; ADR-007's amendment of the same date and the
  `/media` row of `contracts/server-boundary.md` carry the contract. `publicUrl` answers
  the root-relative `/media/profiles/{pid}/media/{mid}/{kind}.{rev}.{ext}` on GCS too, and the route streams
  the object through `MediaStore.readDerivedRange` with `Range`, `HEAD`, `ETag` (the rev)
  and the same forever cache header. Browsers, `next/image` and an event laptop cache it
  just as they would have cached the bucket. A published manifest therefore never carries a
  bucket host; `PublicMediaUrlSchema` keeps accepting `https:` only for manifests written
  before this amendment.
- **Nothing about uploads changes**: the browser still sends the original to the private
  bucket over a V4 signed resumable URL.
- **Infra follow-up** (Terraform is F18's; not touched by F23): remove the `allUsers`
  bucket binding the `public_access` variable gates (how visitors reach the Cloud Run
  service itself is a separate question for that record); `PUBLIC_BASE_URL` remains the QR
  and share base only.

The "one private bucket with signed read URLs" alternative above stays rejected for the
same reason it was: signed links expire, which breaks the forever cache and the kiosk.
