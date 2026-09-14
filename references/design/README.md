# Handoff: South County Cats — cat profile system

## Overview

A volunteer-run cat rescue in Wakefield, RI needs three connected things:

1. **A public cat profile** — one editorial, photography-led page per adoptable cat, scroll-choreographed.
2. **A builder** — the tool volunteers use to make those pages: block canvas, theme picker, media library, and an AI helper that proposes changes rather than making them.
3. **An event carousel / kiosk** — a 1920×1080 looping carousel of adoptable cats for adoption events, with a scan-to-keep QR per cat.

Plus the supporting surfaces: profile list (home for volunteers), sign-in / first-time set-up, and carousel set-up (rotation, timing, cast to TV).

## About the design files

Everything in `design/` is a **design reference written in HTML** — prototypes that show intended look, motion and behaviour. They are **not production code to copy**. The task is to recreate these designs in the target codebase using its existing environment and patterns; if there is no codebase yet, pick the framework that suits the project and implement them there.

Two structural notes about the references:

- They are single-file components with **inline styles only** (no stylesheets, no classes) because of the tool they were authored in. Do **not** port class-by-class. Read values from `DESIGN.md`, which is the canonical token list.
- Interactive prototypes hold state in a small logic class at the bottom of each file. That state model is worth reading — it documents intended behaviour precisely (see **State** below).

To view them: open any `.dc.html` in a browser. `design/support.js` and `design/media/` must sit alongside them.

## Fidelity

**High fidelity** for everything in `design/` except `Cat Profile Builder Wireframes.dc.html`, which is the original low-fi structural pass kept for context (it shows intent for a few states the hi-fi files reference in captions).

Colours, type, spacing, motion timings and copy in the hi-fi files are final decisions, not placeholders. The one deliberate exception is imagery: three photos of one cat (`media/charlotte-1..3.jpg`) stand in for the whole roster, and the "video" blocks are cover frames, not video.

## What's in this bundle

| File | What it's for |
|---|---|
| `README.md` | this — screens, behaviour, state, assets, gaps |
| `DESIGN.md` | the design system in prose: tokens, motion, voice, and where Tailwind fits |
| `TOKENS.json` | the same values machine-readable, with measured contrast ratios |
| `CONTENT.md` | every string in the product, plus the proposed publish-validation set |
| `BUILD-ORDER.md` | suggested phasing, acceptance criteria per phase, decisions needed |
| `design/` | the HTML design references and their assets |

Read `BUILD-ORDER.md` first if you're starting work; read this file for detail on a specific screen.

## Design tokens

`DESIGN.md` and `TOKENS.json` are the source of truth: 13 colours with measured contrast ratios, three type families with the full scale, a 4px spacing scale, four radii, two shadows, motion timings, and the icon and notice rules. It also contains a Tailwind config sketch and a note on where Tailwind is and isn't appropriate here.

Highlights a developer needs on day one:

- Accent `#0B6FB4`, deep `#0A3D63`, light `#8FD0FF`, whisper `#C9E7FF`, caution `#A4552A`
- Ink `#231F20`, body `#3D3937`, meta `#6F6A63` (text floor — `#8A857E` is hairlines only), paper `#F6F4F0`, card `#FFFFFF`, night `#0A0E12`
- Instrument Serif 400 (display) / Work Sans 300–600 (text + UI) / IBM Plex Mono 400–500 (labels), all Google Fonts — self-host for the kiosk, which may be offline
- Radius 0 editorial / 4 controls / 6 panels / 99 pills; shadows always blue-tinted
- Easing `cubic-bezier(.16,.84,.28,1)` everywhere except linear drift and linear progress

---

## Screens

### 1. Public profile — `Charlotte Profile v2.dc.html`

The signed-off public page. Fluid, 1280px max content width, 28px gutters.

Order of sections, top to bottom:

1. **Portal hero** — 260svh scroll container, sticky 100svh viewport. The hero photo scales 1.08 → 4.6 and fades out across the scroll while the name/kicker block translates up and out. Fixed 3px scroll-progress bar at the very top; the nav gains the cat's name and a solid background across the first 150vh; a bottom "Charlotte · 3 yrs · female · $95 · Adopt" bar slides up after 150vh.
2. **Facts strip** — white, `repeat(auto-fit, minmax(150px,1fr))`, 1px `.08` dividers. Age / Sex / Coat / Good with / **Fee** — fee is always last and always the blue cell with white type.
3. **Story** — two columns (`auto-fit, minmax(340px,1fr)`): mono kicker + serif headline left, body paragraphs + trait pills right. Headline wipes in via `clip-path`; paragraphs rise 54px.
4. **"A day in her life"** — 340svh pinned three-scene sequence: three photos cross-fade with scale, three timestamped captions swap, three progress dashes fill, and a vertical clock bar fills down the right edge. All driven by one `view-timeline`.
5. **What she needs** — three white cards, staggered rise.
6. **Film** — 16:9 frame that "opens" (scale .9 → 1, radius 34px → 10px) as it enters, photo drifting inside it.
7. **Quote photo** — 88svh, photo drifting, foster's quote in serif over a scrim.
8. **Adopt** — `#0A3D63` ground, serif headline, two pill CTAs, "Updated 4 days ago by a volunteer".
9. **Footer** — logo + one mono line.

All motion is **scroll-driven CSS** (`view-timeline-name`, `animation-timeline`, `timeline-scope`) with no JS. In a codebase without scroll-timeline support, IntersectionObserver + a scroll-progress value reproduces every effect; each animation's intended range is written in the source (`animation-range`).

`Cat Profile Hi-Fi.dc.html` holds the same page laid out at fixed 1440 (2a) and 390 (2b) if you need static references, plus the first carousel design (2c).

### 2. Builder — `Cat Profile Builder Hi-Fi.dc.html`, section **3a**

1440×920 app frame. Three columns under a 58px topbar.

- **Topbar** — logo, `All cats /` breadcrumb, editable cat-name field, "Draft saved 2s ago" with a 6px blue dot, undo/redo (redo disabled state shown), Preview (outline), Publish (blue).
- **Left rail, 250px** — *Add section* as a 2-up grid of six tiles (Hero, Bio, Photo, Gallery, Video, Facts); *Theme* as four swatches (Paper, Card, Night, Sand) with warmth/contrast sliders and a contrast-check note; *Media* as a 3-up grid of thumbnails with a `+` tile.
- **Canvas** — mono status line and a desktop/phone segmented control; the "page" holds block previews with real content. Clicking a block selects it: the selected block gets a 2px `#0B6FB4` outline and its toolbar actions appear in its footer strip; unselected blocks show only the block name. Phone view narrows the page to 414px and everything reflows (the gallery grid is `auto-fit minmax(96px,1fr)`).
- **Helper, 360px** — collapsible. Conversation, then a **proposal card** listing operations in plain language with Apply / Not this / "one undo". Applying is real: theme switches to Sand and the video block moves above the gallery. Applied state offers "↶ undo both"; dismissed state says "Left as it was. Nothing on your page changed." with a way back.
- Below the frame: locked-helper, blocked-publish and reduced-motion states.

**Themes** retint the canvas surface and ink only — photography is never tinted. Night theme swaps block labels and drag handles to light values.

### 3. Profile list — same file, section **4a**

1200×760. Topbar (logo, "Cats", count, search, New cat, Sign out), filter chips (All 12 / Live 7 / Drafts 5 — live), then a 4-column card grid: 4:3 photo with a status badge top-left (LIVE filled blue; DRAFT white outline), serif name, mono "edited 4d", and the first line of the bio so two tabbies are distinguishable. Last tile is a striped `+ new cat`. Drafts are never dimmed or hidden.

### 4. Sign in / first-time set-up — same file, section **4b**

900×560, split: 400px photo panel with logo and a serif line; form panel with a two-way segmented control. Sign-in = username + password. First time = invite code (focused state shown) + username + chosen password with a rule line. Primary button toggles the error state: *"That username and password don't match."* — never which half. One shared shelter account, 30-day session, edits attributed to "a volunteer".

### 5. Carousel set-up — same file, section **5a**

1400×820. Left 388px: rotation list — drag handle, thumbnail, name, media count, IN/OUT pill per cat (live; only published cats are eligible). Right: a **live 45% preview of the real carousel**, then two setting cards — hold per cat (5 / 6.5 / 8 / 12s) with a note that changes per choice, and three toggles (QR card, different photo each loop, play clips muted). Topbar carries cast status and "Start on Lobby TV".

Empty rotation is an explicit state: dark panel, "No cats are on the carousel right now.", and the cast button reads "Add a cat to cast" and does nothing. `5b` covers TV pairing, offline (last good rotation cached), and reduced-motion kiosk.

### 6. Focal points and breakpoints — same file, sections **7a / 7b / 7c**

**7a — focal point picker.** Click anywhere on the photo; a crosshair marks the point and four derived crops (profile hero, phone, list card, carousel at drift start) update live. Crops are `background-position: X% Y%` against `cover`. **This replaces every hand-tuned crop in these references** — implement it, or every photo will be blind centre-cropped.

**7b — 1280.** Helper docks to a 52px vertical tab and opens as an overlay drawer; rail becomes one column at 210px. **7c — iPad 1024×768 landscape.** Rail becomes a horizontal strip of 44px pills; block actions become pills inside the selected block; explicit Move up / Move down alongside drag.

Breakpoints: `≥1440` full · `1180–1439` helper as tab · `1024–1179` touch layout · `<1024` read-only preview with "Open on a laptop or tablet to edit".

### 7. Event carousel — `Cat Carousel Motion.dc.html`

1920×1080, TV-safe inset 64px vertical / 96px horizontal. Composition: logo + "Adoptable now" + counter and three progress dashes top; tag, name at 190px serif, one line at 46px, Age / Good with pills bottom-left; "Up next" thumbnails, media label and the white QR card bottom. Smallest type on the carousel is 14px at 1080p.

**The beat** (6.5s default, 4–12s configurable) — five moves in one cycle:

| Move | Window | What |
|---|---|---|
| Slat wipe | 0–0.9s | six vertical slats of the incoming photo reveal over the outgoing one, 55ms apart, direction alternating per beat |
| Drift | whole beat | scale 1.05 → 1.19 with a 1.8% pan, **linear**, direction flipped per beat |
| Name unmask | 0.09–1.3s | rising `clip-path` reveal while letter-spacing tightens .015em → −.03em |
| Rule + stagger | 0.04–1.6s | blue rule sweeps open from the left; tag, line, then three facts 60ms apart |
| Clear out | 5.6–6.5s | text leaves upward in arrival order; ~120ms empty frame before the next wipe |

Two implementation details that took several passes to get right — reproduce them:

1. **Slat geometry.** Each slat uses `background-size: 600% auto` with `background-position-x` at 0 / 20 / 40 / 60 / 80 / 100%. Percentage positioning maps those exactly onto slat boundaries at any container size; hardcoded pixel metrics tear at the seams and stretch the photo.
2. **Outgoing layer continuity.** The outgoing photo must occupy the *same box* as the drifting layer (`inset:-4%`) and hold the previous beat's **ending** transform, or the photo visibly snaps ~22% smaller at every wipe. Drift duration must equal the beat exactly, so A/B alternation chains.

Keyframes are authored in A/B pairs and alternated by beat parity, which is how the same element re-animates without remounting; one `animation-play-state` flag pauses everything.

---

## Interactions & behaviour

- **Block selection** — one selected block at a time; blue outline is the only blue outline on screen; toolbar actions only on the selected block.
- **Reorder** — drag, plus explicit up/down for keyboard and touch. Drop indicator is a 2px blue rule with a "drop here" mono label.
- **Helper** — proposes, never acts. Every proposal lists its operations in plain language, applies as one atomic operation, and is reversible exactly once. Destructive proposals name what they'll remove *before* the button. Failure: *"I couldn't reach the model. Nothing on your page changed."* Helper is inert until one photo exists, and says why.
- **Notices** — toasts bottom-left, 4px radius, lifted shadow, one at a time: success and progress self-dismiss at 6s, warnings and errors persist and never block the canvas. Modals only when the answer changes what happens; two buttons right-aligned, safe one left as outline, destructive one clay and naming the object; Escape = left button. Never a modal to confirm success. Full specimens in the design-system file, section 07.
- **Media rules** (the designer's assumptions — the spec supersedes them: photos JPEG/PNG/WebP ≤25MB, video MP4/MOV ≤200MB any length, a profile clip 1–15 s, the carousel shows the first 8 s; see `specs/001-cat-profile-builder/research.md` → design-to-spec ledger) — photos JPEG/PNG/HEIC ≤25MB, ≥1600px wide for hero, ≥1200px gallery, 12 per gallery; video MP4/MOV ≤500MB and ≤3min on upload, trimmed to 4–12s for the carousel and ≤30s for the profile, always muted and looping; alt text required before publish (offer a draft the volunteer can accept or rewrite); too-small images warn but do not block; **an upload never partially applies**.
- **Publish** — stays clickable and explains what's missing, then scrolls to the first gap. It never silently disables itself.
- **Reduced motion** — same layout, order and copy: scroll scenes resolve to their end state, the carousel stops auto-advancing and pages by arrow key, nothing autoplays. The design never depends on movement to be legible.
- **Kiosk** — arrow keys page, space pauses, the last good rotation is cached so a dropped connection never blanks the screen, pairing code rotates daily and only works on the shelter network.

## State

Read the logic classes for exact shapes. The essential models:

**Builder** — `{ selectedBlock, viewport: 'desktop'|'phone', theme: 0-3, blockOrder, helperOpen, proposal: 'pending'|'applied'|'dismissed', focal: {x,y} }`. Applying a proposal mutates theme + order together; undo restores both.

**List** — `{ filter: 'all'|'live'|'draft' }` over a roster of `{ name, photo, status, editedAt, blurb }`.

**Auth** — `{ mode: 'in'|'up', error }`.

**Carousel set-up** — `{ out: Set<catName>, hold, qr, rotateMedia, clips, previewIdx, casting }`. Two rules learned the hard way: when the previewed cat is switched OUT, move the preview to the nearest in-rotation cat; when the rotation is empty, render the empty state rather than composing a position from an empty list.

**Carousel** — `{ step, playing, speed, motion, elapsed }`; cat = `step % cats.length`, media = `floor(step / cats.length) % cat.media.length` so a cat shows a different photo on each loop.

**Data shape implied throughout** — a cat is `{ name, slug, status, age, sex, coat, goodWith, fee, tagline, bio[], traits[], media[{ id, kind, url, focal:{x,y}, alt, trim?:{in,out} }], updatedAt }`.

## Assets

- `design/media/logo-transparent.png`, `logo.png` — client logo. On dark grounds it is rendered `filter: brightness(0) invert(1)`; a proper white lockup would be better.
- `design/media/charlotte-1..3.jpg` — three photos of one cat, standing in for the whole roster in every reference.
- Fonts: Instrument Serif, Work Sans, IBM Plex Mono (Google Fonts, open licences). Self-host for the kiosk.
- QR: the carousel renders a real QR via `qrcode-generator` (1.4.4) pointing at `https://southcountycats.org/<slug>`. Any QR library is fine; keep it high error-correction and pixel-crisp on the carousel.
- Icons: twelve geometric icons specified in the design-system file, section 06, at 20px / 1.5px stroke / `currentColor`, never filled. Anything needing a real metaphor comes from Lucide at the same weight. Text glyphs in these prototypes (`⠿ ↶ ▶ ⌕ ≡ ✳`) are stand-ins — replace them.

## Not designed yet — do not invent

1. **The guided interview** — 5–10 questions in the helper that assemble a first draft, blocks landing on the canvas one at a time, marked unfinished and unpublishable, with one undo for the whole thing. Referenced in captions; no screens exist.
2. **The publish validation set** — which fields are required per block type is implied in three places, never defined.
3. **The public "all cats" index** — the profile nav links to it.
4. **Two volunteers, one shared login** — autosave plus a shared account makes edit collisions real. Needs a decided rule.
5. **Keyboard and screen-reader specs** for the block canvas — focus order and announcements for reorder.
6. **Print pieces** — cage card and QR flier, if in scope.

## Files

```
README.md                                     this file
DESIGN.md                                     canonical tokens, motion, voice, Tailwind note
TOKENS.json                                   machine-readable tokens
CONTENT.md                                    string inventory + proposed validation set
BUILD-ORDER.md                                phasing, acceptance criteria, open decisions
design/South County Cats Design System.dc.html  palette + contrast audit, type, space, components, icons, notices
design/Charlotte Profile v2.dc.html             public profile, fluid, scroll-choreographed  ← the profile spec
design/Cat Profile Hi-Fi.dc.html                profile at fixed 1440 + 390, and the first carousel
design/Cat Profile Builder Hi-Fi.dc.html        builder (3a), list (4a), auth (4b), carousel set-up (5a),
                                                focal point (7a), 1280 (7b), iPad (7c)
design/Cat Carousel Motion.dc.html              the carousel, live, with speed/motion controls  ← the motion spec
design/Cat Profile Builder Wireframes.dc.html   original low-fi pass, kept for context
design/media/                                   logo + three photos
design/support.js                                runtime for opening the .dc.html files
```
