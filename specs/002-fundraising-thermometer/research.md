# Research: Fundraising Thermometer Display

Every open item in the plan's Technical Context is settled here, in the form *decision, reason,
what was rejected*. One decision is large enough to be an ADR: R2 →
[ADR-018](../../references/project/adr/018-fundraiser-state-in-the-address.md).

## R1 — Where it lives

**Decision.** `src/app/(public)/fundraiser/page.tsx`, address `/fundraiser`. Outside
`src/proxy.ts`'s matcher, so no change to the guard and no sign-in (FR-025). The existing proxy
test already pins the matcher list exactly (`tests/unit/app/proxy.test.ts`), so adding a route to
it by mistake would turn that test red.
**Why.** It is the kiosk's sibling: a public, chrome-free page in the `(public)` group.
**Rejected.** `/thermometer` (names the picture, not the purpose), `/kiosk/fundraiser` (the kiosk
is the cat carousel; nesting would imply a link between them that does not exist).

## R2 — Where the numbers live

**Decision.** The query string: `?headline=…&raised=…&goal=…` ([address.md](contracts/address.md)).
Server reads it once for first paint; the browser then owns the state and rewrites the address
with `history.replaceState(null, "", "?…")`. ADR-018 records the decision and what it costs.
**Verified.** Next.js's own documentation (App Router, "Linking and navigating" →
`window.history.replaceState`) says the native calls "integrate into the Next.js Router" and
change the address "without reloading the page"; `replaceState` adds no history entry. The server
component is not re-run, which is what we want: the client is the source of truth after load.
**Rejected.** See ADR-018 (database, `localStorage`, signed address, `#` fragment).

## R3 — Money

**Decision.** Whole **cents** as integers everywhere inside the program; dollars only at the
edges (typing, display, address). `parseDollars` accepts `$7,200`, `7200.50`, `.5`, and refuses
everything else with a reason code ([address.md](contracts/address.md)).
**Why.** Percent maths and the "is this paw lit" test become exact integer comparisons; floats
would eventually light a paw one cent early.
**Rejected.** Floating dollars (rounding), a decimal library (a dependency for one
multiplication — Dependency policy).

## R4 — Limits

**Decision.** Headline 60 code points; amount ceiling $99,999,999.99; defaults "Help us reach our
goal", $0, $5,000.
**Why.** The spec deferred these to planning ("about 60 characters", "under one hundred million").
60 characters keeps a headline to about three lines at its smallest size step; the ceiling gives
a 14-character figure (`$99,999,999.99`) at its smallest size step. Both are *targets* that the
five-shape fit check in the quickstart confirms or moves; if a limit does not fit, the limit comes
down, not the legibility. The $5,000 placeholder goal gives an empty thermometer a sensible scale;
it is shown, not hidden, so the volunteer sees what to change.
**Rejected.** A ceiling of one billion (would need a smaller smallest step, hurting legibility for
a number a cat rescue will not reach).

## R5 — Percent shown

**Decision.** `floor`, not "nearest": see [data-model.md](data-model.md) → Progress. SC-010 in the
spec is reworded to match (the change is recorded under *Spec changes* in plan.md).
**Rejected.** Nearest-with-a-clamp-at-99 (fixes only the 100% case, leaves "25%" over a dark paw).

## R6 — Edit session as a pure state machine

**Decision.** The rules (when hover opens the fields, when it stays open, what Escape does,
what a refusal does) are one pure function in core, tested exhaustively; the React hook is a
thin translator plus a timer ([editing-interaction.md](contracts/editing-interaction.md)).
**Why.** Constitution Principle I names exactly this: "a rule inside a component body is a
defect". It also makes the denial cases (invalid amount blocks the commit; a pass-by hover does
not steal a headline edit) cheap unit tests rather than slow browser tests.
**Gaps found while planning and in review.** The mockup opens the fields when the pointer is over
the thermometer, but the fields are on the *left*, in another column. A pointer travelling between
them leaves both, and pointer enter/leave do not bubble across the gap. The figures region is
therefore two elements marked `data-figures`, watched through bubbling `pointerover`/`pointerout`
with a 300 ms grace timer, and the first focus or keystroke makes the session sticky. Other holes
closed in the contract: hover applies to mouse and pen only (a touch tap would flash the fields
open and shut); Safari does not focus a pressed button, so a focus-out with no target cannot be
read as "cancel" (Done also keeps focus on the field by cancelling `pointerdown`); the "just
closed" flag that stops focus return reopening the session is armed only when focus actually has
to move; and full screen starting cancels an open session.
**Rejected.** `useReducer` inside the component (rules untestable without a DOM), a form library
(a dependency for two fields).

## R7 — In-place fields

**Decision.** One component, `InPlaceField`, used by the headline and both amounts. A real
`<input>` (amounts, one line) or `<textarea>` (headline, wraps) stacked in a CSS grid cell with a
hidden mirror of its own text, so the box is exactly as wide and tall as the text it replaces
and nothing shifts. The display state of the headline is a `<button>` styled as the heading's
text, so a click, Enter, or Space opens it.
**Why.** `contenteditable` is inconsistent for plain text across browsers, makes a11y labelling
harder, and invites pasted markup (FR-020). The grid-mirror trick needs no JavaScript measuring
and works in every current browser, unlike `field-sizing: content`, which Firefox lacks.
**Rejected.** `contenteditable="plaintext-only"`, `field-sizing: content`, measuring with a
`ResizeObserver`.

## R8 — Full screen and keeping the screen awake

**Decision.** The Full screen button calls `document.documentElement.requestFullscreen()`; the
page tracks `fullscreenchange` through `useSyncExternalStore`. `useWakeLock` is **extracted** from
`KioskShell.tsx` to `src/ui/shared/use-wake-lock.ts` and used by both (a second real caller, so
the abstraction is earned — Principle VII); `KioskShell`'s tests must stay green unchanged.
**Why.** SC-007 sets the kiosk's bar (eight hours unattended); a screen that sleeps fails it. The
kiosk's other hook, "fullscreen on first press", is *not* reused: here fullscreen is an explicit
button (FR-010).
**F11 and kiosk-mode browsers.** `fullscreenElement` stays null there. The display state also
listens to `matchMedia("(display-mode: fullscreen)")`, which may report it. **Checked in T013
(2026-10-06), headless Playwright 1.63 on macOS, against a production build:**

| Browser | Entered how | `fullscreenElement` | `(display-mode: fullscreen)` |
|---|---|---|---|
| Chromium (headless shell) | the page's own `documentElement.requestFullscreen()` from the button | `HTML` | **true**, at 1920×1080, 1080×1920, 844×390, 390×844, 375×667 and 320×568; back to false after `document.exitFullscreen()` |
| WebKit (Playwright build) | the same button | `HTML` | **false** (and `webkitFullscreenElement` also `HTML`) |
| Firefox | not run: no Firefox build is installed in this sandbox and none was downloaded | not checked | **not yet verified; human step** |

What this shows: Chromium's query answers true for a fullscreen the page itself requested, so the
hook's two signals agree there and the display state follows either. WebKit does not report it,
which is harmless for the page's own request (`fullscreenElement` carries it) but means the query
cannot be relied on to catch a WebKit window put in full screen from outside the page.
**Not yet verified; human step:** whether Chromium, Firefox or Safari report the query when the
window is full screen by **F11 or a kiosk flag** (`--kiosk`, `--start-fullscreen`), where
`fullscreenElement` is null. A headless run cannot press F11 or start a kiosk browser. The step
for a human: in each real browser, open `/fundraiser`, put it in full screen with F11 (or the
flag), and run `matchMedia('(display-mode: fullscreen)').matches` in the console. Until then
the plan's open item 1 default stands: the Full screen button stays visible in those windows. In
headless Chromium the Escape key did not leave full screen (the page followed
`document.exitFullscreen()`); Escape in a real browser is the same human step.
Where a browser does not report it, the Full screen button and hover fields stay in place. See
*Open items* in plan.md.

## R9 — Layout

**Decision.** A fluid stage sized by container-query units, with a side-by-side arrangement for
landscape and a centered stack for portrait ([display-layout.md](contracts/display-layout.md)). No
scaled 1920×1080 frame, no JavaScript measuring.
**Why.** The kiosk's fixed-frame scale (`fitStage`) shows a 16:9 picture letterboxed on any other
shape; the spec requires 16:10, 4:3, 21:9, 9:16 and phones to fill properly (FR-007, SC-004,
FR-030). Container-query units are supported in every current browser.
**Legibility (SC-003).** A 50-inch 16:9 screen is about 62 cm tall. At 5 m, the common signage
rule of thumb asks for a cap height of roughly distance ÷ 250 = 2 cm. The goal line at 4.4cqh is
a 2.7 cm font size (cap height about 1.9 cm); the amount at 27cqh is 16.8 cm. The mockup's 3.6cqh
goal line would have been 2.2 cm (cap height about 1.5 cm), under the rule, so it is raised.
This is a proxy, not a measurement; the on-site check in the quickstart is the real test.
**Soft keyboard.** The root layout's `interactive-widget=resizes-content` shrinks the stage when a
phone's keyboard opens, which could flip the stack to side-by-side mid-edit. Recorded as a known
risk with two ordered fixes in display-layout.md; the arrangement must never change while a field
is open.
**Rejected.** Reusing `fitStage` (wrong shapes), `vw`-only sizing (a 9:16 screen would get type
sized for a landscape one).

## R10 — The thermometer's drawing and motion

**Decision.** Plain elements and CSS; a full-height gradient layer revealed with `clip-path`, the
percentage tag moved with `transform`, both driven by one inline `--level` number and the same
duration and easing ([display-layout.md](contracts/display-layout.md)). Reduced motion is already
handled by the global rule in `globals.css`, so no component checks the preference.
**Revised after review.** The first draft used `clip-path`, but ADR-009 itself records that
headless Chromium paints `clip-path` on the CPU, and Principle IX asks for `transform`/`opacity`
wherever possible. The fill is now a **transform reveal**: a mask with `overflow: hidden`
translated up, holding a gradient layer translated the opposite way, so the gradient stays pinned
to the tube (a plain `scaleY` would stretch the colour; a single translate would pin the brightest
colour to the fill line and lose "brightens as it rises"). All level maths is over one **scale
box** (the tube), written down in display-layout.md, so fill, tag, and paws share one linear map.
`clip-path` stays as the named fallback.
**Rejected.** A canvas or SVG gradient (more code, harder to test), `height` transitions (layout
every frame), a count-up animation on the amounts (not requested; noisy for assistive tech).

## R11 — Design tokens

**Decision.** Add a `fundraiser` group to `references/design/TOKENS.json` (colours at the alphas
the night ground needs, glow, geometry ratios, tracking) and teach `scripts/lib/tokens-css.ts` to
emit it as `--fundraiser-*` custom properties, exactly as the `carousel` group is handled; then
`pnpm gen-tokens`. `src/ui/tokens.css` is generated and is never edited by hand.
**Why.** Principle IX forbids duplicated magic values, and the carousel set the precedent.
The generator change is test-first against `tests/unit/scripts/gen-tokens.test.ts`.
**Rejected.** Literal values in the CSS module (a second token system), reusing `--carousel-*`
(different meaning, would couple the two surfaces).

## R12 — Testing

Mapped in plan.md → Execution Strategy. Principle III's numbers hold without new exclusions: the
new core is fully unit-testable, the UI is covered by component tests, and the page file by a page
test in the style of `tests/component/carousel/kiosk-page.test.tsx`. The end-to-end spec
`tests/e2e/fundraiser.spec.ts` is evidence for the journeys only and never feeds coverage.
One browser fact to confirm early in the first UI task: Chromium headless honours
`requestFullscreen()` from a Playwright click; if it does not, the journey falls back to asserting
the call was made through a stubbed `requestFullscreen` and the `fullscreenchange` handling is
covered in the component tests.

## R13 — Security posture

No Server Action, no Route Handler, no request body, no key, no provider call. The only
untrusted input is the query string, read on the server and in the browser through the same
schemas. Controls: plain-text rendering only (React text nodes; the headline never reaches
`dangerouslySetInnerHTML`, `<title>`, an attribute other than a form field's `value`, or a style),
control, format (zero-width, joiner, bidi), and separator characters removed so a headline cannot
be invisible, all three values length-bounded before parsing,
`robots: noindex`, no cookie, no storage. The accepted residual risk is the spec's: a crafted
link looks official. A `frame-ancestors` header against framing by other sites was considered and
left out (a plain link does the same job; the header would add a config change for little gain);
the security review confirms that judgment. The constitution's security review applies because the server reads
untrusted input; its scope is in plan.md → Review Gates.

## R14 — Idle editing

**Decision.** An open session with no input for **60 s** cancels itself (spec Edge Cases). The
same figure as the kiosk's pause give-up (`KIOSK_IDLE_RESUME_MS`), so the shelter's two displays
behave alike. It is a separate constant on purpose: core cannot import from `ui/carousel`. The hook owns the timer; the core takes it as an ordinary `cancel(idle)` event.

## R15 — Dependencies and assets

No new dependency. The paw print is the one new artwork, an inline SVG component (`PawMark`) drawn
from the brainstorm's shapes (one ellipse pad, four ellipse toes). The Full screen button needs
an expand glyph; the design system's icon rule is "Lucide for anything beyond the twelve
geometric ones", so the four-corners glyph is added to `src/ui/shared/icons.tsx` in the same 20px,
1.5px-stroke style as its neighbours rather than adding Lucide as a dependency.
