# ADR-012: Test tooling

**Status**: accepted · **Date**: 2026-09-10

## Context

Principle III: ≥ 95 % line and branch on the core, ≥ 80 % app-wide, measured over unit,
component and contract suites only; end-to-end excluded. Principle II: test-first. Quality
Gates: three named journeys end-to-end, keyboard paths for every interactive component,
automated accessibility checks (SC-005), a frame-rate proof (SC-003).

## Decision

- **Vitest** with V8 coverage and `branches` enabled. Three projects in one config:
  `unit` (core, Node environment), `component` (jsdom + Testing Library + `user-event`),
  `contract` (schema round-trips, migrations, every Server Action and Route Handler boundary,
  model-output rejection). Thresholds are set per project in `vitest.config.ts` and fail
  the run. The single exclusion list lives there too.
- **Playwright** for end-to-end: build-and-publish, generate-then-edit-then-undo, carousel
  with keyboard and with `reducedMotion: "reduce"`. `@axe-core/playwright` runs on every
  page the journeys visit and fails on any violation. A kiosk test samples frame rate with
  twenty seeded profiles.
- **Fakes, not mocks, at the ports**: an in-memory `ProfileStore` and `MediaStore` for unit
  and contract tests, a scripted `VideoProcessor`, and `MockLanguageModelV3` from `ai/test`.
  Local development and end-to-end runs use the **filesystem adapter** (ADR-015) under
  `.data/`, so no test reaches GCS or Gemini and the real layout is still exercised.
- **Fixtures**: three cat photos (from `references/design/design/media/`), one 2-second
  MP4, one 20-second MP4 (to exercise `needs-trim`), and one portrait-shot MP4 (rotation),
  checked in under `tests/fixtures/`.
- **Which switch fakes what**: two variables, `STORE=memory|fs|gcs` and `MODEL=fake|vertex`.
  Unit and contract tests force `memory`+`fake`; `pnpm dev` and Playwright default to
  `fs`+`fake`; checkpoint 3's "once with the real model" is `STORE=fs MODEL=vertex`.
  `FAKE_MODEL_SCENARIO` selects the scripted conversation when `MODEL=fake`.
- **Keyboard-path component tests** (Quality Gates) are required for: `Canvas`/`BlockFrame`
  (select, move up/down), `Rail` tiles, `ThemePicker` (preset + sliders), `FocalPicker`
  (arrow nudge 1 %, shift 10 %), `TrimEditor`, `AltTextField`, `MediaLibrary` (delete with
  confirmation), `ProposalCard` (Apply / Not this), `Toast`/`Modal` (Escape = safe button),
  `Carousel` controls (arrows, space), `PhoneMode` editors, sign-in form.

## Alternatives rejected

- **Jest** — slower with ESM and TypeScript, needs a transformer; Vitest reads the Vite
  config Next.js does not use, but its own config is small.
- **Cypress** — heavier, weaker multi-tab and reduced-motion control than Playwright.
