# ADR-009: Animation

**Status**: accepted · **Date**: 2026-09-10

## Context

Cinematic motion on every surface (Waiver 2 lowers the floor to 30 fps with twenty profiles),
motion must not block interaction, must run on compositor properties, must honour reduced
motion, and the kiosk must run eight hours. The design handoff's motion is already
authored as pure CSS: scroll-driven `animation-timeline` on the profile page, A/B keyframe
pairs alternated by beat parity on the carousel.

## Decision

**No animation library.** All motion is CSS, driven by state the React tree exposes as
attributes and custom properties.

- **Published page**: `animation-timeline: view()` / `scroll()` where supported. The `day`
  block is the design's pinned three-scene sequence (one `view-timeline` driving three
  cross-fades, three captions, three progress dashes); `quote` and `photo` drift; `video`
  "opens" as it enters; the hero is the portal zoom. A small
  `useScrollProgress` hook (IntersectionObserver + one scroll listener) writes `--progress`
  on each scene as the fallback for browsers without scroll-driven animations; the same
  keyframes read either source. Ranges come from the design's `animation-range` values.
- **Carousel**: one `<Carousel>` component holds `{ step, playing, holdMs }`. The beat is a set
  of keyframes (slat wipe, drift, name unmask, rule sweep, clear-out) in A/B pairs selected by
  `data-beat="a|b"`, so the same elements re-animate without remounting. Only `transform`,
  `opacity`, and `clip-path` animate. One `animation-play-state` flag pauses everything.
- **Builder**: responds, never animates on its own — 180 ms hover/focus, 320 ms panel and
  reorder settle, from the token file.
- **Reduced motion** is a media query in the same stylesheets plus a `useReducedMotion` hook
  for behaviour (no auto-advance, no autoplay). Same layout, order and copy.
- **`day` block under reduced motion**: the pinned cross-fade's end state would show scene 3
  only, hiding two captions. Under `prefers-reduced-motion` the block renders as three stacked
  photo + caption pairs with no pinning — same content, same order (FR-069).
- **Frame-rate proof**: an end-to-end test seeds twenty profiles, opens the kiosk at
  1920×1080, samples `requestAnimationFrame` for ten seconds and records the fps as a test
  artifact on every run. It **asserts** ≥ 30 fps only when `FPS_GATE=1`, because headless CI
  Chromium paints `clip-path` slat wipes on the CPU and a hard gate there would be red for the
  wrong reason. The binding measurement is run at checkpoint 4 on the event laptop (or a
  developer machine with GPU) with `FPS_GATE=1`, and the number is recorded in the PR. The
  test exists from the carousel's first task (the brainstorm log's warning), not its last.
- **Compositor discipline**: the name unmask animates `letter-spacing` (layout). It is a
  single line of text for ~1.2 s per beat; the fps measurement is the check. If it costs
  frames, the tracking change is dropped and the `clip-path` reveal stays.

## Alternatives rejected

- **Motion (framer-motion)** — good ergonomics, but ~40 KB on the public page and a
  JS-driven loop on a kiosk that must not degrade over eight hours.
- **GSAP + ScrollTrigger** — most control, heaviest, imperative, and its licence needs
  checking for some uses. More than five block types and one carousel need.
