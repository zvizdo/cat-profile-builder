# Implementation Plan: Cat Profile Builder

**Branch**: `001-cat-profile-builder` | **Date**: 2026-09-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-cat-profile-builder/spec.md`

## Summary

One Next.js application with four public-facing surfaces — a builder (with a helper-driven
phone mode), a published profile page, a public index, and a carousel/kiosk — around a
single schema-versioned JSON profile document stored in Google Cloud Storage next to the
media. A framework-free core owns the document: schema with eight block types, six declared edit
operations, undo history, readiness rules, theme maths, prompt assembly. The
AI helper runs on the Vercel AI SDK over Gemini on Vertex; it **proposes** edits as tool
calls that stream to the browser, and the browser confirms, validates, applies and undoes
them, so the helper never writes the document. Media uploads go straight to the bucket by
signed URL and are validated, cleaned and described server-side; video is trimmed and
postered by ffmpeg in the Cloud Run container. Styling is one token file feeding Tailwind
for the tools and hand-written CSS for the two motion-heavy public surfaces, with no
animation library.

Every decision that would be expensive to reverse is an ADR under
`references/project/adr/`; [research.md](research.md) indexes them and holds the ledger of
where the design handoff was and was not adopted.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`; Node LTS
**Framework**: Latest stable Next.js at scaffold time, App Router, React Server Components by default
**Primary Dependencies**: `ai` v6 + `@ai-sdk/google-vertex` + `@ai-sdk/react` (ADR-001) · `zod` · `@google-cloud/storage` (ADR-015) · `sharp` (cleaning + enhancement, ADR-016) · `file-type` · `jose` · `@dnd-kit/core` + `@dnd-kit/sortable` (ADR-010) · `@tiptap/*` minimal set (ADR-013) · `tailwindcss` v4 (ADR-008) · `qrcode` (FR-088) · `pino` · dev: `vitest`, `@testing-library/*`, `playwright`, `@axe-core/playwright`, `tsx`
**Storage**: Google Cloud Storage, two buckets — private (documents, media records, originals; versioned 30 days) and public (content-hashed derived files); media per cat under `profiles/{pid}/media/{mid}/`; publish embeds a media manifest; no database (ADR-004, ADR-005, ADR-015)
**Models**: `MODEL_DRAFTING=gemini-3.8-flash`, `MODEL_DESCRIBER=gemini-2.5-flash-lite`, from env (ADR-003). No image model in v1 (ADR-016)
**Media processing**: `ffmpeg`/`ffprobe` in the container behind a `VideoProcessor` port (ADR-006); `sharp` for cleaning and the deterministic `auto-v1` enhancement (ADR-016); `next/image` for delivery (ADR-007)
**Testing**: Vitest (V8 branch coverage; unit/component/contract projects) + Testing Library; Playwright + `@axe-core/playwright` for journeys (ADR-012)
**Target Platform**: Google Cloud Run (Linux container); visitors on modern phone and laptop browsers; kiosk on a laptop driving a 1080p TV
**Project Type**: single web application (builder + public pages + Route Handlers in one Next.js app)
**Performance Goals**: first AI block on canvas ≤ 8 s (SC-013); carousel ≥ 30 fps with 20 profiles (SC-003, Waiver 2); published page LCP ≤ 2.5 s mid-tier mobile (SC-004); kiosk 8 h unattended (SC-008); autosave loses ≤ 5 s (SC-007)
**Constraints**: no key or credential in the client bundle (SC-011); ≤ 6 downscaled photos per `view_photos` call and ≤ 12 per request, never video (FR-082/037); uploads 25 MB photo / 200 MB video, clip on a profile ≤ 15 s and only the clip reaches the describer (FR-078/079); last-write-wins; no rate limiting, no cost accounting (Waivers 1, 4); WCAG 2.1 AA everywhere except volunteer-tuned contrast (Waiver 3)
**Scale/Scope**: one shelter, one shared login, ≤ ~50 profiles, ≤ 12 photos per gallery, three publication states (draft / live / archived)

All former NEEDS CLARIFICATION items are resolved in [research.md](research.md).

## Constitution Check

*GATE: Must pass before proceeding. Re-check after design phase.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Modular, framework-free core | PASS (one accepted tension) | `src/core/` holds schema, operations, history, readiness, theme, rich-text mapping, prompt assembly, tool schemas, helper reducer. ESLint `no-restricted-imports` forbids `react`, `next/*`, `@ai-sdk/react`, `@tiptap/*`, `@dnd-kit/*`, `server-only` modules inside it. Core does import the `ai` package's types and `tool()` — the SDK *is* the model port, recorded as accepted in ADR-001. The server-side stream call lives in `adapters/`, not core. Ports in `src/core/ports/`; adapters injected from one composition root. |
| II. Test-first | PASS | Every `[TDD]` area listed under Execution Strategy. Denial tests named in each contract file. Visual/motion work exempt per the principle, covered by component + e2e. |
| III. Verified coverage | PASS | Vitest thresholds per project (core 95/95, app 80/80) over unit+component+contract only; Playwright excluded. Single exclusion list in `vitest.config.ts`. Network sits behind ports so nothing needs excluding for being untestable. |
| IV. Strict typing | PASS | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`; `any` banned by lint; all external data (`ProfileStore` reads, model output, env, form input) enters as `unknown` and is parsed. |
| V. Automated gates | PASS (once scaffolded) | ADR-014: GitHub Actions runs lint, format, tsc, coverage, build, e2e, CLAUDE.md line cap on every PR. **No CI exists today**; the scaffold task creates it before any application code. |
| VI. Contract-driven boundaries | PASS | Three seams each have a contract file and a contract test: [profile-document](contracts/profile-document.md), [helper-protocol](contracts/helper-protocol.md), [server-boundary](contracts/server-boundary.md). Zod once, types derived. Model IDs in ADR-003 and env. |
| VII. Simplicity / YAGNI | PASS | No index file, no queue, no worker, no animation library, no auth framework, no database. Ports exist only where the spec names a second implementation (fakes for tests are that second caller). |
| VIII. Guarded AI editing | PASS | ADR-002: edit tools have no server `execute`; browser validates every operation and the resulting document before applying; additive edits apply at once (trivially reversible: one undo per response), destructive edits always card first; `describeOperation` supplies the "what changed" line and the destructive flag; helper has no publish/delete tool at all. |
| IX. Craft, motion, accessibility | PASS | One token file (ADR-008); compositor-only animation (ADR-009); reduced-motion path in CSS and behaviour; dnd-kit keyboard sensor plus explicit buttons (ADR-010); axe in e2e; fps test in the carousel's first task. |
| Eng. Std: rate limiting | VIOLATION — waived | Waiver 4 in spec. Repeated in this plan as required. |
| Eng. Std: cost accounting | VIOLATION — waived | Waiver 1 in spec. Model id is still recorded for enhancement provenance only. |
| Eng. Std: WCAG on volunteer-tuned contrast | VIOLATION — waived | Waiver 3 in spec. Warn-and-allow implemented in `checkReadiness`. |
| Quality Gates: carousel ≥ 55 fps default | VIOLATION — waived | Waiver 2 in spec lowers the floor to 30 fps on every surface (the constitution lets a spec set the number, so this is recorded for completeness). Measured per ADR-009. |
| Eng. Std: error semantics | PASS | `AppError` base with typed subclasses in `src/core/errors.ts`; one error body shape; provider text never forwarded. |
| Eng. Std: logging/secrets | PASS | pino with a redaction hook; `console.log` banned by lint; secrets from Secret Manager env. |
| Eng. Std: dependencies | PASS | Each new dependency is justified in its ADR or in research.md §1; pnpm lockfile. |

**Post-audit re-check (2026-09-10, evening)**: an integrity audit found 33 inconsistencies
and 29 open questions; all are resolved in the artifacts (spec Clarifications → integrity
audit session; research §1). Three constitution gaps it found are closed: the helper stream
moved out of core (Principle I / server-only), `asset.json` gained `schemaVersion` and a
migration path (Principle VI), and `applyOperation` now rejects unknown media ids (Principle
VIII denial). Two single-implementation ports (`ImageProcessor`, `ContentSniffer`) were
removed (Principle VII). Nano Banana was dropped from v1 (ADR-016), which removes the one
guard — FR-051 — that had no possible automated test.

**Post-design re-check (2026-09-10, after the design-handoff reconciliation)**: twelve
decisions amended the spec (Clarifications → Session 2026-09-10). None introduces a new
constitutional deviation: archive/restore are two more explicit human actions on the
publishing model (Eng. Std → Publishing, reversible ✓); the three new block types are
schema entries with no new write path; phone mode narrows the manual surface and widens the
helper's role without changing Principle VIII's guards; the 15 s clip cap *tightens* the
model-input bound. The Vertex-over-Gemini-API call was confirmed by the user.

## Project Structure

### Documentation (this feature)

```text
specs/001-cat-profile-builder/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Decisions index + design-handoff ledger
├── data-model.md        # Schemas, states, operations
├── quickstart.md        # Validation scenarios and gate commands
├── contracts/           # profile-document, helper-protocol, server-boundary, ports
├── tasks.md             # Task breakdown (/speckit-tasks output, not yet generated)
└── checklists/          # Reviewer-owned; agent never edits markers

references/project/adr/  # ADR-001 … ADR-016
```

### Source Code (repository root)

```text
src/
├── core/                        # framework-free; ESLint-restricted (Principle I)
│   ├── profile/
│   │   ├── schema.ts            # ProfileDocument, Block, Theme (Zod) + derived types
│   │   ├── rich-text.ts         # RichText schema + Tiptap JSON ↔ RichText
│   │   ├── migrations.ts        # migrate(unknown): unknown, v-chain
│   │   ├── operations.ts        # EditOperation schema, applyOperation, describeOperation
│   │   ├── history.ts           # undo/redo stack
│   │   ├── readiness.ts         # checkReadiness → problems + warnings (incl. 15 s clip rule)
│   │   ├── display-line.ts      # tagline, else first sentence of bio
│   │   ├── theme.ts             # presets, resolveTheme, contrastRatio
│   │   └── slug.ts              # slugify, parsePublicPath
│   ├── media/
│   │   ├── schema.ts            # MediaAsset, ResolvedMedia
│   │   ├── manifest.ts          # resolve document media ids → manifest at publish
│   │   ├── paths.ts             # pid/mid/kind/rev → object names; the only place paths are built
│   │   └── validation.ts        # limits, allowed types, dimension rules
│   ├── helper/
│   │   ├── tools.ts             # twelve tool definitions: six edits from EditOperation members, five reads, load_skill (schemas only)
│   │   ├── prompt.ts            # short system prompt: identity, limits, skill catalogue, read-first / re-read-after-write
│   │   ├── skills.ts            # catalogue: parses skills/*.md front matter, serves load_skill
│   │   ├── skills/              # build-profile.md, write-bio.md, pick-theme.md, tidy-order.md
│   │   ├── reads.ts             # read_outline / read_page / read_blocks / list_media as pure functions, data-fenced
│   │   ├── photo-budget.ts      # view_photos rules: owned, photos only, ≤ 6 per call, ≤ 12 per request
│   │   └── reducer.ts           # locked/ready/working state, open turn entry, surface (no modes, no counter)
│   ├── carousel/
│   │   ├── roster.ts            # live docs → CarouselCat[], step→(cat, media) maths, clip capped at 8 s
│   │   ├── hold.ts              # ?hold= parsing and clamping
│   │   └── beat.ts              # advance / manualNav / applyRoster — step rules the carousel hook delegates to
│   ├── ports/                   # ProfileStore, MediaStore, VideoProcessor, … (see contracts/ports.md)
│   ├── auth/
│   │   └── credentials.ts       # constant-time check (pure; Node crypto only)
│   ├── result.ts                # Result<T, E> — the one ok/error union
│   └── errors.ts                # AppError + subclasses, one code each (server-boundary.md)
├── adapters/                    # server-only implementations, `import "server-only"`
│   ├── pipeline/                # finalize-upload, trim-video, publish — orchestration over the ports; Server Actions stay thin
│   ├── fake/                    # language-model (scripted MockLanguageModelV3 scenarios), describer — shipped for MODEL=fake
│   ├── gcs/                     # profile-store.ts, media-store.ts (two buckets, ADR-015)
│   ├── fs/                      # same two ports on a local folder (STORE=fs; dev and e2e)
│   ├── vertex/                  # language-model.ts, describer.ts, helper-stream.ts (createHelperStream; server-only)
│   ├── ffmpeg/                  # video-processor.ts
│   ├── sharp/                   # metadata, clean, downscale, enhance (auto-v1) — plain modules, not ports
│   ├── sniff.ts                 # file-type wrapper
│   ├── auth/                    # session.ts (jose)
│   ├── config.ts                # env schema (Zod) + model ids
│   ├── logger.ts                # pino + redaction
│   └── container.ts             # composition root; picks adapters from STORE and MODEL
├── app/                         # Next.js App Router — thin adapters only
│   ├── (public)/cats/page.tsx             # public index (FR-090)
│   ├── (public)/cats/[slugAndId]/page.tsx
│   ├── (public)/carousel/page.tsx
│   ├── (public)/kiosk/page.tsx
│   ├── (builder)/builder/page.tsx         # list with draft / live / archived; "New cat" → createProfile action
│   ├── (builder)/builder/[id]/page.tsx    # full builder ≥ 768 px; phone mode below (FR-091)
│   ├── (builder)/builder/[id]/preview/page.tsx
│   ├── sign-in/page.tsx
│   ├── api/helper/chat/route.ts
│   ├── api/profiles/[id]/draft/route.ts   # PUT autosave (keepalive-safe)
│   ├── api/profiles/[id]/media/[mid]/original/route.ts   # GET, Range; trim editor only
│   ├── api/carousel/route.ts
│   └── actions/                 # one file per Server Action group: auth, profiles, media
├── proxy.ts                     # session guard (Next's request-level hook; must sit beside app/, not in it)
├── ui/
│   ├── tokens.css               # the single token file (@theme), generated from TOKENS.json
│   ├── shared/                  # Button, Field, Toast, Modal, StripedPlaceholder, icons
│   ├── builder/                 # Canvas, BlockFrame, 8 block editors, Rail, ThemePicker, MediaLibrary, FocalPicker, TrimEditor, AltTextField, EnhanceCompare, PhoneMode, OfflineNotice
│   ├── helper/                  # HelperPanel, ProposalCard, TurnSummary
│   ├── profile/                 # ProfilePage + 8 block renderers + profile.module.css; IndexPage
│   └── carousel/                # Carousel, Beat, QrCard, KioskShell, KioskControls + carousel.module.css
infra/
└── terraform/                   # buckets, IAM, Artifact Registry, Cloud Run (ADR-014)
scripts/
├── gen-tokens.ts                # TOKENS.json → src/ui/tokens.css
├── make-credentials.ts          # SESSION_SECRET + SHELTER_PASSWORD_HMAC → infra/terraform/secrets.auto.tfvars (or --env)
└── seed.ts                      # fake-store seeding for e2e
tests/
├── unit/                        # mirrors src/core
├── component/                   # mirrors src/ui
├── contract/                    # profile-document, helper-protocol, server-boundary, migrations
├── e2e/                         # build-and-publish, generate-edit-undo, carousel, fps, a11y
├── fakes/                       # in-memory ports + scripted model scenarios
└── fixtures/                    # 3 photos, 2-s / 20-s / portrait MP4s, maximal document, dim photo for enhance
```

**Structure Decision**: single Next.js app (constitution Technology Stack) with the core as
a sibling tree to `app/` rather than a separate package — a workspace would add tooling for
no second consumer (Principle VII). The `(public)` and `(builder)` route groups make the
auth boundary visible in the file tree; `proxy.ts` guards `/builder` and `/api/helper`.
Public cat pages live under `/cats` and the volunteer tools under `/builder`, so the public
index can take the natural `/cats` address.

## Execution Strategy

### TDD Requirements

Tasks in these areas are marked `[TDD]` and follow RED-GREEN-REFACTOR:

- [ ] `core/profile/schema.ts` + `migrations.ts`: contract of the whole product; every rejection listed in contracts/profile-document.md must fail first
- [ ] `core/profile/operations.ts`: six operations × valid/invalid/destructive; resulting-document validation; permutation check for reorder
- [ ] `core/profile/history.ts`: exact-restore undo/redo, draft collapse into one entry
- [ ] `core/profile/readiness.ts`: every problem string incl. the 15 s clip, processing, and empty-section rules; warning vs problem split
- [ ] `core/profile/display-line.ts`: tagline precedence, first-sentence extraction, empty case
- [ ] `core/profile/theme.ts`: the resolve formula, bounds, every preset at 0.5/0.5 passes 4.5:1 (Night included), contrast ratio against known WCAG pairs from TOKENS.json, restore-to-passing
- [ ] `core/profile/rich-text.ts`: Tiptap ↔ RichText both ways, unknown node rejection, `javascript:` href rejection
- [ ] `core/media/validation.ts`: limits, sniffed-type vs declared-type, dimension rules
- [ ] `core/helper/prompt.ts` + `reads.ts` + `skills.ts`: nothing pushed; each read's exact format, data fencing of page text, readiness in the outline, mid-turn reads reflect applied blocks; catalogue front matter valid, prompt lists exactly the catalogue, unknown skill → error
- [ ] `core/helper/reducer.ts`: locked/ready/working, apply-unless-destructive, one history entry per response, failure keeps applied edits, undo disabled while working
- [ ] `adapters/vertex/helper-stream.ts` with `MockLanguageModelV3`: tool-call streaming, truncation, error mapping, `view_photos` budget and ownership checks, tool set is exactly twelve names
- [ ] `core/profile/operations.ts` with asset context: unknown id / wrong kind / missing slot rejected; `set_field` path grammar per block type
- [ ] `adapters/sharp/enhance.ts`: byte-identical on repeat, known luminance shift on a grey card (ADR-016)
- [ ] Offline mirror: local copy newer than saved → offered; older → ignored; storage throwing → builder still works
- [ ] `core/carousel/roster.ts` + `hold.ts`: step maths, single-photo cat fills its slot, clip capped to the slot, archived cats excluded, empty roster, `hold` clamping
- [ ] `core/auth/credentials.ts`: constant-time compare, both halves always checked
- [ ] Every Server Action and Route Handler: boundary validation and the shared error shape
- [ ] `adapters/config.ts`: refuses to boot on each missing variable
- [ ] `ProfileStore` archive/restore: state derived from file presence, restore is byte-identical, never both files
- [ ] `core/media/paths.ts` + `manifest.ts`: every path stays inside `profiles/{pid}/`, rev is content-derived, manifest covers exactly the referenced ids, publish after a re-trim keeps the old `src` in the live copy
- [ ] `adapters/fs` and `adapters/gcs` against one shared port contract test (same suite, two adapters)

Exempt from test-first (covered by component + e2e tests instead): layout, `tokens.css`, the
profile page scroll scenes, the carousel keyframes.

### Parallel Execution Opportunities

Independent streams once the foundation (scaffold + core schema + ports + fakes) exists:

- [ ] **Core operations/history/readiness/theme** and **adapters (GCS, ffmpeg, sharp, session)** share no files
- [ ] **Published profile page** (`ui/profile`) and **builder canvas** (`ui/builder`) share only `tokens.css` and the block renderers' read-only variants — sequence the renderers first, then split
- [ ] **Carousel** (`core/carousel`, `ui/carousel`, `/api/carousel`) depends only on the published-document shape and can run alongside the builder
- [ ] **Helper stream + reducer** (`core/helper`) depends on operations; **HelperPanel UI** can be built against the reducer with scripted scenarios while the Vertex adapter is written separately
- [ ] **Media pipeline** (upload actions, describer, sharp enhancement, trim) is independent of the helper and the carousel
- [ ] **Phone mode** (`ui/builder/PhoneMode`) reuses the helper panel, the media editors, and the read-only renderers; it can start once those three exist and runs alongside the full builder

### Content task (not code)

- [ ] **Write the four skills.** `build-profile` and `write-bio` need real research first:
  what makes an adoption bio work (behaviour over adjectives, a specific opening detail,
  honest about needs, length, what adopters actually ask), collected from shelter-writing
  guides and good published profiles, then written in the design's voice (DESIGN.md §7,
  CONTENT.md). `pick-theme` and `tidy-order` are short and come from the design system.
  Reviewed by the shelter before the helper story is called done. Skills are text, so they
  are exempt from TDD; the catalogue loader is not.

### Human Checkpoints

1. **After foundation** — scaffold, CI green on an empty app, `tokens.css` generated, core schema + ports + fakes in place. Verify the commands in `CLAUDE.md` are the real ones and every gate runs.
2. **After Story 1 (build and publish by hand)** — run quickstart §1 together, including archive → 404 → restore; performance and accessibility review of the published page and the public index (LCP, axe, phone width).
3. **After Story 2 + 3 (helper)** — run quickstart §2–3 with the fake model, then once with the real model, on a laptop and then on a phone in phone mode; security review of the helper boundary and upload path.
4. **After Story 4 (carousel)** — fps measurement with 20 seeded cats on the actual event laptop if available; scan a QR from the TV with a phone; reduced-motion walk-through.
5. **After Story 5 (enhancement)** — before/after on three real shelter photos, provenance check, revert check, determinism (enhance twice, compare bytes).
   Also at this checkpoint: the eight-hour kiosk soak (SC-008) — start `/kiosk` on the event laptop in the morning, check it in the evening, note memory in DevTools; and the human ten-minute trial (SC-001) with at least one volunteer who has not seen the app.
6. **Before merge** — full suite, `/speckit-converge`, waivers repeated in the PR description.

### Review Gates

Tasks in these areas are marked `[REVIEW]`:

- [ ] `core/profile/schema.ts`, `operations.ts`, `contracts/*`: review before any consumer is written — everything else is downstream of these shapes
- [ ] `core/helper/prompt.ts`, `adapters/vertex/helper-stream.ts`, `api/helper/chat/route.ts`: security review (prompt-as-data, context bounds, no provider text to client)
- [ ] Upload actions + `adapters/gcs/media-store.ts` + `adapters/ffmpeg`: security review (sniffing, limits, metadata stripping, atomicity, path derivation)
- [ ] `proxy.ts` + `adapters/auth`: security review (cookie flags, constant-time compare, redirect `next` param is a same-origin path)
- [ ] `publish`/`archive`/`restore` actions + public page + public index + `/api/carousel`: review that nothing beyond the live document reaches the visitor and that archived cats appear nowhere public (FR-059/086)
- [ ] Terraform under `infra/terraform/` + `adapters/gcs`: review the plan output — the private bucket has no public grant, versioning + 30-day lifecycle are set, and the public bucket objects carry `immutable` cache headers
- [ ] `ui/carousel`: performance review with measured fps (`FPS_GATE=1` on a GPU machine) before the story is called done
- [ ] Every interactive component: keyboard-path component test present (list in ADR-012) before the story is called done

## Complexity Tracking

> Filled because the Constitution Check carries three waived violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| No rate limiting on model endpoints or sign-in (Eng. Std) | Spec Waiver 4 — shelter decision; single shared account, tens of users | Limiting sign-in only, or high ceilings, were offered and declined by the shelter |
| No cost accounting on model calls (Eng. Std) | Spec Waiver 1 — shelter decision | Silent server-side logging was offered and declined |
| Publishable contrast failure from volunteer gradient tuning (Principle IX) | Spec Waiver 3 — the volunteer may override the warning | Refusing to publish, or tightening the tuning bounds until failure is unreachable, were rejected as taking the decision away from the volunteer |

No other violations. In particular, no new dependency exceeds the "second real caller" rule:
each library in Technical Context is justified in its ADR.
