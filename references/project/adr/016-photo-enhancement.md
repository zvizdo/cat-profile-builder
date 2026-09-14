# ADR-016: Photo enhancement

**Status**: accepted · **Date**: 2026-09-10 · Supersedes the image-model parts of ADR-003
and the `ImageEnhancer` port.

## Context

The founding idea had Nano Banana (`gemini-2.5-flash-image`) clean up, re-frame, and replace
the backgrounds of volunteer photos. On review at planning: re-framing is already solved by
the focal point; cleanup and background work through a *generative* model re-render every
pixel, which risks the exact thing FR-051 forbids — changing what the cat looks like — and
that risk has no automated test, only eyeballs. The shelter chose to defer generative
enhancement and ship a deterministic version.

## Decision

- **One click, one recipe, no model.** `enhance(bytes): bytes` in
  `src/adapters/sharp/enhance.ts` applies, in order: `normalise()` (stretch the luminance
  range), `modulate({ brightness: 1.03, saturation: 1.08 })`, `linear(1.06, -4)` (light
  contrast), `sharpen({ sigma: 0.8 })`. Output JPEG q88. The recipe is named
  **`auto-v1`**; any change to the numbers is `auto-v2`, because the version is recorded on
  every asset it produced (FR-054).
- **Deterministic and testable.** The adapter test enhances a fixture twice and asserts the
  bytes are identical, and enhances a mid-grey card and asserts the mean luminance moved by
  a known amount. That is the whole quality test; there is nothing subjective to review.
- **Same lifecycle as before.** `enhancePhoto({ mediaId })` creates a new asset with
  `enhancement: { sourceMediaId, recipe: "auto-v1" }`, its own `clean.{rev}.jpg`, and the
  source's `alt` and `focal` copied over (the picture's content and framing are unchanged).
  The builder shows original and result side by side; accepting applies `replace_image` in
  the block the volunteer was in (FR-053), which is one undoable page edit. Revert is the
  same operation back.
- **No `ImageEnhancer` port.** `sharp` is pure, local and fast; a port with one
  implementation and no network to fake would be the abstraction Principle VII forbids.
  When generative enhancement returns, it will be a new server action with its own ADR, and
  the asset's `enhancement` record already has room for a `model` field.
- `MODEL_IMAGE` is removed from configuration.

## Alternatives rejected

- **Nano Banana for all three kinds** (as specced) — moderate plumbing, but quality that can
  only be judged by eye, and identity risk on a real animal.
- **Nano Banana for "clean backdrop" only** — the strongest single use; deferred rather than
  rejected. Revisit with real shelter photos in hand.
- **Adjustable sliders** (brightness, warmth) — every profile would look a little different;
  one recipe keeps the site consistent and the code tiny.
