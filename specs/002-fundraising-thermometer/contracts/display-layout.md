# Contract: The display's layout, motion, and accessibility

The visual agreement for `/fundraiser`. Values marked **start** come from the approved brainstorm
mockups (units are percent of the stage's height `cqh` or width `cqw`) and are tuned during build
by the five-shape check in the [quickstart](../quickstart.md); values marked **rule** are binding.

## The stage

- One element, `position: fixed; inset: 0` (so overscroll never shows the body's paper colour),
  on the night ground (`--color-night`), declared a **size container** (`container-type: size`) so
  its children size from the stage itself with `cqw`, `cqh`, and `cqmin`, not from the window.
  **Rule:** no JavaScript measures anything and there is no scaled fixed frame (the kiosk's
  1920×1080 frame cannot give a portrait screen or a phone a proper layout).
- Content stays inside a TV-safe inset. The carousel's `--carousel-safe-inset-*` tokens are fixed
  pixels for its 1080p frame, so this stage gets its own, in stage units:
  `--fundraiser-safe-inset-block: 5.9cqh` (64 ÷ 1080) and
  `--fundraiser-safe-inset-inline: 5cqw` (96 ÷ 1920). **Rule.**
- One soft blue glow behind the left group, a radial gradient from tokens, static. **Rule:** no
  decorative motion anywhere.

## Two arrangements, one switch

| Stage shape | Arrangement |
|---|---|
| Wider than tall (`aspect-ratio ≥ 1.1`), including 16:9, 16:10, 4:3, 21:9, a phone on its side | **Side by side** (FR-005): left group (logo, label, headline, amount raised, goal line, edit row) and the thermometer on the right. |
| Taller than wide, or nearly square (`aspect-ratio < 1.1`), including 9:16 and every phone upright | **Centered stack** (FR-030): logo, headline, amount raised, goal line, edit row, then the same upright thermometer below. The label "Current fundraiser" is dropped in the stack to save height. |

Switch with `@container (aspect-ratio < 1.1)`. *Decided in T012:* the threshold moved from 1 to 1.1
because at 1:1 the `999%+` tag ran off the stage in the side-by-side arrangement.

**Known risk — the soft keyboard.** The root layout sets `interactive-widget=resizes-content`, so
on a phone the stage shrinks when the keyboard opens: a 320×568 phone becomes about 320×250, which
is *landscape*, and the arrangement would flip from stack to side by side while the volunteer
types. (iOS Safari ignores `interactive-widget`, so the two platforms differ.) The first task on
the layout verifies this on an emulated and a real phone and applies the first fix that works:
(1) size the stage with `100svh` for the container query, so the keyboard does not change its
height; (2) failing that, read the arrangement once when a session opens and hold it with a
`data-arrangement` attribute until the session ends. **Rule:** the arrangement never changes while
a field is open. The two checks, run first on an emulated phone viewport and then on real devices:
**check 1** — with the page in a 390×844 viewport, open a field and shrink the viewport height to
about 420px (what the keyboard does); the arrangement must stay a stack. **check 2** — with a field
open on a 320×568 viewport, do the same; the field, its text, and the arrangement must survive.

## The paw print

The one new artwork: five ellipses in a 100×100 box, `fill="currentColor"`. Pad: `cx 50, cy 68, rx 25,
ry 20`. Toes: `cx 20, cy 44, rx 9, ry 13` rotated −22° about its own centre; `cx 40, cy 26, rx 9.5, ry 14`;
`cx 60, cy 26, rx 9.5, ry 14`; `cx 80, cy 44, rx 9, ry 13` rotated 22° about its own centre.

## Sizes (side by side) — start

| Element | Size | Notes |
|---|---|---|
| Logo (white) | 15cqh tall | The shared `Logo` (`tone="white"`, `height={LOGO_HEIGHT.carousel}`) with a class that sets `height: 15cqh; width: auto`, which overrides the image's own width and height attributes. No change to `Logo`. Not `priority`, so it never blocks the text (FR-029). |
| Label | 2.4cqh mono, `.2em` tracking, `--color-blue-light` | |
| Headline | up to 12cqh serif, `line-height .95`, at most 50cqw wide, wraps | Size steps by length: see Fit below. |
| Amount raised | up to 27cqh serif, `line-height .8` | Size steps by length. |
| Goal line | **≥ 4.4cqh** Work Sans (raised from the mockup's 3.6cqh so SC-003 holds, see research R9) | "raised of **$10,000** goal" and, when reached, the "Goal reached" pill. |
| Edit row | one row of **fixed height** (4 refusal lines side by side, 5 in the stack; tokens `editRowHeight`, `editRowHeightStack`; about 146px at 1920×1080, 86px at 390×844, 71px at 320×568) beneath the goal line | Reserved in every mode; holds Done and the refusal sentence when a session is open ([editing-interaction.md](editing-interaction.md)). Empty in full screen, so nothing reflows. |
| Full screen button | top-right at the safe inset, at least 44px tall | |
| Thermometer | 18cqh wide, bottom at 93cqh of the stage, **top at `max(14cqh, safe-inset-block + 44px + 3.5cqh)`**, `max(12cqw, 17cqh)` from the right edge (T012: 12cqw alone left the `999%+` tag off the stage on near-square shapes; identical to 12cqw at 16:9 and wider) | The `max` keeps the button clear of the tube's tip on short screens: at 375px tall the inset is 22px, so the top drops to about 79px instead of 52px, which would collide. *Decided in T013:* the gap under the button grew from 1cqh to 3.5cqh so the `100%` tag, which is centred on the tube's tip and half a pill (about 1.9cqh) taller than it, stays clear of the button on 844×390, 667×375 and 568×320 (at 1cqh it overlapped the button's lower edge by 4px). |
| Paw + label, percentage tag | 3.8cqh paw, 2.4cqh mono label | |

**Rule — text floors.** Nothing the viewer reads may be smaller than `max(10px, 2.4cqmin)`
(the design system's 10px mono floor; the carousel's 24px-at-1080p floor is 2.2cqh, and 2.4cqh is
the margin above it).

## Sizes (centered stack) — start

From the approved phone mockup (option 3). Widths are percent of the stage width; every text size is
the smaller of its `cqw` value and the `cqh` cap beside it, so the text block stays within the height budget below.

| Element | Size | Cap |
|---|---|---|
| Logo | 14cqw tall, centered, top at 7cqw | 8cqh |
| Headline | up to 13cqw serif, centered, `line-height .95`, wraps within the safe inline inset | 7cqh |
| Amount raised | up to 28cqw serif, centered, `line-height .8` | 14cqh |
| Goal line | 4.6cqw Work Sans, centered | 2.6cqh |
| Edit row | fixed height, 5 refusal lines (about 12.4cqh at 320×568) | |
| Thermometer | 22cqw wide, fills all remaining height, **never under 35cqh**, centered | |

**Height budget (rule).** From the top: safe inset 5.9cqh, logo ≤ 8cqh, headline ≤ two lines at its cap (about 13cqh), amount ≤ 11cqh of line box, goal line ≈ 3.5cqh, the edit row (fixed, 5 refusal lines, about 12.4cqh on a 568px screen; T017 moved the thermometer's share down accordingly), and about 6cqh of gaps: about 55cqh at worst. Add the bottom safe inset (5.9cqh) and the thermometer row has about 39cqh left, so its floor is **35cqh**. (The first draft set 45cqh and capped the text at 55cqh, which sums to 100cqh and leaves nothing for the logo, the edit row or the insets.)

Verified at 320×568, 360×640, 375×667, 390×844, and on their sides (667×375, 844×390), plus 1080×1920
(a 9:16 monitor), where the stack takes the widths above in `cqw` of a much larger stage.

## Fit: long text never clips, never moves the thermometer

Two pure functions in core give a **step** from a length; the component puts it on the element as
`data-fit="0|1|2|…"`, and the stylesheet gives each step a smaller maximum size. No measuring, no
flash, same result on the server and in the browser.

| Text | Length counted | Start breakpoints | Steps |
|---|---|---|---|
| Headline | code points | 24, 40 | 3 (60 characters is the most) |
| Amount raised | characters of the formatted text (`$6,500` = 6) | 6, 8, 10, 12 | 5 (`$99,999,999.99` is 14) |

The **goal figure** is deliberately not stepped (decided in T012): the goal line stays at its
4.4cqh floor and wraps if it must, so the line that a viewer reads from five metres never shrinks.
T014's shape check confirms the goal line stays inside the stage with `$99,999,999.99` at 320×568.
The per-step sizes for each text live in `references/design/TOKENS.json` (`fundraiser.size`:
`headlineFit*`, `amountFit*`, and their `Stack` forms) and are the numbers tuned at Checkpoint 2.
| Percentage tag | characters of the tag text (`65%` = 3) | 3, 4 | 3 (`999%+` is 5) |

**Rule.** A size is `min(<height-based>, <width-based>)` so that the widest allowed text still
fits its column at every shape. The five-shape end-to-end check renders the longest allowed
headline made of wide letters (`WWWW…`), `$99,999,999.99` as both figures, and a 1-cent goal
(`goal=0.01&raised=99999999.99`, the largest possible percentage), and asserts each element's box
lies inside the stage and does not overlap the thermometer.

## The thermometer

Built from plain elements and CSS (no canvas, no image).

**The scale.** Everything the level controls is mapped over one box, the **scale box**: the tube,
from its bottom edge to its round tip. The neck and bulb sit below it and are always filled, so an
empty thermometer still reads as one; they are not part of the scale. A level `L` (0–1) puts the
fill line, the percentage tag, and a milestone at `L` of the scale box's height above its bottom
edge, with no other offset. SC-002 ("within 1% of the thermometer's height") is measured on the
scale box, and the test says so.

- **Tube** with a round top, outlined in white at 60 %.
- **Fill** by a *transform reveal*, so it runs on the compositor: a mask element the size of the
  scale box with `overflow: hidden` and `transform: translateY(calc((1 - var(--level)) * 100%))`,
  holding a gradient layer (blue to blue-light, pinned to the tube) with the opposite
  `transform: translateY(calc((var(--level) - 1) * 100%))`. The two cancel, so the gradient stays
  put while the mask rises, which is what makes the colour brighten as the level rises. Both
  percentages are of the same height, so they cannot drift. `--level` is a unitless 0–1 number set
  inline. (Fallback if the layered transforms misbehave in the browsers checked: `clip-path`,
  as ADR-009 uses; note ADR-009 records that headless Chromium paints it on the CPU.)
- **Percentage tag** on the fill line: a pill in a track the size of the scale box, which starts at
  the tube's bottom edge and moves up with `transform: translateY(calc(var(--level) * -100%))`,
  with the same duration and easing as the fill (`--transition-duration-panel`, `--ease-default`).
  Its text is the true percentage, capped for display at **`999%+`** (a $0.01 goal reached with
  $99,999,999.99 would otherwise print a 12-digit number); FR-009 in the spec carries the cap.
- **Paw prints** at 25 %, 50 %, 75 %, and the goal, down the left side of the tube at
  `bottom: calc(<at> * 1%)` of the scale box, each with its label (`25%`, `50%`, `75%`, and the goal
  in short form: `$850`, `$10K`, `$1.25M`). Lit = `--color-blue-light` with a soft glow. Unlit =
  the same hue at **50 % for the paw** (3.6:1 on night, above the 3:1 non-text rule) and **60 % for
  its label** (alpha .7 since T026: the glow brightens the ground behind it, and the first .6 measured 4.08–4.18:1 in the phone stack; now 5.0:1 or more at 390×844, 320×568 and 1920×1080 — above the 4.5:1 text rule). The mockup's 35 % is 2.4:1 and is not used.
  Exactly the paws whose share has been reached are lit (FR-031; the test compares integers).
- **Goal reached** (FR-009): fill at 100 %, all four paws lit, a "Goal reached" pill beside the
  goal line, the tag showing the true percentage.
- **Highlight** while amounts are open (FR-013): the tube and bulb outline turn blue-light with a
  soft glow, via `opacity` and `box-shadow` on an overlay.

### Colour on the night ground (tested with `contrastRatio`)

Measured against `#0A0E12`: blue-light 11.7:1; white at 85 % about 14:1; white outline at 60 %
about 7.3:1; `--color-clay` 3.6:1 (**fails** 4.5:1, so not used for text here); `--color-meta` 3.6:1
(not used here either); refusal tint `#F0A27C` 9.4:1. The `fundraiser` token group fixes these
values, and a unit test asserts every text/ground pair at or above 4.5:1 and the unlit paw glyph
at or above 3:1.

### Motion

Nothing animates on load, and nothing is decorative. The fill and tag animate with `transform`
(compositor only); the paws and the highlight fade with `opacity`. Under
`prefers-reduced-motion: reduce` the global rule in `globals.css` already sets every transition
to 0.01 ms, so the fill and tag simply arrive (FR-008); no component code checks the preference.
jsdom cannot show this (a CSS module is an empty proxy there), so it is proved in the end-to-end
spec: `page.emulateMedia({ reducedMotion: "reduce" })` and `getComputedStyle(fill).transitionDuration`
is `0.01ms`, and with no emulation it is the panel duration.

Paw lights and the tag's text change at once while the fill glides; delaying them to arrive with
the fill is possible polish and is left out until the user asks.

## Full screen

The Full screen button calls `document.documentElement.requestFullscreen()` from the press itself
(the browser demands a user gesture). The page is in **display state** when
`document.fullscreenElement !== null` **or** `matchMedia("(display-mode: fullscreen)").matches`;
it follows `fullscreenchange` and the media query's `change`, both through `useSyncExternalStore`.
The media query is the extra signal that may catch a browser put in full screen by F11 or a kiosk
flag, where `fullscreenElement` stays null. Whether it does is **not assumed**: the first task on
this hook checks Chromium and Firefox and records which report it; where one does not, the limit
in the plan's open items stands. In display state the button, the headline and thermometer buttons,
the fields, Done, the edit row's content, the starting hint, and the status line are not rendered
at all (absent, not hidden, so nothing can take focus or leak to a screen reader).

- **Unsupported** (`requestFullscreen` missing, as on iPhone Safari): the button is replaced by the
  mono line "Full screen isn't available in this browser." and the page works as in the editing view.
- **Refused** (the promise rejects, for example a permissions policy): the same sentence appears
  in the status line beside the button (on a portrait stack, below it: T013) for six seconds.
- Escape and the browser's own exit leave full screen through the browser; the page only follows
  the event (FR-011).
- A screen wake lock is held while the page is visible, exactly as the kiosk does (SC-007), by the
  hook extracted from `KioskShell` into `src/ui/shared/use-wake-lock.ts`.

## Accessibility

- Landmarks: one `<main>`; the headline is the one `<h1>`. The logo has alt text "South County
  Cats" (FR-027).
- **Thermometer semantics (FR-028).** The drawing is one element with `role="meter"`, an
  accessible name (`aria-label="Fundraising progress"`), `aria-valuemin=0`,
  `aria-valuemax=<goal in dollars>`, `aria-valuenow=<raised, capped at goal>`, and
  `aria-valuetext="$6,500 raised of a $10,000 goal, 65 percent"` (the true percentage, with
  "goal reached" added when it is). Paws, tag, glow, and bulb are `aria-hidden`; their words are in
  the valuetext. The edit button over it is named "Edit the amount raised and the goal" only, so
  the figures are spoken once.
- Contrast: the table above.
- The in-place field controls are real `<input>` and `<textarea>` elements with labels
  (`aria-label` "Amount raised", "Goal", "Headline"), not styled text with `contenteditable`. The
  headline's display button is named by its own text.
- Focus is always visible: a 2px blue-light outline offset 2px on the night ground
  (`--shadow-focus-ring` is too faint on dark, as `Button`'s own comment notes for paper).
- Phone width: nothing scrolls sideways; touch targets ≥ 44px.

## Short screens (the brainstorm's open item)

In the stack the thermometer row takes whatever height the text leaves, within the height budget
under the stack table. **Rule:** the thermometer row never falls below 35cqh, and its scale box is
tall enough that the four milestones sit at least one paw height plus 4px apart (the end-to-end
shape check measures the distance between neighbouring paw boxes at the sizes listed under the stack
table).


## Added in T026 (accessibility review)

- One-line fields carry a hit area of at least 24 px (token `fieldHitMin`, an `::after` that moves no pixel); WCAG 2.2 target size.
- Selected text uses `--color-fundraiser-selection` / `-selection-text` (blue-light on night, 11.65:1).
