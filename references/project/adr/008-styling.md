# ADR-008: Styling system

**Status**: accepted · **Date**: 2026-09-10

## Context

Principle IX: one set of design tokens, no ad-hoc inline styles. The design handoff
(`references/design/DESIGN.md`, `TOKENS.json`) supplies 13 colours, three type families, a
4 px scale, four radii, two shadows, and motion timings, and recommends Tailwind for the
dense tools but hand-written CSS for the two motion-heavy surfaces.

## Decision

- **One token file**: `src/ui/tokens.css` declares every token as a CSS custom property
  inside a Tailwind v4 `@theme` block, generated from `TOKENS.json` by a checked-in script so
  the two cannot drift. This file is the only place a colour, radius, shadow, duration, or
  easing literal may appear.
- **Tailwind v4** (CSS-first config, no `tailwind.config.js`) for the builder (both the full
  layout and phone mode), profile list, public index, sign-in, and helper panel. The default palette, radii and shadows are **replaced**, not
  extended — only the project's tokens are nameable, so "one accent per screen" survives.
- **CSS Modules** for the published profile page and the carousel/kiosk. Scroll-driven
  timelines, `clip-path` keyframe pairs, gradient scrims, and the slat wipe are readable as
  CSS and unreadable as utility strings. These files use the same custom properties.
- Volunteer-chosen theme values (preset, warmth, contrast) are document data. Core turns them
  into a small set of CSS custom properties (`--profile-bg-a`, `--profile-bg-b`, `--profile-ink`,
  `--profile-accent`) set once on the page root. No other styling is derived from the
  document (FR-072).
- Fonts: Instrument Serif, Work Sans, IBM Plex Mono via `next/font` (self-hosted at build),
  which also covers an offline kiosk.

## Alternatives rejected

- CSS Modules everywhere — no dependency, but the dense builder chrome becomes hundreds of
  lines of spacing rules that utilities express in place.
- Tailwind everywhere — the carousel keyframes as arbitrary-value classes; the design
  handoff explicitly warns against this and it is right.
- CSS-in-JS — a runtime and a stylesheet-generation step on the public page for no gain.
