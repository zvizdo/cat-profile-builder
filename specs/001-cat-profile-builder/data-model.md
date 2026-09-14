# Data Model: Cat Profile Builder

**Branch**: `001-cat-profile-builder` | **Date**: 2026-09-10

Every shape below is defined **once** as a Zod schema in `src/core/` and its TypeScript type
is derived from it (Principle VI). Nothing here is a class; documents are plain JSON. Field
names are the ones the schemas will use.

## ProfileDocument (`src/core/profile/schema.ts`)

The durable asset. Stored in the private bucket as `profiles/{pid}/draft.json` and, once published, as
`profiles/{pid}/published.json`; archiving moves that copy to `profiles/{pid}/archived.json`
(ADR-004, ADR-015). Publication state — `draft` / `live` / `archived` — is which of those
files exists. `draft.json` also carries object metadata `name`, `thumbnail`, `updated-at`
for the list view.

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` | literal `1` | Every document carries it; loading an older version runs `migrate()` (FR-019). The hero-at-`blocks[0]` rule below (Checkpoint 2, F1) is a refinement of this same v1 schema, not a version bump — nothing was in production yet, so no stored document predates it (constitution Principle VI waiver, recorded in F1's commit). |
| `id` | string, 8 chars `[a-z2-7]` | Immutable. The trailing part of the public URL. |
| `name` | string ≤ 60, may be empty | Empty allowed in a draft; required to publish (FR-015). |
| `age` | string ≤ 30, optional | Free text ("3 years", "kitten"). Optional in a draft; required to publish (FR-015, Checkpoint 2). |
| `sex` | `"female"` \| `"male"` \| `"unknown"`, optional | Optional in a draft; `"female"` or `"male"` required to publish — `"unknown"` and unset both count as missing (FR-015, Checkpoint 2). |
| `tagline` | string ≤ 80, optional | One line under the name on the hero and the carousel (FR-014). `displayLine(doc)` in core returns it, or the bio's first sentence, or empty. |
| `blocks` | `Block[]`, ≤ 30 | Ordered. Ids unique within the document. `blocks[0]` is always the hero (Checkpoint 2, F1; a v1 rule — no stored document predates it): mandatory, and fixed at the top — it cannot be removed, duplicated, or moved. |
| `theme` | `Theme` | Always present; default preset `paper`. |
| `updatedAt` | ISO datetime | Set by the server on every write. |

**Published copy** (`PublishedDocument`) adds:

| Field | Type | Rules |
|---|---|---|
| `publishedAt` | ISO datetime | Set at publish. |
| `slug` | string, `[a-z0-9-]{1,40}` | Derived from `name` at publish time; cosmetic (FR-057). |
| `media` | `Record<mediaId, ResolvedMedia>` | The **manifest**: every media id the blocks reference, resolved at publish. Public surfaces read only this, never `asset.json` (ADR-015). |

```
ResolvedMedia = { kind: "photo" | "video", src: HttpUrl, poster?: HttpUrl,
                  alt: string, focal: { x, y }, width, height, durationSeconds? }
```

`src` and `poster` carry the content-hash revision in the name, so they never change meaning.
*(Amended 2026-09-12, F23)* Under every store they are root-relative `/media/profiles/…` paths
served by the app itself (`PUBLIC_MEDIA_PATH` in `src/core/media/public-path.ts`); the schema
still accepts a full `https:` URL for a manifest written before F23, but no store produces one.

### Publish readiness (`src/core/profile/readiness.ts`)

`checkReadiness(doc, assets)` returns a list of plain-language problems, empty when
publishable (FR-060, FR-074, FR-081), in document order: the name, then age, then sex
(Checkpoint 2, F1), then each block's own problems in block order — the hero's, since it is
always `blocks[0]`, land right after age and sex.

- name is empty → "Give the cat a name."
- age is empty (Checkpoint 2, F1) → pronoun-aware: "Add her age." / "Add his age." / "Add their age."
- sex is not `"female"` or `"male"` (Checkpoint 2, F1) → "Say whether she's female or male." in the recorded sex's pronoun — unreachable in practice, since this problem exists exactly when the sex is not recorded, so the sentence always falls to its neutral form: "Say whether the cat is female or male."
- the helper is working (reducer state, checked by the Publish button, not by `checkReadiness`) → "Wait for the helper to finish."
- any referenced media id is unknown → "A photo or clip is missing from the library."
- any referenced media asset has `alt === null` → "Write a description for {file name}."
- any referenced video has `status: "needs-trim"` or a trim longer than 15 s → "Trim {file name} to 15 seconds or less."
- any referenced asset has `status: "processing"` → "{file name} is still processing."
- an empty section (FR-060): hero/photo/video/quote with `mediaId: null` → "The {section} has no photo." / "…no clip."; bio with no text → "The bio is empty."; gallery with zero ids → "The gallery has no photos."; a day scene with null media or empty caption → "Scene {n} of 'A day in her life' needs a photo and a caption."; a needs card with empty text → "Card {n} of 'What she needs' is empty."
- theme contrast < 4.5:1 → a **warning**, not a problem (FR-031, Waiver 3).

## Block (`src/core/profile/schema.ts`)

Discriminated union on `type`. Every block has `id` (string, 12 chars) and `type`.

| Type | Content fields | Rules |
|---|---|---|
| `hero` | `mediaId: string \| null` | The name shown comes from the profile. `null` renders the striped placeholder in the builder and blocks publishing. Exactly one hero per document, fixed at `blocks[0]` (schema-enforced; Checkpoint 2, F1; FR-016, FR-021) — the hero has no duplicate, remove, or move action, and a document with no hero, or with one anywhere but first, fails validation. |
| `bio` | `content: RichText` | See RichText. May be empty in a draft. |
| `photo` | `mediaId: string \| null`, `caption?: string ≤ 200` | |
| `gallery` | `mediaIds: string[]` (0..12) | Order is display order. |
| `video` | `mediaId: string \| null` | Must reference a `video` asset. |
| `day` | `scenes: Array<{ mediaId: string \| null, caption: string ≤ 120 }>` (exactly 3) | "A day in her life": a pinned three-scene scroll sequence. Captions may be empty in a draft. |
| `needs` | `cards: Array<{ title: string ≤ 60, text: string ≤ 240 }>` (1..3) | "What she needs in a home". |
| `quote` | `mediaId: string \| null`, `text: string ≤ 200`, `attribution?: string ≤ 60` | A photo with a line from the foster over a scrim. |

Media references are **ids only**; nothing about the file is copied into the document.
**Duplicate** (FR-021) is not a separate operation: the builder issues `add_block` with a
deep copy of the block and fresh ids, at `index + 1`.

## RichText (`src/core/profile/rich-text.ts`)

```
RichText  = { paragraphs: Paragraph[] }          // ≤ 40 paragraphs
Paragraph = { runs: Run[] }                       // ≤ 200 runs
Run       = { text: string ≤ 2000, bold?: true, italic?: true, href?: HttpUrl }
```

`HttpUrl` is a string that parses as a URL with protocol `http:` or `https:`. Rendered by
React elements, never by an HTML string (FR-020). ADR-013.

## Theme (`src/core/profile/theme.ts`)

| Field | Type | Rules |
|---|---|---|
| `preset` | `"paper"` \| `"card"` \| `"night"` \| `"sand"` | Curated set; each passes AA as shipped (FR-029). |
| `warmth` | number 0..1, step 0.01 | Bounded tuning (FR-030). Default 0.5. |
| `contrast` | number 0..1, step 0.01 | Bounded tuning. Default 0.5. |

`resolveTheme(theme)` in core returns `{ backgroundA, backgroundB, ink, accent }` as hex
strings deterministically. Each preset has base values from `TOKENS.json` (Paper: paper /
paper-deep / ink / blue; Card: card / paper / ink / blue; Night: `#141A21` / night /
blue-light-as-ink `#E8EEF4` / blue-light; Sand: `#EFE6D8` / `#E3D6C2` / ink / blue-deep). In every
preset `backgroundA` is the section surface and `backgroundB` the page ground behind it (the
surface sits lighter than the ground on Paper/Card/Sand and on Night too, as the hi-fi draws it).
`warmth` rotates the two background hues toward 40° (amber) by up to ±12° of hue and ±4 % of
saturation around the preset; `contrast` scales the lightness gap between `ink` and the
backgrounds between 0.5× and 1.15× of the preset's. Every preset passes at the default
0.5/0.5; the low end of `contrast` is wide enough that pushing it to 0 fails 4.5:1 on every
preset, so the FR-031 warning is reachable and Waiver 3 (a publishable failing combination)
is a real choice rather than an unreachable branch. `warmth` never changes lightness, so it
cannot fail contrast on its own.
`contrastRatio(ink, worst(backgroundA, backgroundB))` powers the publish warning; the rule is
≥ 4.5:1 for every preset including Night (light ink on dark). Text over photographs sits on
the fixed scrim and is exempt from this check (it is white on ≥ 0.8 black). The accent is
checked at 3:1 and only warns. FR-031's "restore a passing combination" is a `set_theme` to
`{ warmth: 0.5, contrast: 0.5 }`, which is undoable. The document never stores a colour.

## MediaAsset (`src/core/media/schema.ts`)

Stored in the private bucket as `profiles/{pid}/media/{mid}/asset.json` (ADR-005, ADR-015).
One per uploaded or enhanced file. Media belongs to exactly one cat.

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` | literal `1` | Same rule as the profile: migrated on load, validated both ways. |
| `id` | string, 8 chars | |
| `kind` | `"photo"` \| `"video"` | Decided by sniffed content, not the file name. |
| `fileName` | string ≤ 200 | Original name, for messages only. Never used as a path. |
| `mimeType` | string | The sniffed type. |
| `bytes` | integer | Of the original. |
| `width`, `height` | integers | Of the clean/web version. |
| `durationSeconds` | number, video only | Of the web version (after trim). |
| `focal` | `{ x: 0..100, y: 0..100 }` | Default `{ 50, 50 }`. Drives every crop (design adoption). |
| `status` | `"processing"` \| `"needs-trim"` \| `"ready"` | `needs-trim` only for a video whose original is longer than 15 s and has no trim yet (FR-078). |
| `alt` | `{ text: string 1..300, source: "model" \| "volunteer" } \| null` | `null` = not yet described. Publishing requires non-null (FR-012). Visible and editable on the tile at any time (FR-011). |
| `descriptionStatus` | `"ready"` \| `"failed"` \| `"pending"` | `failed` makes the builder ask the volunteer (FR-073). |
| `originalDurationSeconds` | number, video only | Of the uploaded file. Decides `needs-trim`. |
| `trim` | `{ start: number, end: number }`, video only, optional | Seconds into the original; `1 ≤ end - start ≤ 15`. Required when `originalDurationSeconds > 15`. |
| `enhancement` | `{ sourceMediaId, recipe: "auto-v1" }`, optional | Present on enhanced photos only (FR-054, ADR-016). `alt` and `focal` are copied from the source at creation. |
| `revisions` | `{ clean?: rev, web?: rev, poster?: rev }` | The content-hash revision of each current derived file. Public URLs are built from `pid`, `mid`, the kind, and the rev — never stored as paths, so a record cannot point outside its own folder. |
| `createdAt` | ISO datetime | |

### Media state transitions

```
uploading ──finalize ok──▶ processing ──describer ok──▶ ready
    │                 │        │                          │
    │                 │        └─describer fails──▶ ready + descriptionStatus: failed
    │                 │                                    │  (volunteer writes alt → ready)
    │                 └─video > 15 s──▶ needs-trim ──trim ≤ 15 s──▶ processing
    └─finalize fails: deleted
ready ──trim (1–15 s)──▶ processing (web + poster + alt regenerated) ──▶ ready
ready ──enhance──▶ new asset (enhancement set) ──▶ ready   (sharp, synchronous, no describer run)
ready ──edit alt──▶ ready (source: volunteer)
ready ──delete──▶ refused if any published.json or archived.json references it, else gone
```

The describer receives `web.mp4` only — the trimmed, ≤ 15 s clip — never the original
(FR-079).

## EditOperation (`src/core/profile/operations.ts`)

The only vocabulary in which the document changes — from the builder's own controls and from
the helper alike (FR-039, Principle VIII). Discriminated union on `op`:

| `op` | Input | Destructive when |
|---|---|---|
| `set_field` | `{ target: { kind: "profile" } \| { kind: "block", blockId }, path, value }` — profile paths: `name`, `age`, `sex`, `tagline`; block paths per type: `content` (bio), `caption` (photo), `mediaIds` (gallery — the whole list; dropping an id is destructive), `scenes.{0-2}.caption`, `cards` (whole list, 1..3) or `cards.{n}.title` / `cards.{n}.text`, `text` / `attribution` (quote). The path grammar is a Zod union per block type; anything else is rejected. `value: null` clears `sex` back to unset (F10); every other path refuses a `null` value as `invalid`. | Replacing non-empty text the volunteer wrote, or dropping a gallery id |
| `add_block` | `{ block: BlockInput, index?: number }` | never |
| `remove_block` | `{ blockId }` | always |
| `reorder_blocks` | `{ order: string[] }` — must be a permutation of current ids | never |
| `set_theme` | `{ preset?, warmth?, contrast? }` | never |
| `replace_image` | `{ blockId, mediaId, slot?: number }` — `slot` **required** for `gallery` and `day`, must be in range; forbidden for other types | when the previous slot held an uploaded (not enhanced-from-it) photo |

`applyOperation(doc, op, ctx): Result<ProfileDocument, OperationError>` is pure: it validates
the operation, applies it, validates the resulting document against `ProfileDocumentSchema`,
and returns either the new document or a typed error naming what was refused. It never
mutates. `ctx.assets` is the list of `{ id, kind }` the profile owns, so an `add_block` or
`replace_image` naming an unknown id, or a video id in a photo slot, is **rejected** rather
than landing as missing media (FR-040).
`describeOperation(doc, op): { summary: string; destructive: boolean }` produces the plain
sentence the proposal card shows (FR-038/043) and the "what changed" line afterwards (FR-042).

## Builder session (client memory only)

Not persisted (spec: not retained after the builder is closed). Two reducers own it:

**`src/core/helper/reducer.ts`** — the helper:

| Field | Type | Notes |
|---|---|---|
| `messages` | AI SDK `UIMessage[]` | The conversation, including tool parts. |
| `status` | `"locked"` \| `"ready"` \| `"working"` | `locked` until one photo exists (FR-032); `working` while a response streams. No other modes. |
| `surface` | `"full"` \| `"phone"` | Sent with every request so the prompt can say what the volunteer can and cannot do by hand (FR-091). |
| `turn` | `{ entryId, applied: OperationSummary[] } \| null` | The open history entry for the current response; closed when the stream ends. |

**`src/core/profile/history.ts`** — undo, shared by manual and AI edits (FR-025):
`{ past: Entry[]; future: Entry[] }`, `Entry = { before, after, label }`. A manual edit is
one entry; **everything the helper applies in one response is one entry** (FR-036), opened
at its first applied edit and closed when the stream ends. Covers the page document only;
media-record edits are outside it by decision (FR-025).

## Session token (`src/adapters/auth/session.ts`)

JWT payload `{ sub: "shelter", iat, exp }`. No other claims; nothing user-specific exists.

## Configuration (`src/adapters/config.ts`)

Validated once at boot; the app refuses to start otherwise.

| Variable | Purpose |
|---|---|
| `SHELTER_USERNAME`, `SHELTER_PASSWORD_HMAC`, `SESSION_SECRET` | ADR-011 |
| `GCS_PRIVATE_BUCKET`, `GCS_PUBLIC_BUCKET`, `GOOGLE_CLOUD_PROJECT`, `VERTEX_LOCATION` | ADR-015, ADR-001 |
| `DATA_DIR` | Local folder for the filesystem adapter when `STORE=fs` (default `.data`) |
| `MODEL_DRAFTING`, `MODEL_DESCRIBER` | ADR-003 |
| `PUBLIC_BASE_URL` | Building the shareable link and the QR target. `.env.example` sets `http://localhost:3000`; for a phone-scan check on a LAN set the laptop's address. |
| `STORE` | `memory` \| `fs` \| `gcs` — which `ProfileStore`/`MediaStore` (ADR-012/015) |
| `MODEL` | `fake` \| `vertex` — which language model and describer (ADR-012) |
| `FAKE_MODEL_SCENARIO` | Scripted conversation name when `MODEL=fake` |
| `FAKE_DESCRIBER` | `fail` makes the fake describer return `{ failed }` for every call when `MODEL=fake` — drives the FR-073 path |
| `FPS_GATE` | `1` makes the fps e2e assert instead of record (ADR-009) |
| `LOG_LEVEL` | pino level for the server logger (`silent` in tests; default `info`) — validated like every other variable so the logger never reads raw `process.env` |
