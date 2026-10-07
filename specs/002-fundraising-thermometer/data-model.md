# Data Model: Fundraising Thermometer Display

Nothing here is stored. Every type below exists only in memory, built from the page address
(see [contracts/address.md](contracts/address.md)). All of it lives in `src/core/fundraiser/`,
which imports no framework (Principle I). Files: `money.ts`, `fundraiser.ts` (limits, defaults,
schemas, validators), `address.ts` (the reader and writer), `progress.ts`, `edit-session.ts`,
`fit.ts`.

## Fundraiser

The one thing the address carries.

| Field | Type | Rule |
|---|---|---|
| `headline` | `string` | Plain text. Normalised (control and bidi characters removed, whitespace collapsed, trimmed). 1–60 code points. |
| `raisedCents` | `number` (integer) | 0 ≤ value ≤ `AMOUNT_MAX_CENTS`. May exceed the goal. |
| `goalCents` | `number` (integer) | 1 ≤ value ≤ `AMOUNT_MAX_CENTS`. |

Constants (`limits` in `fundraiser.ts`): `HEADLINE_MAX = 60`, `AMOUNT_MAX_CENTS = 9_999_999_999`
(that is $99,999,999.99, the "under one hundred million dollars" of the spec's Assumptions),
`DEFAULTS = { headline: "Help us reach our goal", raisedCents: 0, goalCents: 500_000 }`.

The type is **derived from the Zod schema**, not declared beside it (Principle VI). Dollars are
held as whole cents so no arithmetic is ever done on a fractional dollar.

### Validation

One schema per field, each failing with a **reason code** (never a sentence; sentences are the
UI's, in `strings.ts`):

| Field | Codes |
|---|---|
| `headline` | `empty`, `too-long` |
| `raised` | `empty`, `not-a-number`, `negative`, `too-precise`, `too-large` |
| `goal` | the same, plus `zero` |

`validateHeadline(text)`, `validateRaised(text)`, `validateGoal(text)` return
`Result<value, code>` (the project's existing `Result` in `src/core/result.ts`). The in-place
fields call these; the address reader calls `validateRaised` and `validateGoal` and, for the
headline, `normaliseHeadline` followed by a cut to 60. **One function cannot both cut and refuse**,
so the shared piece is `normaliseHeadline(text)` (control, format, and separator characters
removed, whitespace collapsed, trimmed): the reader then **cuts** an over-long headline to 60 code
points and accepts it (spec Edge Cases), while `validateHeadline` **refuses** one. Length is always
counted after normalising ([address.md](contracts/address.md)).

## Progress (derived)

`progress(raisedCents, goalCents)` → `Progress`. Pure; integer arithmetic for every comparison. `describeProgress(raised, goal)` returns the formatted pieces (`raised`, `goal`, `percentLabel`, `reached`) the UI builds the meter's text and the "Updated…" status sentence from; the sentence templates are the UI's, in `strings.ts`.

| Field | Meaning |
|---|---|
| `level` | `min(1, raised ÷ goal)`: the fill, as 0–1. The only float, used only for drawing. |
| `percent` | `floor(raised × 100 ÷ goal)`: the whole percent. **True, not capped**: 120 for $12,000 of $10,000. |
| `percentLabel` | The tag's text: `"65%"`, and `"999%+"` once `percent` exceeds 999 (a $0.01 goal against the largest raise would otherwise print twelve digits). |
| `reached` | `raised ≥ goal`. |
| `milestones` | Four entries, see below. |

```
Milestone { at: 25 | 50 | 75 | 100, lit: boolean, label: string }
lit   = raised × 100 ≥ goal × at        // integers: no float can light a paw early
label = "25%" | "50%" | "75%" | compactDollars(goal)     // "$850", "$10K", "$1.25M"
```

**Why `floor` and not "nearest" (a change to SC-010, recorded in research R5):** with rounding,
$2,460 of $10,000 would show "25%" while the 25% paw is still dark, and $9,960 would show "100%"
without the goal being reached. Rounding down means the tag never claims a milestone the paws have
not reached, and is never more than one point below the truth. The spec's SC-010 is reworded to
say so.

## Money helpers (`money.ts`)

| Function | Does |
|---|---|
| `parseDollars(text)` | Text a person types or an address carries → `Result<cents, MoneyReason>`. Grammar in [address.md](contracts/address.md). |
| `formatDollars(cents)` | `$6,500` for whole dollars, `$6,500.50` otherwise. Thousands commas always. |
| `formatCompactDollars(cents)` | Paw label for the goal: under $1,000 whole dollars (`$850`; a goal under $1 shows its cents, `$0.01`), thousands `$10K` / `$12.5K`, millions `$1.25M`; at most 3 significant digits, **rounded first and the unit chosen after**, so $999,999 is `$1M`, never `$1000K`. |
| `toAddressAmount(cents)` | `6500` or `6500.50`, the form written to the address. |

## Edit session (`edit-session.ts`)

The state machine of [contracts/editing-interaction.md](contracts/editing-interaction.md).

```
EditState =
  | { kind: "idle" }
  | { kind: "amounts"; raised: string; goal: string; sticky: boolean;
      refusals: { raised?: RaisedReason; goal?: GoalReason } }
  | { kind: "headline"; text: string; refusal?: HeadlineReason }

EditEvent = hover-enter | hover-leave | open-amounts | open-headline | field-focus
          | input(field, text) | confirm
          | cancel(reason: "escape" | "outside" | "focus-leave" | "idle" | "fullscreen")

editSession(state, event, current: Fundraiser) → { state: EditState; commit?: Partial<Fundraiser> }
```

Drafts start as the formatted current value (`$6,500`) so the field looks exactly like the display
text it replaces. `IDLE_MS = 60_000` and `GRACE_MS = 300` are exported from this module; the hook owns the timers. The focus-leave rule is `shouldCancelOnFocusLeave({ relatedTargetInside, activeElementInside, pointerDownInside })`, also in this module, so the hook only reads the DOM.

## Fit (`fit.ts`)

`fitStep(length, breakpoints)` → the index of the first breakpoint the length does not exceed
(`0` = largest type), or `breakpoints.length` when it exceeds every one (the smallest step). `codePointLength(text)` counts code points. Both are pure; the display puts
the result on an element as `data-fit`. The breakpoint constants (`HEADLINE_FIT`, `AMOUNT_FIT`, `TAG_FIT`) are exported from `fit.ts`.

## Display state (UI, not core)

The client component holds `Fundraiser` in React state, initialised from the server's parse.
`fullscreen: boolean` is true when the Fullscreen API reports an element **or**
`(display-mode: fullscreen)` matches ([display-layout.md](contracts/display-layout.md)); `isBlank: boolean` is true when none of the keys exists in the address (an empty value counts as present; with `hintVisible`, which starts as `isBlank` and clears at the first confirmed edit, it drives the starting hint). It was true when the address
carried none of the three keys (drives the starting hint). Nothing else.

## State transitions at a glance

```
address ──read──▶ Fundraiser ──progress──▶ Progress ──▶ drawing
                      ▲                                     │ hover / focus / tap
                      │ commit                              ▼
                  editSession ◀──────── idle / amounts / headline
                      │ confirm
                      ▼
          history.replaceState(address)   (the only write)
```
