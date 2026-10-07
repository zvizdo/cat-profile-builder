# South County Cats — Design System

Volunteer-run cat rescue, Wakefield RI. Three surfaces share one system:

| Surface | Character | Files |
|---|---|---|
| Public profile | Editorial, photography-led, scroll-choreographed | `Charlotte Profile v2.dc.html`, `Cat Profile Hi-Fi.dc.html` |
| Builder tools | Dense, calm, reversible | `Cat Profile Builder Hi-Fi.dc.html` |
| Event carousel / kiosk | 10-foot legibility, one beat per cat | `Cat Carousel Motion.dc.html` |
| Reference | This system, drawn | `South County Cats Design System.dc.html` |

---

## 1. Colour

One accent. Blue carries the primary action, the current selection, and the LIVE badge — nothing else.

| Token | Hex | Use |
|---|---|---|
| `blue` | `#0B6FB4` | primary buttons, selection, links, fee cell |
| `blue-deep` | `#0A3D63` | CTA grounds, hover on primary |
| `blue-light` | `#8FD0FF` | labels on night grounds |
| `blue-whisper` | `#C9E7FF` | kickers over photography |
| `clay` | `#A4552A` | destructive actions, warnings — never decorative |
| `ink` | `#231F20` | headings |
| `body` | `#3D3937` | paragraphs |
| `meta` | `#6F6A63` | mono labels, captions (4.9:1 — the floor for words) |
| `rule` | `#8A857E` | hairlines and dividers **only**, never text (3.3:1) |
| `paper` | `#F6F4F0` | page ground |
| `paper-deep` | `#E9E6E1` | canvas ground behind frames |
| `card` | `#FFFFFF` | panels, facts strip |
| `night` | `#0A0E12` | carousel, pinned scroll scenes |

Lines: `rgba(35,31,32,.06)` inside panels · `.08` chrome and facts strip · `.18` tags and section rules.

**Contrast, as shipped:** ink/paper 15.0 · body/paper 11.3 · meta/paper 4.9 · blue/paper 5.0 · white/blue 5.3 · white/blue-deep 11.2 · blue-light/night 11.7.

Over photography: full-opacity white or `blue-whisper` on a gradient scrim (`0 → .8` black, top 40% clear). Never alpha-faded ink on a photo.

Shadows are always blue-tinted, never neutral grey:
- Lifted — `0 18px 46px -14px rgba(11,63,99,.28)`
- Screen — `0 30px 70px -28px rgba(11,63,99,.40)`
- Nothing on the public profile casts a shadow.

## 2. Type

| Role | Family | Notes |
|---|---|---|
| Display | **Instrument Serif** 400 | names, section heads, pull quotes, fact values. Never below 24px, never UI chrome |
| Text & UI | **Work Sans** 300/400/500/600 | body, buttons, fields. 500 is the heaviest weight in the tools |
| Label | **IBM Plex Mono** 400/500 | field labels, timestamps, status, block names. Uppercase, `.2em` tracking |

Scale (public profile clamps; builder chrome is fixed):

- Hero name `clamp(74px, 13vw, 196px)` / .82 / −.035em
- Section head `clamp(36px, 4.4vw, 68px)` / 1.05 / −.02em
- Fact value `clamp(22px, 2vw, 30px)`
- Body `clamp(17px, 1.35vw, 21px)` / 1.65
- Hero line (the display line over the portal photo) `clamp(17px, 1.6vw, 24px)` / 1.45, white 90%
- UI text 15px/500 — 13px in dense chrome
- Mono label 11px / `.2em`, 10px floor
- Carousel: nothing below 24px at 1080p

## 3. Space, surface, line

4px base: **4** icon gaps · **8** chips, thumbs · **12** button stacks · **16** panel padding · **28** page gutter · **56** desktop gutter · **120** section rhythm on the desktop · **40** on the phone; two sections on the same surface share one unit.

Radius: **0** photos and editorial sections · **4** controls · **6** panels · **99** pills and tags.

Layout: public profile `max-width:1280px`, 28px gutters. Facts strip is `repeat(auto-fit, minmax(150px, 1fr))`, fee always last and always the blue cell. Carousel TV-safe inset 64px / 96px.

Square 4px buttons belong to the tools; pills belong to the public profile. A screen never shows both.

## 4. Components

Buttons — primary (blue, white text), secondary (1px `.28` border), ghost (blue text), destructive (clay outline → clay fill on hover). Public CTAs are pills: white on `blue-deep`, or 1.5px white-50% outline.

Fields — 4px radius, `.2` border; focus `#0B6FB4` + `0 0 0 3px rgba(11,111,180,.16)`; error clay border with a sentence beneath. Mono uppercase label above every field.

Status — `LIVE` filled blue · `DRAFT` outline `.24` · `UNFINISHED` outline clay · save state as sentence-case mono with a 6px blue dot.

Media — empty slots are striped `repeating-linear-gradient(45deg, #E9E6E1 0 6px, #F6F4F0 6px 12px)` with a mono label saying what belongs there. Never a spinner, never a grey box.

CATalyst's messages — proposal card (mono header, plain-language operations, Apply / Not this, "one undo"); consequence notice as a 3px clay left border on paper; failure as dashed box with a plain sentence.

Mobile: any target a volunteer taps is ≥44px.

Block actions on touch widths (F47; F28 review #6; comp 7c "iPad 1024×768 · touch-first"): from
1180px up (`wide`, where the docked CATalyst column starts) the label row's actions stay
hover-revealed text — a mouse has hover to find them with. In the touch band beneath it, 768–1179
(`TOKENS.json` `breakpoints.tablet`), a finger never gets a hover, so the same actions — the
editor's own, `duplicate`, `remove` — draw as always-visible bordered pills instead: `Button
dense`, `secondary` (the same chip `PhoneActions` already draws for the phone) for the neutral
actions and `destructive` for `remove`'s clay outline, each ≥44px from the button's own tap
floor — comp 7c's own bordered chips, not a colour-only stand-in for the hover-revealed text.
Below 768 is the phone builder's own row (F44) and is untouched by this.

Gallery tiles on touch (F55, 2026-09-13; the controller's phone sweep): under 1180px each
photo's `Move left` · `Move right` · `enhance` · `Remove photo` are one row of those same pills
— the moves and `Remove photo` as 44px icon pills, `Remove photo` clay on its own un-themed
chip (F12) — not a cluster of unboxed chevrons and white squares of two sizes. The grid is two-up
under 1180 (F44 made the phone two-up; a 4-up tile beside the rail is 71px at 768 and cannot hold
four 44px pills), and the row wraps into a 2×2 of one shape where a tile is narrower than four
targets. Empty slots on touch say `Add a photo` / `Add a clip` and are the button (nothing drops
on a phone); `drop a photo` stays the pointer's word from 1180px.

## 5. Motion

| Duration | Use |
|---|---|
| 180ms | hover, focus, chip toggle (ease-out) |
| 320ms | panel open, block select, reorder settle |
| 1000ms | profile section rise — `cubic-bezier(.16,.84,.28,1)` |
| 1.6s | the helper's touch on a frame — the 2px focus-ring blue, blinked twice (ease-in-out, opacity only); reduced motion: one still ring for the same 1.6s |
| 6.5s | one cat on the carousel (4–12s configurable) |

Profile page: scroll-driven only (`view-timeline`, `animation-timeline`), portal zoom on the hero, pinned three-scene "day in her life", drift on photo sections. Builder: responds, never animates on its own. The one thing it does unasked is follow CATalyst (F34, "follow, then overview"): as each of its edits lands the canvas scrolls the touched block to the centre of the view (`scrollIntoView` — smooth, or at once under reduced motion) and blinks its ring; when the turn ends it scrolls back to the first block touched. The touched frames wear the `CATalyst · just now` tag until the volunteer's next edit, and each label in the panel's "Applied — …" line is a button that scrolls to and re-blinks its block.

Carousel beat (all five moves inside one beat, exit built into the same keyframes):
1. **Slat wipe** 0–0.9s — six vertical slats of the new photo, 55ms apart, direction alternating per beat
2. **Drift** whole beat — scale 1.05→1.19 + 1.8% pan, linear, flipped per beat; the outgoing layer holds the previous beat's end transform so geometry never pops
3. **Name unmask** 0.09–1.3s — rising clip reveal, letter-spacing .015em→−.03em
4. **Rule sweep + stagger** — blue rule opens from left; tag, line, then three facts 60ms apart
5. **Clear out** 5.6–6.5s — text leaves upward in arrival order, ~120ms empty frame before the next wipe

Keyframes are authored in A/B pairs and alternated by beat parity so the same element re-animates without remounting; `animation-play-state` is driven by one flag for pause.

**Reduced motion** is not a downgrade: same composition, same order, same copy. Scroll scenes resolve to their end state, the carousel stops auto-advancing and pages by arrow key, nothing autoplays.

**Phone builder** (F44; design 2026-09-13). Below 768px the builder is the same builder in one column: Facts and Theme folded to one line each at the top on the chrome's ground, then the frames on the themed sheet with a label row of four 44px icon buttons (up, down, duplicate, remove) in place of the hover-revealed text actions and the drag handle — there is no touch drag. Media and CATalyst are drawers that slide up from the bottom bar over `panel` (320ms, transform only); under reduced motion they appear in place. A Full drawer is a modal dialog under the topbar; Peek and Half (CATalyst, F45) are not — the canvas stays reachable and F34's follow lands in the visible band between the bars. Preview is a page, not a pane.

## 6. Four rules

1. One accent per screen. If two things are blue, one of them is wrong.
2. The photograph is the design. Type gets out of its way.
3. Every irreversible action names what it will remove, before it does it.
4. No spinners on the public profile — striped placeholders and plain sentences instead.

## 7. Voice

Plain, specific, never cute. Cats are described by behaviour, not adjectives ("a negotiator, not a complainer"). System messages say what happened and what to do: *"That username and password don't match."* — never which half. Edits are attributed to "a volunteer", because one shared login can't claim more. No emoji.

---

## Note — the fundraiser display's one extra tint

The fundraiser display (`/fundraiser`) adds one colour outside the 13: `#F0A27C` (`--color-fundraiser-refusal`), the tint for refusal sentences on the night ground. `--color-clay` is 3.6:1 there and fails 4.5:1; this tint is 9.4:1. It is the one exception to "13 colours" and is used nowhere else.

## Implementation note — Tailwind

Reasonable for the app, with two conditions.

**Where it fits:** the builder, list, sign-in and carousel set-up are ordinary dense UI, and this system is small enough to express as a theme — 13 colours, one 4px scale, four radii, three families. Tailwind's utility churn is cheapest exactly here.

**Condition 1 — replace the default theme, don't extend it.** Use `theme:` (not `theme.extend`) so the stock palette, radii and shadows are gone. Only the tokens above should be nameable, or "one accent per screen" erodes into `blue-500` vs `sky-600` within a sprint.

```js
// tailwind.config.js — sketch
theme: {
  colors: { blue:'#0B6FB4', 'blue-deep':'#0A3D63', 'blue-light':'#8FD0FF', 'blue-whisper':'#C9E7FF',
            clay:'#A4552A', ink:'#231F20', body:'#3D3937', meta:'#6F6A63', rule:'#8A857E',
            paper:'#F6F4F0', 'paper-deep':'#E9E6E1', card:'#FFFFFF', night:'#0A0E12',
            white:'#FFFFFF', transparent:'transparent', current:'currentColor' },
  fontFamily: { display:['"Instrument Serif"','serif'], sans:['"Work Sans"','Helvetica','sans-serif'], mono:['"IBM Plex Mono"','monospace'] },
  borderRadius: { none:'0', DEFAULT:'4px', panel:'6px', full:'99px' },
  boxShadow: { lifted:'0 18px 46px -14px rgba(11,63,99,.28)', screen:'0 30px 70px -28px rgba(11,63,99,.40)' }
}
```

**Condition 2 — the public profile and the carousel stay in hand-written CSS.** Scroll-driven timelines, `clip-path` keyframe pairs, gradient scrims, the slat wipe, `letter-spacing` interpolation and TV-safe insets are not utility work; expressing them as arbitrary values would be less readable than the CSS they compile to. Treat those two surfaces as a small custom stylesheet that uses the same token values, and let Tailwind own the tools.

Not worth it if the build stays a handful of static pages — at that size the config is more code than the CSS it replaces.

**Note on these files:** the design documents in this project are inline-styled Design Components, so they're a visual and behavioural spec, not source to port class-by-class. Read values from this document.
