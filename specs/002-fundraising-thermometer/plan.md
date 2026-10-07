# Implementation Plan: Fundraising Thermometer Display

**Branch**: `002-fundraising-thermometer` | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/002-fundraising-thermometer/spec.md`

## Summary

One new public page, `/fundraiser`, in the existing Next.js app. It shows the white logo, a
headline, the amount raised and the goal, and a tall thermometer with paw-print milestones, on the
kiosk's night ground. The three values live only in the page address
(`?headline=…&raised=…&goal=…`, [ADR-018](../../references/project/adr/018-fundraiser-state-in-the-address.md)):
the server reads them once for the first paint, then the browser owns them and rewrites the
address with `history.replaceState` after each confirmed edit. There is no database, no Server
Action, no Route Handler, no cookie, and no new dependency.

The work splits three ways:

- **A framework-free core** (`src/core/fundraiser/`): money parsing and formatting, the
  `Fundraiser` schema and the address reader/writer, progress and milestone maths, the edit-session
  state machine, and text-fit steps. Everything with a rule in it, tested first.
- **A presentation layer** (`src/ui/fundraiser/`): a fluid container-query stage, the thermometer,
  the in-place field, the Full screen button, and a thin hook that turns browser events into the
  state machine's events.
- **A server page** (`src/app/(public)/fundraiser/page.tsx`): reads `searchParams`, calls the core
  reader, hands the result to the client display. Same shape as `/kiosk`.

Design artifacts: [research.md](research.md) (decisions R1–R15) · [data-model.md](data-model.md) ·
[contracts/address.md](contracts/address.md) · [contracts/editing-interaction.md](contracts/editing-interaction.md) ·
[contracts/display-layout.md](contracts/display-layout.md) · [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.x, `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`; Node 22
**Framework**: Next.js 16.3.4, App Router; the page is a Server Component, the display a Client Component (interactivity requires it)
**Primary Dependencies**: none new. Existing: `react`, `next`, `zod` (core already imports it), `next/font` faces already loaded in the root layout
**Storage**: none. The page address is the only place the values live (FR-021, FR-022, ADR-018)
**Testing**: Vitest (unit, component, contract projects; V8 branch coverage) + Testing Library; Playwright + `@axe-core/playwright` for the journey (ADR-012)
**Target Platform**: Cloud Run (existing); browsers on a TV or laptop in landscape, a portrait monitor, and phones. Container-query units, `clip-path`, and the Fullscreen API are assumed (all current browsers; iPhone Safari lacks the Fullscreen API, handled in the layout contract)
**Project Type**: single web application (one more public route)
**Performance Goals**: the page's text and thermometer paint with no layout shift when the fonts arrive and the logo never blocks them (FR-029); LCP ≤ 2.5 s on a mid-tier mobile connection (the constitution's default for a public page); fill and tag animate on `transform` only, paws and highlight on `opacity`; flat memory over 8 h (SC-007)
**Constraints**: no sign-in (FR-025); no storage anywhere (FR-022); plain-text headline only (FR-020); no scrolling in full screen on any shape (FR-007); no decorative motion; 60-character headline, $99,999,999.99 ceiling (R4)
**Scale/Scope**: one fundraiser per address, any number of addresses; no server load beyond serving the page

No `NEEDS CLARIFICATION` remains; each item is settled in [research.md](research.md).

## Constitution Check

*GATE: Must pass before proceeding. Re-check after design phase.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Modular, framework-free core | PASS | All rules (money grammar, validation, percent and paw maths, the address reader/writer, the edit state machine, fit steps) are in `src/core/fundraiser/`, covered by the existing ESLint `no-restricted-imports` rule on `src/core/**`. Components and the page only read input, call core, and render. The edit rules deliberately sit in a pure function, not in a hook. Each file has one reason to change: `money`, `fundraiser` (limits, schemas, validators), `address` (reader and writer), `progress`, `edit-session`, `fit`. `editSession` is written as one small handler per state so no function passes the complexity and 50-line warnings. Core imports `zod`, as `core/profile` already does; it imports no framework. |
| II. Test-first | PASS | Every core module and the page's parse is `[TDD]` (list below). Denial tests are named in the contracts: each money refusal, each headline refusal, an invalid amount blocking the whole commit, a pass-by hover not stealing an edit, hostile addresses. Layout, styling, and motion are exempt and covered by component and end-to-end tests. |
| III. Verified coverage | PASS | New core is fully unit-testable, so core stays ≥ 95/95 with no exclusion. UI and page are component-tested toward the app's 80/80. The end-to-end spec never counts. No new line in the exclusion list in `vitest.config.ts`. |
| IV. Strict typing | PASS | The query string and field text enter as `unknown` and pass a Zod schema; the `Fundraiser` type is derived from it; no `as` and no `any`. Next's `searchParams` shape is treated as untrusted input like any other. |
| V. Automated gates | PASS | Existing CI runs lint, format, typecheck, coverage, build, e2e on the new files with no config change. `pnpm check:spacing` applies to any Tailwind classes used (the display itself is a CSS module). `pnpm gen-tokens` output is checked for currency in the quickstart. |
| VI. Contract-driven boundaries | PASS | The one new seam is the address, with [a contract](contracts/address.md) and a contract test (round trip, per-value fallback, hostile table). There is no Server Action or Route Handler, so there is no server-side boundary to add; the server's only act is calling the same reader. No model boundary. Headline text is never rendered as HTML. |
| VII. Simplicity and YAGNI | PASS | No store, no new dependency, no extension point. One abstraction is created, `useWakeLock`, extracted from `KioskShell` because this page is its second real caller. `InPlaceField` has three callers (headline, raised, goal). Items the spec did not ask for are listed under Open items and left out. |
| VIII. Guarded AI editing | N/A | No model, no document, no AI path. |
| IX. Craft, motion, accessibility | PASS, with three items to watch | (1) Tokens: a `fundraiser` group is added to `TOKENS.json` and emitted by the generator (R11). (2) Contrast on night: measured, not guessed. `--color-clay` is 3.6:1 and fails, so the refusal text uses the tint `#F0A27C` (9.4:1); the unlit paw glyph is blue-light at 50 % (3.6:1, non-text) and its label at 60 % (4.7:1); all pinned in the token group and asserted with `contrastRatio`. (3) Phone width and short screens: the stack's sizes, its 35cqh thermometer floor, the fit steps, and the soft-keyboard risk (arrangement must not flip while a field is open) are verified by the e2e shape check and a real phone. Motion is `transform`/`opacity` only (the fill is a transform reveal, not `clip-path`, since ADR-009 records `clip-path` painting on the CPU in headless Chromium) and reduced motion is covered by the global rule and proved in e2e, since jsdom cannot see CSS-module rules; keyboard path and labels are component-tested for every interactive component. |
| Eng. Std: error handling | PASS | No exception paths: expected failures are `Result` values with reason codes. A bad address is never an error (FR-023). |
| Eng. Std: logging, secrets | PASS | No server logging added, no secrets touched. |
| Eng. Std: dependencies | PASS | None added. The expand glyph is drawn in the existing icon set's style instead of adding Lucide. |
| Eng. Std: documentation and ADRs | PASS | ADR-018 written. Every exported function, type, and component gets a doc comment (a task acceptance item). |
| Eng. Std: publishing | N/A | Not a profile; nothing is published and nothing is stored. |
| Quality Gates: security review | REQUIRED | The server reads untrusted input. Scope in Review Gates below. |
| Quality Gates: accessibility review | REQUIRED | New user-facing surface. |
| Quality Gates: performance review | Applies by default budget | LCP and no layout shift on the page; 8 h soak at the checkpoint. |

**Post-design re-check (2026-10-06).** After research and contracts, no principle moved. Two
things the design phase found and resolved, neither a deviation: the fields live on the left but
open from the thermometer on the right (fixed by widening the hover region and a sticky state,
[editing-interaction.md](contracts/editing-interaction.md)); and rounding the percentage to the
nearest whole would contradict the paw prints (fixed with `floor`, see Spec changes).

## Project Structure

### Documentation (this feature)

```text
specs/002-fundraising-thermometer/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Decisions R1–R15
├── data-model.md        # Fundraiser, Progress, edit session, fit
├── quickstart.md        # Validation scenarios and gate commands
├── contracts/
│   ├── address.md               # the one seam: query string ↔ Fundraiser
│   ├── editing-interaction.md   # the edit state machine, keyboard, touch
│   └── display-layout.md        # stage, thermometer, motion, full screen, accessibility
├── checklists/requirements.md   # Reviewer-owned; the agent never edits boxes
└── tasks.md             # Task breakdown, 25 tasks (/speckit-superspec-tasks)

references/project/adr/018-fundraiser-state-in-the-address.md
```

### Source Code (repository root)

```text
src/
├── core/fundraiser/                   # framework-free; ESLint-restricted (Principle I)
│   ├── money.ts                       # parseDollars, formatDollars, formatCompactDollars, toAddressAmount
│   ├── fundraiser.ts                  # limits, defaults, Zod field schemas, Fundraiser type,
│   │                                  #   normaliseHeadline, validateHeadline/Raised/Goal
│   ├── address.ts                     # readAddress(unknown), writeAddress → query string
│   ├── progress.ts                    # progress(): level, percent, reached, milestones
│   ├── edit-session.ts                # editSession() state machine; IDLE_MS
│   └── fit.ts                         # fitStep, codePointLength
├── app/(public)/fundraiser/
│   └── page.tsx                       # server: searchParams → readAddress → <FundraiserDisplay/>;
│                                      #   metadata: static title, robots noindex; force-dynamic
├── ui/fundraiser/
│   ├── FundraiserDisplay.tsx          # client shell: state, fullscreen vs editing view, wiring
│   ├── Thermometer.tsx                # tube, bulb, fill, paws, tag, role="meter"
│   ├── PawMark.tsx                    # the one new artwork
│   ├── InPlaceField.tsx               # grid-mirror input/textarea (Done and the refusal line live in the shared edit row)
│   ├── HeadlineField.tsx / Figures.tsx# the two editable groups (kept under the 200-line ceiling)
│   ├── FullscreenButton.tsx           # button, unsupported and refused messages
│   ├── use-fullscreen.ts              # fullscreenchange + (display-mode: fullscreen) via
│   │                                  #   useSyncExternalStore; enter()
│   ├── use-edit-session.ts            # DOM events → editSession events; idle and grace timers;
│   │                                  #   focus return; the one history.replaceState call
│   ├── strings.ts                     # every sentence (refusal codes → words, labels)
│   └── fundraiser.module.css          # the stage, hand-written CSS from tokens (ADR-008's
│                                      #   second kind of surface, as the carousel)
├── ui/shared/
│   ├── use-wake-lock.ts               # EXTRACTED from KioskShell.tsx (second caller)
│   └── icons.tsx                      # + Expand glyph
└── ui/carousel/KioskShell.tsx         # now imports useWakeLock; behaviour unchanged
references/design/TOKENS.json          # + fundraiser group
scripts/lib/tokens-css.ts              # + emit --fundraiser-* (test-first)
src/ui/tokens.css                      # regenerated by `pnpm gen-tokens`, never hand-edited
tests/
├── unit/core/fundraiser/              # money, fundraiser, address, progress, edit-session, fit
├── unit/scripts/gen-tokens.test.ts    # + fundraiser group
├── contract/fundraiser-address.test.ts# round trip + hostile table (address.md)
├── component/fundraiser/              # Thermometer, InPlaceField, FundraiserDisplay, page,
│                                      #   FullscreenButton, use-fullscreen, use-edit-session
├── component/shared/use-wake-lock.test.tsx
└── e2e/fundraiser.spec.ts             # shapes, reload, second window, full screen, axe, reduced motion
                                       #   (emulateMedia + computed transition), soft-keyboard check
```

**Structure Decision.** A sibling of the kiosk, not an extension of it: new `core/fundraiser`,
`ui/fundraiser`, and a route under `(public)`. The kiosk shares only what is genuinely shared
(`useWakeLock`, `Logo`, `useReducedMotion`'s global rule, the tokens). `src/proxy.ts` is not touched.

## Execution Strategy

### TDD Requirements

Tasks in these areas are marked `[TDD]` and follow RED-GREEN-REFACTOR:

- [ ] `core/fundraiser/money.ts`: every accepted form (`$7,200`, `7200.50`, `.5`) and every refusal code (`empty`, `not-a-number`, `negative`, `too-precise`, `too-large`), thousands-comma grammar, 12-digit guard; format and compact-format at the boundaries ($999, $1,000, $10,000, $1,250,000)
- [ ] `core/fundraiser/fundraiser.ts`: `normaliseHeadline` (control, format, and separator removal incl. zero-width-only → empty; whitespace; counted after normalising); typed validators refuse over-long and empty
- [ ] `core/fundraiser/address.ts`: per-value fallback, repeated keys, unknown keys, 60-code-point cut that never splits an emoji, `unknown` input, round trip and stability
- [ ] `core/fundraiser/progress.ts`: 0, exactly a milestone, one cent either side of each milestone, goal reached, 120 %, a goal of 1 cent against the ceiling (`999%+` label), `floor` percent, integer `lit` comparison; `formatCompactDollars` carry ($999,999 → `$1M`) and sub-dollar goals
- [ ] `core/fundraiser/edit-session.ts`: every cell of the transition table in editing-interaction.md, including the denials (pass-by hover during a headline edit, invalid amount blocks both, over-long headline refused) and `cancel(fullscreen)` from every state
- [ ] `core/fundraiser/fit.ts`: step boundaries, a length past the last breakpoint, code-point counting (emoji, combining marks)
- [ ] `scripts/lib/tokens-css.ts`: the `fundraiser` group emits `--fundraiser-*`, a malformed group throws. The existing test that pins the palette at 14 distinct hex values (`gen-tokens.test.ts`, "names every colour…") must be changed on purpose in the same task: the refusal tint `#F0A27C` is a deliberate new palette entry (the other new colours are `rgba`, which the test does not count)
- [ ] Contrast: a unit test over the `fundraiser` token values asserting 4.5:1 for every text/ground pair and 3:1 for the unlit paw glyph, using `contrastRatio`
- [ ] `tests/contract/fundraiser-address.test.ts`: the six invariants in address.md, before the page is written

Exempt from test-first (covered by component and end-to-end tests): the stage CSS, the thermometer's drawing and motion, token values.

### Parallel Execution Opportunities

- [ ] **Core** (`core/fundraiser/*` + the address contract test) and **tokens** (`TOKENS.json` + generator) share no files
- [ ] **`useWakeLock` extraction** (`KioskShell.tsx`, `ui/shared/`) shares no files with either and can run alongside them; its gate is that `KioskShell.test.tsx` and `kiosk.spec.ts` stay green unchanged
- [ ] After core and tokens exist: **`Thermometer` + `PawMark`** (pure drawing from `Progress`) and **`InPlaceField` + `use-edit-session`** (from `editSession`) share no files
- [ ] **`FullscreenButton` + `use-fullscreen`** is independent of both once the stage exists
- [ ] The **page**, the **display shell**, and the **end-to-end spec** come last; they need every other piece

### Human Checkpoints

1. **After core + tokens + extraction** — review the address contract and its hostile table; confirm `pnpm gen-tokens` leaves a clean diff and the kiosk's tests are unchanged and green.
2. **After the static display** (Story 1) — put it next to the brainstorm mockups at all five shapes and the phone sizes; the user judges "polished" and the long-text cases. This is where the cq-unit numbers in display-layout.md are tuned.
3. **After editing** (Stories 2 and 4) — run quickstart scenarios 3–7 and 11 by hand with the keyboard only, then on a phone.
4. **After persistence** (Story 3) — scenarios 8–9, including the second window and a deliberately hostile address.
5. **On site** — SC-003 (five metres, real 50-inch screen), SC-007 (eight-hour run), SC-001 (a volunteer who has not seen it).
6. **Before merge** — full gates, `/speckit-converge`, a branch (see Open items).

### Review Gates

Tasks in these areas are marked `[REVIEW]`:

- [ ] `contracts/address.md` and `core/fundraiser/fundraiser.ts`: review before any consumer is written
- [ ] **Security review** of the page, the reader, and everything that renders the headline: no `dangerouslySetInnerHTML`, no headline in `<title>`, a style, or an attribute other than a field's `value`; every value bounded before it is parsed; zero-width and bidi characters cannot make a headline invisible; `noindex` present; the framing question (R13) judged; `/fundraiser` answers `200` with no cookie and is absent from the proxy matcher (an e2e request with no cookie, since the unit test only pins the list); no unvalidated value reaches core; the hostile table passes in a real browser (script text appears as words)
- [ ] **Accessibility review**: keyboard walkthrough (scenario 11), focus return that does not reopen (including when the button already holds focus), visible focus on the night ground, the named `role="meter"` read by a screen reader and not duplicated by the edit button, the headline button's label-in-name, contrast table, reduced motion, 44 px touch targets, axe in both modes; and a recorded judgment on opening fields at focus (WCAG 3.2.1)
- [ ] **Performance review**: LCP and layout shift on a throttled mobile profile; one eight-hour soak watching memory
- [ ] `ui/shared/use-wake-lock.ts` + `KioskShell.tsx`: review that behaviour is unchanged
- [ ] Every interactive component: a keyboard-path component test exists (Full screen button, thermometer button, headline button, the fields, Done) before the story is called done

## Complexity Tracking

> No Constitution Check deviations. No waivers.

Tensions considered and rejected as deviations: core importing `zod` (the profile core already
does and the lint rule forbids only framework packages); touching `KioskShell` (a behaviour-
preserving extraction justified by a second caller, held to the kiosk's unchanged tests).

## Spec changes made while planning

Two, small:

- **SC-010** said the percentage tag matches the true share "to the nearest whole percent". With
  rounding to nearest the tag could say 25 % over a dark 25 % paw, or 100 % before the goal. It now
  says the tag shows the share **rounded down** to a whole percent. Reason and alternatives:
  research R5.
- **FR-009** said to show the true percentage. A $0.01 goal reached with $99,999,999.99 would print a
  twelve-digit figure that cannot fit. It now says the figure is shown as `999%+` beyond 999.

## Open items for the reviewer

None block planning. Each has a default in this plan; say if you want another.

1. **Full screen button when the browser is in F11 or kiosk mode.** The page's display state
   also listens to `(display-mode: fullscreen)`, which may catch F11 and kiosk flags. T013 checked
   what a headless run can: Chromium reports it true when the page's own button enters full
   screen, WebKit reports it false, and Firefox was not available to run (details in research.md
   R8). **Not yet verified; human step:** whether any real browser reports it under F11 or a
   kiosk flag, where `fullscreenElement` is null. Until someone checks, the default stands: the
   Full screen button stays visible on a display put in full screen that way. A further fix, if
   wanted: fade the button after three still seconds, as the kiosk's controls do. It is not in
   the spec, so it would be added there first.
2. **A "Copy link" control.** The spec says a screen is set up by keeping the address, but gives
   the volunteer no button for it; they use the browser's address bar. Default: leave it out.
3. **Starting hint.** In the editing view, while the address has no values, a one-line mono hint
   points at the thermometer ("Hover the thermometer to set your goal"). It disappears with the
   first confirmed edit and never shows in full screen. Default: include, since the spec asks that
   the volunteer be "invited" to set the goal and a touch screen has no hover to discover it.
4. **The branch.** Resolved: `002-fundraising-thermometer` was created from `main` with the
   working changes carried over, nothing committed yet.
5. **The expand icon.** Drawn in the existing icon style rather than adding Lucide for one glyph.
