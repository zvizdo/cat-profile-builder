# Contract: Editing in place

How the page behaves outside full screen (FR-010 – FR-016, FR-027). The rules live in a pure
function, `editSession(state, event, current)` in `src/core/fundraiser/edit-session.ts`; the hook
`use-edit-session.ts` only turns DOM events into its events and runs the timers. Every row of
the tables below is a test case.

## What can be edited

Two **targets**, one open at a time:

- **amounts** — the amount raised and the goal, together. Opened from the **figures region**:
  the thermometer *and* the amount block on the left. The two sit in different columns with a gap
  between them, so the region is not one box (pointer enter and leave do not bubble across a gap).
  Both elements carry `data-figures`; the hook listens to bubbling `pointerover` / `pointerout` on
  the stage and asks `event.target.closest("[data-figures]")`. Leaving the region starts a
  **300 ms grace timer**; re-entering it (either element) cancels the timer, so the pointer can
  travel from the thermometer to a field. The `data-figures` element on the left is the **amount
  block** (raised figure and goal line); the two fields sit *inside* it while the session is open,
  so a pointer moving between them stays in the region.
- **headline** — the headline alone. While its session is open the field sits in a box marked
  `data-headline`; together with the shared edit row (`data-edit-row`, holding Done and the
  refusal sentence) it forms the headline's focus region.

Both use the same component, `InPlaceField`: same position, size, and type as the plain text
(no layout shift), a blue-light underline, and one small **Done** button. No popup, no panel.

**One shared edit row.** The left group reserves, beneath the goal line, a fixed-height row (tall enough for the
longest refusal sentence with both fields refused: 4 text lines side by side, 5 in the stack; tokens
`editRowHeight` / `editRowHeightStack`; decided in T017 after a wrapping refusal moved the figures) that exists in every mode, empty when nothing is open. The
Done button and the refusal sentence appear there, whichever target is open, so opening a session
never moves anything and entering full screen never reflows (FR-013). The row's height is part of
the left group's vertical rhythm in [display-layout.md](display-layout.md).

## Pointer types

Hover is a **mouse and pen** idea. `pointerover`/`pointerout` events with
`pointerType === "touch"` are ignored: a touch tap fires enter, up, leave, then click in that
order, which would otherwise open, close, and reopen the session. A touch opens the session only
through the tap/click row below.

## Events and results

State: `idle`, `amounts` (two drafts, a `sticky` flag, optional refusals), `headline` (one draft,
optional refusal).

| Event | From `idle` | From `amounts` | From `headline` |
|---|---|---|---|
| `hover-enter` (mouse/pen enters the figures region) | → `amounts`, **not** sticky | stays | ignored (a pass-by must not steal an edit) |
| `hover-leave` (the 300 ms grace ran out) | — | not sticky → `idle`; sticky → stays | — |
| `open-amounts` (thermometer button focused by keyboard, or clicked, tapped, Enter, Space) | → `amounts`, sticky | becomes sticky | → `amounts` (headline draft discarded) |
| `open-headline` (headline button clicked, tapped, Enter, Space) | → `headline` | → `headline` (amount drafts discarded) | stays |
| `field-focus` (a field takes focus) | — | becomes sticky | stays |
| `input(field, text)` | — | that draft changes, sticky, that field's refusal cleared | draft changes, refusal cleared |
| `confirm` (Enter in a field, or Done) | — | both drafts valid → commit both, `idle`; otherwise stay with the refusals | draft valid → commit headline, `idle`; otherwise stay with the refusal |
| `cancel` (Escape, a press outside the region, focus leaving it, idle timeout, or full screen starting) | — | `idle`, drafts dropped | `idle`, draft dropped |

A hover-open that is never touched is therefore just a preview: it shows the fields with the
current values and leaves when the pointer does. The first focus or keystroke in a field makes it
sticky. `cancel` carries a `reason` (`escape | outside | focus-leave | idle | fullscreen`) so the
hook knows whether to return focus (Escape only).

`confirm` returns `{ state, commit? }`. A confirm whose drafts equal the current values closes the
session with **no `commit`**: the hook then writes nothing and announces nothing. `commit` is the
changed values only; the hook applies it
to the page's state and writes the address with one
`window.history.replaceState(null, "", writeAddress(next))` ([address.md](address.md)).

### Cancelling by focus leaving, safely

Safari (macOS and iOS) does not focus a button when it is pressed, so a field's `focusout` can
arrive with `relatedTarget === null` *before* the click on Done lands, and cancelling then would
throw away the typed text. Two rules prevent that:

1. The Done button calls `preventDefault()` on `pointerdown`/`mousedown`, so pressing it never
   moves focus off the field at all.
2. A `focusout` with a null `relatedTarget` is **not** a cancel by itself. The hook checks one
   animation frame later: it cancels only if `document.activeElement` is outside the region **and**
   no `pointerdown` began inside the region in that frame. A `focusout` whose `relatedTarget` is
   an element outside the region cancels at once.

### Timers

- Idle: 60 s with no input while a session is open → `cancel(idle)`. Every keystroke, focus change,
  and pointer move over the region restarts it.
- Grace: 300 ms, above.
- When the idle timeout closes a session that held focus (T026), focus returns to the opener (same just-closed flag as Escape, so it does not reopen) and the status line says "Editing closed after a minute. Nothing was changed." A hover preview that times out stays silent.
- Both are cleared whenever the session returns to `idle` and on unmount.

## Validation at confirm

Uses the same `validateRaised`, `validateGoal`, `validateHeadline` as the address reader.
**Both** amount fields are checked, and any refusal blocks the whole commit (the display never
changes on an invalid entry — SC-008). Reason codes become sentences in `strings.ts`:

| Code | Sentence (plain language) |
|---|---|
| `empty` | Type an amount, for example 6,500. |
| `not-a-number` | That doesn't look like an amount. Use digits, like 6,500 or 6,500.50. |
| `negative` | An amount can't be negative. |
| `too-precise` | Use dollars and cents only, like 6,500.50. |
| `too-large` | That's more than this page can show. The most is $99,999,999.99. |
| `zero` (goal) | The goal has to be more than $0. |
| headline `empty` | The headline can't be empty. |
| headline `too-long` | Keep the headline to 60 characters or fewer. |

The sentence appears in the shared edit row beside Done, tied to the field with
`aria-describedby` and `aria-invalid`, and is announced (`role="alert"`). Its colour is the
refusal tint, not `--color-clay` (clay is 3.6:1 on the night ground and fails 4.5:1): the plan
pins `#F0A27C`, 9.4:1 on night, as `--color-fundraiser-refusal`.

## Keyboard path (Principle IX; every item is a component test)

Tab order in the editing view: **Full screen** → **headline button** → **thermometer button** →
(when open) **raised field** → **goal field** → **Done**.

- The thermometer button comes *before* the amounts in the page's order so that focusing it opens
  the fields and the next Tab lands in the first one. It is placed over the thermometer with CSS
  grid areas. Its accessible name is "Edit the amount raised and the goal" and nothing more; the
  figures are spoken by the thermometer's own meter ([display-layout.md](display-layout.md)), so
  they are not read twice.
- The headline in display state is a `<button>` inside the `<h1>`. Its accessible name is **the
  headline text itself** (WCAG 2.5.3, label in name); a visually hidden "Edit headline" is
  attached with `aria-describedby`.
- Enter in a field confirms; Escape cancels; Tab from Done leaves the region and cancels.
- *Decided in T019:* while a **headline** session is open the thermometer button is taken out of the
  tab sequence (`tabindex="-1"`), so Tab from the headline field reaches **Done** instead of landing
  on the thermometer button, which would have ended the headline session and opened the amounts.
- After a confirm, or an Escape cancel, **by keyboard**, focus returns to the control that opened
  the session. Returning focus must not reopen it. The hook arms a "just closed" flag **only when
  `document.activeElement !== button`** (if the button already holds focus, `focus()` fires no
  event and an armed flag would swallow the next real Tab-in), and clears it on the next
  animation frame either way.
- In full screen none of these controls are rendered (FR-012), so none can take focus. If full
  screen starts while a session is open, the hook sends `cancel(fullscreen)` first, so nothing
  stale returns on exit and no timer keeps running.
- A press anywhere outside the figures region (or outside the headline) cancels.
- **Note for the accessibility review.** Opening fields on focus alone is borderline under WCAG
  3.2.1 (On Focus), since it changes the page's appearance. It changes no context (focus stays
  put, nothing navigates or submits) and is what FR-013 asks for; the reviewer records the
  judgment.

## Touch

No hover exists, so tapping the thermometer or the headline opens the same sticky session (the
first tap is the open; fields take focus on the next tap, because opening and focusing in one tap
would raise the soft keyboard over the thermometer unasked). *Decided in T019:* the **headline**
field is the exception: it is the only field, a tap on the headline is clearly an intent to type, and
the arrangement hold keeps the layout steady, so it takes focus on open for every input. The Done button is at least 44 px
tall (the project's tap floor). Required component tests: Done is pressable after typing when
`focusout` arrives with a null `relatedTarget`, and a simulated touch tap does not flash the
session open then closed.

## Phone focus order (decided in T022)

In the phone stack the thermometer button comes before the amounts in Tab order but after them visually. Judged acceptable (WCAG 2.4.3): the button must precede the fields it opens, and the order is meaningful and predictable. Revisit only if a screen-reader user reports confusion.

## Confirmation

A confirmed change is shown by the thermometer moving and the figures changing (no toast, no
banner). For assistive technology, a visually hidden `role="status"` line says "Updated: $7,200
raised of $10,000, 72 percent." and is empty otherwise.
