# Research: Cat Profile Builder

**Branch**: `001-cat-profile-builder` | **Date**: 2026-09-10 | **Plan**: [plan.md](plan.md)

This file resolves every unknown in the plan's Technical Context. Each decision that is
expensive to reverse is also written up as an Architecture Decision Record (ADR) under
`references/project/adr/`; the table in §1 points at them. §2 is the ledger of where the design
handoff in `references/design/` disagrees with the spec and what was done about each.

Decisions were taken in a planning session on 2026-09-10 (two rounds of questions, eight
choices), with library facts checked against current documentation the same day.

## 1. Decisions

| # | Question | Decision | ADR |
|---|----------|----------|-----|
| 1 | AI integration library | Vercel AI SDK v6 (`ai`) with the Google Vertex provider | [ADR-001](../../references/project/adr/001-ai-sdk-and-provider.md) |
| 2 | How AI edits reach the document | Server proposes via tool calls; browser confirms, validates, applies, undoes | [ADR-002](../../references/project/adr/002-helper-edit-protocol.md) |
| 3 | Model identifiers | Drafting `gemini-3.8-flash`; describer `gemini-2.5-flash-lite` — read from env; no image model | [ADR-003](../../references/project/adr/003-model-ids.md) |
| 4 | Publishing model | Publication state = which file exists; publish/unpublish/archive/restore as object copies | [ADR-004](../../references/project/adr/004-profile-persistence.md) |
| 5 | Media upload path | Direct-to-GCS resumable upload via signed URL, then server-side finalize + validation | [ADR-005](../../references/project/adr/005-media-upload-and-storage.md) |
| 6 | Video trim and poster extraction | `ffmpeg` inside the Cloud Run container, behind a `VideoProcessor` port | [ADR-006](../../references/project/adr/006-video-processing.md) |
| 7 | Image delivery | `next/image` against public bucket URLs; originals never linked | [ADR-007](../../references/project/adr/007-image-delivery.md) |
| 8 | Styling system | Tailwind v4 with a replaced (not extended) theme for the tools; CSS Modules for the published page and carousel; one token file | [ADR-008](../../references/project/adr/008-styling.md) |
| 9 | Animation | Pure CSS (scroll-driven where supported) with an IntersectionObserver fallback; no animation library | [ADR-009](../../references/project/adr/009-animation.md) |
| 10 | Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` | [ADR-010](../../references/project/adr/010-drag-and-drop.md) |
| 11 | Authentication and session | HMAC-compared password from env; `jose` HS256 JWT in an httpOnly cookie, 30 days, renewed on use | [ADR-011](../../references/project/adr/011-auth-and-session.md) |
| 12 | Test tooling | Vitest (V8 coverage) + Testing Library for unit/component/contract; Playwright + axe for journeys | [ADR-012](../../references/project/adr/012-testing.md) |
| 13 | Rich text model | Own JSON schema (paragraph → runs of text/bold/italic/link); Tiptap as the editor, mapped both ways in core | [ADR-013](../../references/project/adr/013-rich-text.md) |
| 14 | Publishing model | Separate `published.json`; URL `/cats/{slug}-{id}`; lookup by id, slug is cosmetic | [ADR-004](../../references/project/adr/004-profile-persistence.md) |
| 15 | Hosting and CI | Cloud Run from a Dockerfile with ffmpeg; GitHub Actions runs every constitution gate | [ADR-014](../../references/project/adr/014-hosting-and-ci.md) |
| 17 | Photo enhancement | Deterministic one-click `sharp` recipe `auto-v1`; Nano Banana deferred | [ADR-016](../../references/project/adr/016-photo-enhancement.md) |
| 16 | Bucket layout, draft saves, publish freeze | Two buckets (private/public); media per cat; content-hashed immutable derived files; publish embeds a media manifest; whole-document autosave to a Route Handler; versioning 30 days; hard delete; filesystem adapter for local dev | [ADR-015](../../references/project/adr/015-bucket-layout-and-draft-persistence.md) |

### Smaller decisions (no ADR — cheap to reverse)

- **Structured logging**: `pino`. Prompts and model output are logged at debug only, through a
  redaction hook at the logger boundary.
- **Content sniffing**: `file-type` reads magic bytes so a `.jpg` that is really a `.exe` is
  rejected on content (FR-008). **Image metadata and dimensions**: `sharp` — it also strips
  EXIF (location) by default when writing, which satisfies FR-009, and produces the ≤6
  downscaled photos sent to the model (FR-082).
- **Short id**: 8 characters from a crypto-random base32 alphabet, supplied by the `IdSource`
  port (adapter: `crypto.getRandomValues`; fake: sequential). Collision at 50 profiles is
  negligible; `ProfileStore.create` retries once if the folder exists.
- **Contrast**: WCAG 2.1 relative-luminance ratio computed in core over every gradient stop;
  the worst stop must be ≥ 4.5:1 for body text. Warns, does not block (Waiver 3).
- **Carousel roster refresh**: the kiosk polls `GET /api/carousel` every five minutes and
  reconciles the roster in place, so it picks up new cats without a reload (FR-066).
- **QR code**: `qrcode` (npm) rendering an SVG client-side, error-correction level H, target
  `PUBLIC_BASE_URL/cats/{slug}-{id}` (FR-088). One dependency for one real need.
- **Hold parameter**: `?hold=<seconds>` parsed with Zod, clamped to 4–20, default 8 (FR-089).
- **Video length gate**: an original longer than 15 s gets asset status `needs-trim`; no web
  version, poster, or description is produced until a trim of ≤ 15 s exists. Publishing lists
  it as missing (FR-060/078). An original ≤ 15 s is processed at once with no trim.
- **Tagline fallback**: `displayLine(doc)` in core — the tagline, else the bio's first
  sentence (split on the first `.`, `!` or `?` followed by whitespace), truncated to 80
  characters on a word boundary with an ellipsis so it never exceeds what a tagline may be.
- **Carousel turn**: one media per turn, a different one each loop — `media = floor(step /
  cats.length) % cat.media.length`, the design's own formula. A clip is cut at the end of
  the turn. Chosen over a montage: one photo per beat is what makes the drift and wipe read.
- **Empty sections block publishing**, named individually (design proposal adopted, FR-060).
- **Undo is page-only**: focal, alt, trim and enhance save immediately with their own way
  back (FR-025 amended).
- **HEIC**: not decoded; the picker's `accept` makes iOS convert on the way up; stray HEIC is
  refused (ADR-005).
- **Audio dropped** (`ffmpeg -an`): videos are silent everywhere; no sound control exists.
- **Offline**: `localStorage` mirror + "Restore unsaved changes" (ADR-015); the design's
  offline toast string is adopted.
- **Skills**: recurring helper jobs are Markdown playbooks loaded with `load_skill` —
  `build-profile` (holds the interview), `write-bio`, `pick-theme`, `tidy-order`. Trusted
  project text, not volunteer data; editable without code. No interview mode or counter.
- **Helper reach** (FR-093): pull-only. Reads: `read_outline`, `read_page`, `read_blocks`,
  `list_media` (browser-answered from memory), `view_photos` (server, 12 per request). Writes:
  the six operations. No media-record tools, no screenshot. Nothing pushed.
- **fps gate**: recorded on every CI run, asserted only with `FPS_GATE=1` on a GPU machine
  (ADR-009).
- **Fake switches**: `STORE=memory|fs|gcs`, `MODEL=fake|vertex` (ADR-012).
- **Canonical URL**: stale slug → `308` (ADR-015). **Carousel**: every live cat, 5 photos each, no cap (Principle VII — ~50 cats).
- **Delete**: drafts only (FR-092). **Phone mode** starts below 768 px (FR-091).
- **Poster**: always trim start + 0.5 s; the design's "cover frame" picker is not built.
  **Icons**: the twelve hand-drawn ones only; no Lucide dependency.
- **`@google-cloud/storage`**: the official client for signed URLs, metadata and server-side
  copy (ADR-015). **`@ai-sdk/react`**: `useChat` lives here in AI SDK v5+. **`tsx`**: runs
  the three scripts.
- **Undo history**: array of `{ before, after, label }` whole-document snapshots. Documents are
  a few KB; exact restore (FR-041) falls out of it for free.
- **Autosave**: debounce 1 s after the last change, hard flush at 5 s while dirty, flush on
  `pagehide` with `keepalive`. Last write wins (Accepted Risk). Helper edits save exactly like manual
  ones; there is no generation mode. Detail in ADR-015.

## 2. Design handoff vs spec — ledger

First pass (2026-09-10, morning): the user chose **Hybrid** — spec wins, three low-cost
additions adopted. Second pass (same day): every remaining conflict was put to the user one
by one. This table is the complete outcome; every item is recorded in the spec under
Clarifications → Session 2026-09-10 and in the amended requirements.

### Adopted

| Design item | Decision | Where it lands |
|---|---|---|
| Per-photo **focal point** `{x, y}` | Adopted | `MediaAsset.focal`; every crop is `object-position`; picker in the builder (also in phone mode). |
| **Four named themes** + warmth/contrast sliders | Adopted as FR-029/030's "curated + bounded tuning" | `Theme { preset, warmth, contrast }`; gradient computed in core. |
| **Tokens, type, spacing, motion, copy voice** | Adopted | `src/ui/tokens.css` generated from `TOKENS.json`; `CONTENT.md` strings where the surface exists. |
| Editorial sections: **"A day in her life"**, **"What she needs"**, **quote photo** | Adopted as three new **block types** (FR-016) — the stack stays free | `day`, `needs`, `quote` blocks; the AI may use them in a first draft. |
| **QR "scan to keep" card** on the carousel | Adopted (FR-088) | `qrcode` rendered as SVG, error-correction H, points at the cat's URL. |
| Alt text **visible and editable** | Adopted, but not required (FR-011) | Shown on the media tile detail; `setAltText` allowed any time; source becomes `volunteer`. |
| **One-line tagline** under the name | Adopted (FR-014) | Optional `tagline` ≤ 80 chars; falls back to the bio's first sentence. |
| **Public "all cats" index** | Adopted (FR-090) | Public `/cats` page from the same roster as the carousel. |
| **Empty block blocks publishing** (CONTENT.md proposal) | Adopted (FR-060) | Readiness names the section. |
| **Offline toast** ("You're offline…") | Adopted | ADR-015 offline mirror. |
| **Too-small photo warns, never blocks** | Adopted (FR-008) | 1200 px long edge. |
| **Unsupported-file modal copy** | Adopted | JPEG/PNG/WebP, MP4/MOV. |
| Configurable hold per cat | Adopted in reduced form (FR-089) | `?hold=` on `/carousel` and `/kiosk`, default 8 s, clamped 4–20 s. No settings screen. |
| Builder breakpoints ≥1440 / 1180 / 1024 | Adopted for tablet and laptop | Below 1024 is **phone mode** (below), not read-only. |

### Adopted in changed form

| Design item | Decision |
|---|---|
| Read-only builder below 1024 px | **Phone mode** (FR-091): upload, interview, helper-driven edits, and by hand only name, age, sex, tagline, focal points, alt text, video trim, publish/unpublish/archive/restore. No manual block editing or theme sliders — the helper does those on request. |
| Carousel set-up screen with IN/OUT per cat | **Archive** (FR-086/087): every live cat is on the carousel; archiving takes the page down and off the carousel without deleting, and restore brings back the exact page. No set-up screen, no ordering. |
| Video ≤ 500 MB, ≤ 3 min upload; carousel trim 4–12 s; profile ≤ 30 s | Upload ≤ 200 MB any length; **the clip on a profile is ≤ 15 s** (FR-078) and only that clip reaches a model (FR-079); the carousel plays **the first 8 s** of it (FR-084). |

### Not adopted

| Design item | Spec position |
|---|---|
| Facts block; coat, good-with, fee fields; the blue fee cell | Age and sex only (FR-014/016). Confirmed again 2026-09-10. |
| Fixed editorial page template | Free stack (FR-017), now with eight block types. |
| Hand-curated rotation, drag-to-order, cast-to-TV, pairing code | Out of scope. |
| Volunteer must accept alt text before publish | Visible, editable, never required. |
| First-time set-up with invite code; "forgotten password" | Credentials are configuration (FR-002). Out of scope. |
| "Another volunteer has this cat open" modal | Accepted risk stands. Out of scope. |
| `Start an application` / `Ask about` CTAs; the Adopt section | No adoption workflow, no call to action. |
| "Updated N days ago by a volunteer"; footer line | Neither. The page ends with its last block. |
| Fixed-width builder frames (1440×920) | Reference layouts, not fixed sizes. |
| Profile nav anchors (Story · Her day · Film · Adopt) | Not built; a free stack has no fixed anchors. |
| "Cover frame" picker for video | Poster is always trim start + 0.5 s. |
| Lucide icon library | The twelve geometric icons only. |
| "Another volunteer is editing" modal | Accepted risk stands. |
| `enhance` as generative (Nano Banana) | Deferred; v1 is deterministic (ADR-016). |

## 3. Facts checked on 2026-09-10

- **AI SDK v6** is current (`ai@6`). Tool inputs are declared with Zod `inputSchema`; a tool
  without `execute` streams to the client as a tool part in `input-available` state and waits
  for `addToolResult`. Tool-call streaming is on by default. `ai/test` ships
  `MockLanguageModelV3` for network-free tests.
- **`@ai-sdk/google-vertex`** and **`@ai-sdk/google`** expose the same model interface. Vertex
  accepts `gs://` file parts (a 15 s 1080p clip can still exceed the 20 MB inline limit) and
  authenticates with Application Default Credentials, so no API key exists to leak.
  `useChat` is in `@ai-sdk/react`, not `ai`.
- **`@google/adk`** exists for TypeScript. It is an agent-orchestration runtime; it would own
  the loop that the constitution assigns to core (prompt assembly, operation validation).
  Rejected — see ADR-001.
- **`gemini-2.5-flash-image`** ("Nano Banana") is callable through `generateImage()` /
  `generateText()` with input images for editing. URL inputs are not supported; bytes are.
  Recorded for when generative enhancement returns; not used in v1 (ADR-016).
- **Prebuilt `sharp`** does not decode HEIC (no libheif); iOS Safari converts HEIC to JPEG
  when the file input's `accept` excludes HEIC.
- **Cloud Run** HTTP/1 requests are capped at 32 MiB, which rules out proxying a 200 MB upload
  through the app. Hence the signed-URL upload in ADR-005.
- **GCS access is per bucket** under uniform bucket-level access (the recommended mode), and
  the same object name should not be written more than about once per second. Hence two
  buckets and the one-second autosave debounce in ADR-015. `objects.list` returns custom
  metadata, which is what makes the one-call list view possible.
