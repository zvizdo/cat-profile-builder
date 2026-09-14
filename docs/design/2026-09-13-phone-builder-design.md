# Phone builder — one builder, one column, two drawers

Date: 2026-09-13. Status: approved in brainstorm (Approach A); QA'd (`.superpowers/sdd/tasks/phone-builder-design-qa.md`) and amended the same day.
Supersedes the phone mode of FR-091 (read-only preview; the helper edits blocks).

## Goal

Below 768 px the builder offers everything the full builder offers — add, edit, reorder and
remove sections by hand, tune the theme, manage media, talk to CATalyst — laid out for a
phone: one editable column, with Media and CATalyst as bottom drawers and Preview as a page.
No second code path: the phone renders the same components as desktop in a different
arrangement.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Block editing | In place, in the single column — the same editors as desktop, one column wide |
| Reordering | Move up / down buttons only (no touch drag) |
| CATalyst while working | The drawer drops to a peek bar; the canvas is visible and follows each change (F34); a card expands the drawer to half height |
| Placing media | From the block: an empty slot or a photo's "replace" opens the picker sheet; the Media drawer is for upload, focal point, trim, description, enhance, delete |
| Theme controls | All three stay (presets, warmth, contrast) plus the AA status line |
| Facts and Theme | Top of the stack, each collapsed to one line, expands on tap |
| Chrome | Bottom bar: Media · CATalyst. Top bar: name · undo/redo · Preview · Publish menu ("Saved … ago" inside the menu) |
| Approach | A — one responsive builder; `PhoneMode.tsx` deleted |

## 1. Chrome

- **Top bar** (`layout.builder.topbar` = 58 px, sticky): the cat's name (truncated with an ellipsis, never wrapping),
  `↶` `↷` (44 × 44, disabled states as desktop), **Preview** (icon button, `aria-label="Preview"`,
  opens `/builder/{id}/preview` as a full page — the existing route), and the **Publish /
  Published** menu button (the existing menu; the "Saved 2 s ago" status moves into the top of
  that menu as its first, non-interactive line; the topbar's `role="status"` for the save
  state stays in the DOM, visually hidden, so screen readers keep hearing it). Amended
  2026-09-13 by F55 (the phone sweep, finding 7): once the cat is live or archived the trigger
  is `● Live` / `● Archived` — the dot with one short word — not the dot alone F44 shipped,
  which a first-timer could not read. Measured at 390 with `Undo` `Redo` `Preview`: a
  `Charlotte`-length name shows whole in either state; longer names truncate with an ellipsis,
  never the controls. The column's first row is `‹ All cats` — the icon set's chevron and the words (finding 5) — not `All cats /`. The topbar
  keeps the one `role="status"` announcer for `CATalyst is working…` (F25's one-announcer
  rule); the peek bar's text is `aria-hidden`.
- **Bottom bar** (58 px + safe-area inset, sticky; a new token `layout.phone.bar` is NOT
  needed — reuse `layout.builder.topbar`; add `layout.phone.peek: 48`): two equal tabs, **Media** and **CATalyst**,
  icon above a mono reading-voice label, `role="tablist"`-free (they are buttons that open
  sheets, `aria-expanded`, `aria-controls`). A 6 px blue disc on CATalyst when a card waits or
  a turn ended unseen (the same rule as the desktop collapsed tab, F27). "Working…" state:
  the disc breathes (reduced motion: still).
- The canvas scrolls between the bars; `scroll-padding` accounts for both so F34's centring
  lands in the visible band.

## 2. The stack (canvas)

Order, top to bottom:

1. **Facts** — collapsed: one line `Vini · 2 years · male` (or `Unnamed cat · age? · sex?`),
   chevron; expanded: the existing facts fields (name, age, sex, tagline). Collapsed by
   default once a name exists; expanded for a brand-new cat.
2. **Theme** — collapsed: `Paper · warmth 0.50 · contrast 0.60`; expanded: the four preset
   swatches in one row, warmth and contrast sliders, the AA status line ("contrast check:
   passes AA" / the failing sentence). Collapsed by default.
3. **Blocks**, in document order, each the existing `BlockFrame`, with a **phone label row
   that is new markup**: below 768 px it replaces both `BlockFrame`'s hidden `Handles` column
   (drag handle, Move up, Move down) and `BlockShell`'s hover-gated action row. It holds the
   kicker (from `BlockShell`), `↑` `↓` (dispatching what `Handles`'s Move buttons dispatch),
   `duplicate` (kept, from `BlockShell`) and `remove` (from `BlockShell`) — four 44 px icon
   targets, always visible, never hover-gated; `↑` disabled on the first movable block, `↓`
   on the last; the hero stays first and unmovable. Editor-specific actions (`replace photo`,
   `re-trim`, `focal point`, `enhance`) stay in the editor body as visible 44 px buttons on
   the phone. Touch drag is suppressed by omission: the drag handle (the only sortable
   activator) is not rendered below 768, and the DnD sensors array keeps its length
   (`CanvasStack.tsx`'s documented constraint). Between blocks and at the end: the existing **Add section** control, which opens
   the section picker as a bottom sheet (the same tiles).
4. No preview, no `CANVAS · phone` label, no "read-only" copy.

Editors at one column: the bio toolbar wraps onto two rows; gallery slots stack two-up;
"A day in her life" scenes stack vertically (photo, caption); needs cards stack; the video
block shows the poster with its trim/replace actions under it. Every control keeps its
desktop accessible name so the existing component tests hold. F34's follow behaviour
(centre, two-pulse ring, `CATalyst · just now` tags, clickable change list) applies to this
column unchanged.

## 3. Drawers (mechanics)

- A drawer is a new `Sheet` component (`src/ui/builder/phone/Sheet.tsx`) with an explicit
  `mode`: **`modal`** for the **Full** height — `role="dialog"`, `aria-modal`, Tab trap,
  Escape closes, opener regains focus (it shares `Modal`'s keyboard/focus helpers — extract
  them from `Modal.tsx` into `src/ui/shared/dialog-focus.ts` rather than duplicating) — slid
  up from the bottom, `100dvh` minus the top bar, the bottom bar hidden while it is full (the
  sheet's header holds the title and close). **`plain`** for **Half** and **Peek** — no
  dialog role, no scrim, no focus trap: the canvas stays reachable by Tab and pointer; the
  sheet is a `region` named by its title. The remove question stays the existing centred
  `Modal` (a true dialog that fits 390). The section picker is a bottom sheet like the slot
  picker (`Modal` at `placement="bottom"`, the list scrolling inside, `Cancel` pinned) —
  amended 2026-09-13 by F55: the centred card stood taller than the phone's window.
- Tapping the other tab while one is open swaps sheets (close then open, one frame).
- No browser-history integration (back does not close a sheet — YAGNI; Escape and the close
  button do). The viewport meta gains `interactive-widget=resizes-content` so the soft
  keyboard shrinks `100dvh` and the composer stays above it.
- State survives close: the conversation, the selected media tile, an in-progress upload.
- Motion: the sheet slides up over `--motion-panel` (320 ms); under `prefers-reduced-motion`
  it appears in place.

## 4. CATalyst drawer

Three heights, one component: `HelperPanel` gains a `layout` prop — `"docked"` (today's
`surface="full"` shape), `"sheet"` (inside the phone's Full sheet: never `hidden`, no 40dvh
cap, no collapse tab — the sheet's close replaces it, the composer sticky at the bottom).
The protocol's `surface` is unchanged and independent of `layout`. The old `surface="phone"`
rendering branches in `HelperPanel`, `Chips.tsx` and `PanelHeader.tsx` are removed.

- **Full** — header `CATalyst AI Assistant · sees this page · cannot publish` and close; the
  conversation log (`role="log"`, focusable — F27), the chips row (horizontal scroll, 44 px
  pills), the composer pinned at the bottom above the keyboard.
- **Peek** (on send, automatically) — a 48 px bar sitting on the bottom bar: the breathing
  disc + `CATalyst is working…`; when the turn ends it shows the receipt line (`Applied —
  added bio, gallery`) or the proposal question (`Want me to build this now?`) or the failure
  sentence, truncated to one line, with a chevron. Tap → Full. The canvas is fully visible
  and follows the changes. The peek is dismissible (addendum, F45): a chevron-down control
  at its end (44 px, `Hide CATalyst`) or a swipe down on touch closes it to the `closed`
  height; it returns automatically when the next turn starts or a card arrives, and a
  turn that ends behind it counts as unseen for the tab's disc.
- **Half** (automatically when a card arrives, or when the peek's line is a question) —
  `50dvh`: the proposal card (ledger, notice, Apply / Not this / one undo — F26) or the
  proposal text with the composer; the top half of the canvas shows the block the card names
  (F34 centres it in the visible band above the sheet). Apply / Not this → back to Peek;
  drag the header down or tap close → Peek. (2026-09-13, F60: built — `cardTarget` in
  `turn.ts` names the block, `use-follow.ts` reveals it once per card, on both surfaces.)
  A card whose change would put Apply under the Half sheet's fold opens the drawer to Full
  instead (F58): at 390×664 the Half body holds the ledger line and the notice and no more,
  so that is any card that draws a change block — a text field's two lines, the bio's
  diff, the needs cards (F58), a `replace_image` pair, a gallery's dropped faces, or a
  `remove_block` with a face (F59, measured the same way: two full alt-text lines under a
  56px face put Apply as far under the fold as a long bio diff does) — and only the
  one-line `Charlotte → Marmalade` card, or a `remove_block` with no face to draw (F59),
  stays Half. Full covers the block F60 revealed, which is fine: the card says what changes, and the
  canvas shows it once Apply / Not this drop the drawer to Peek, the same way as from Half.
- The composer's refocus at turn end never scrolls the page (`preventScroll`, F34).
- The topbar's "CATalyst is working…" announcer (`role=status`) is the one live region; the
  peek text is `aria-hidden` (F25's one-announcer rule).

## 5. Media drawer

- **Full** only: header `Media · N items` and close; the **Upload** button (44 px, first in
  the body); the tile grid (F38 tiles, 3 across at 390); selecting a tile shows the **media
  card** under the grid (F38/F39: name, description, `Focal point` / `Trim` / `Enhance…` /
  `Remove`, the `On the page ·` line); Escape / Close / re-tap / outside tap close the card.
- Focal point, trim and enhance open their own sheets on top (the existing dialogs), and
  return focus to the card.
- Placing is not done here. In a block, an empty slot or a photo's `replace photo` opens the
  existing picker as a sheet; choosing closes it and the block updates (one undo step).
- Upload progress and the processing state show in the drawer and as the topbar status;
  the delete refusal (FR-076) shows in the builder's single toast stack.

## 6. Removed on the phone

- The read-only preview at the bottom and the `CANVAS · phone 390 · same sections, same
  order` label.
- `src/ui/builder/PhoneMode.tsx`, `PhoneMedia`, the phone-only facts editors, and
  `tests/e2e/phone-mode.spec.ts` (replaced by the journey in §8).
- The system prompt's phone sentence ("the volunteer cannot edit blocks by hand, so make
  structural changes yourself") — no longer true. `surface: "phone"` stays in the protocol
  as a layout hint ("the volunteer is on a phone; keep replies short") — one sentence.
- CONTENT.md's `Phone mode (<768)` row is superseded by the rows this design adds; the
  phone-only media-card actions (`Enhance in the hero`, `Revert to original in the hero`)
  retire with `PhoneMedia`.
- Tests that go with the old mode: `tests/component/builder/PhoneMode.test.tsx` and
  `tests/component/helper/surface-switch.test.tsx` are replaced by the phone tests in §8.
- The spec's historical Clarifications entries that describe the old phone mode
  (spec.md "Manual block editing needs a tablet or laptop" and the "screens under 768 px"
  line) stay as a dated log; FR-091 itself is rewritten.
- `Composer.tsx`'s refocus comment (written for the old page-scrolling phone mode) is
  updated: the Full sheet is a fixed self-scrolling panel.

## 7. Spec and contract amendments

- **FR-091** (rewrite, dated): below 768 px the builder offers the same capabilities as the
  full builder, laid out in one column: Facts and Theme collapsed at the top, the blocks with
  their editors in place and up/down reordering, Add section as a sheet, Media and CATalyst as
  bottom drawers (full, peek and half states for CATalyst), Preview as a page. Nothing on the
  phone is read-only.
- **FR-042 / F34** apply on the phone (follow, blink, tags).
- **helper-protocol.md** → Endpoint: `surface: "phone"` is a layout hint only; the phone
  sentence in the system prompt is replaced.
- **CONTENT.md** → Builder: new rows for the bottom bar labels (`Media`, `CATalyst`), the
  collapsed Facts/Theme lines, the peek strings (reuse the receipt/proposal strings), the
  sheet headers.
- **TOKENS.json**: `layout.phone.peek: 48` (+ `pnpm gen-tokens`); both bars use
  `layout.builder.topbar`.
- **DESIGN.md**: a "Phone builder" paragraph (one column, two drawers, motion under
  reduced motion).

## 8. Tests

- Component: `BottomBar` (two tabs, disc states, `aria-expanded`/`controls`); `Sheet`
  (`modal` full: trap + Escape + return; `plain` half/peek: no trap, canvas reachable by
  Tab; swap); collapsed
  Facts/Theme (line text for named/unnamed cats; expand/collapse; fields work); `BlockFrame`
  at phone width (`↑` `↓` reorder dispatches, disabled ends, hero fixed); the CATalyst drawer's
  state machine (send → peek; card → half; Apply → peek; turn end → receipt line; tap →
  full); Media drawer (upload, select → card, close ways); the picker from a slot.
- e2e (`tests/e2e/phone-builder.spec.ts`, replaces `phone-mode.spec.ts`), at 390 × 844:
  sign in → new cat → Facts → upload two photos and a clip from the Media drawer → trim the
  clip → place the hero from the slot picker → ask CATalyst to build (fake `build-proposal`
  scenario) → the drawer peeks, blocks land and the canvas follows → "yes" → receipt →
  edit the bio by hand → move a section with `↓` → remove a section (the question sheet) →
  theme preset + AA line → Preview page → Publish; axe zero in every drawer state; every
  target ≥ 44 px; no horizontal scroll; the enhance compare sheet at 390; landscape
  (844 × 390) gets the same layout and is checked once.
- The desktop e2e journeys are unchanged; the shared components' tests are unchanged.

## 9. Files (indicative)

- New: `src/ui/builder/phone/{PhoneBuilder.tsx, BottomBar.tsx, Sheet.tsx, CollapsedGroup.tsx,
  use-sheet.ts}`; `tests/component/builder/phone/*`; `tests/e2e/phone-builder.spec.ts`.
- New shared: `src/ui/shared/dialog-focus.ts` (the Tab trap / focus return extracted from
  `Modal.tsx`, used by `Modal` and `Sheet`).
- Changed: `Builder.tsx` (surface split renders `PhoneBuilder` below 768 with the same
  `session`/`state`), `Topbar.tsx` (phone variant), `BlockFrame.tsx` + `BlockShell.tsx`
  (the phone label row replaces `Handles` and the hover-gated action row below 768),
  `Modal.tsx` (uses the extracted helpers), `src/app/layout.tsx` (viewport meta), the editors' one-column layouts (`BioEditor`, `GalleryEditor`,
  `DayEditor`, `NeedsEditor`, `VideoEditor` — Tailwind breakpoints only), `HelperPanel.tsx`
  (renders inside the sheet; the peek/half states driven by the reducer's turn state),
  `MediaLibrary.tsx` (renders inside the sheet), `src/core/helper/prompt.ts`, CONTENT.md,
  DESIGN.md, spec.md, helper-protocol.md.
- Deleted: `PhoneMode.tsx`, `PhoneMedia`, `tests/e2e/phone-mode.spec.ts`,
  `tests/component/builder/PhoneMode.test.tsx`, `tests/component/helper/surface-switch.test.tsx`.

## 10. Task split

- **Task 1 — the column and the chrome**: PhoneBuilder shell, top/bottom bars, collapsed
  Facts/Theme, BlockFrame ↑ ↓, editors at one column, Add section sheet, PhoneMode removed,
  FR-091/CONTENT/DESIGN amendments, component tests, the e2e journey without the drawers.
- **Task 2 — the drawers**: Sheet (full/half/peek, back gesture), CATalyst drawer state
  machine, Media drawer, picker-from-slot on the phone, prompt sentence, the full e2e
  journey, axe in every state.
- Each task: live browser check at 390 × 844 and 768 (the boundary), then an Opus fidelity
  review against this document and the design system.

## Out of scope

- Touch drag reordering; a "Settings" drawer; offline editing; landscape phone layouts
  (they get the same one-column layout).
