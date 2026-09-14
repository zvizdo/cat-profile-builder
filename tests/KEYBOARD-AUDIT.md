# Keyboard audit — Story 1 (T031)

Every interactive component in Story 1's scope, and the component test that proves its
keyboard path: reached by Tab, activated by Enter / Space, arrows where the control is a
slider, picker or menu, and Escape with focus returned for anything that opens over the
page. This is the list ADR-012 ("Keyboard-path component tests") and the constitution's
Quality Gates ask for, taken against `tests/component/**` on 2026-09-11 (refreshed after `d7c7121`).

A `(keyboard path)` suffix in a test title marks a test T031 added to close a gap; the
gaps and what was added are listed at the end. Each test is cited as `file:line` followed by its `it` title, so the row still finds its
test after lines move; the line is the `it(` line at commit `d7c7121`.

The Playwright journeys walk the same paths in the built app; the last column names the
one that does, where one exists (`tests/e2e/`).

## Sign-in and list

| Component | Keyboard path asserted | Test | Journey |
|---|---|---|---|
| Sign-in form (`SignInForm`) | Tab → Username, type, Tab → Password, type, Enter submits | `tests/component/sign-in.test.tsx:31` "submits from the keyboard alone: Tab, type, Tab, type, Enter" | `sign-in.spec.ts:25` (Enter submits) |
| Profile list — `+ new cat` tile | Tab reaches New cat → Sign out → tile; Enter creates once, never twice | `tests/component/builder/ProfileList.test.tsx:143` "the tile creates a draft and goes to it — from the keyboard, and ne…" | `list.spec.ts:19` |
| Profile list — card link and Delete | Tab → card link → Delete; Enter on Delete opens the question | `tests/component/builder/ProfileList.test.tsx:166` "Tab reaches a card's link, then its Delete, before the new-cat tile" (added) | — |
| Profile list — delete modal | Safe button focused on open; Escape keeps and returns focus to the opener | `tests/component/builder/ProfileList.test.tsx:202` "Delete asks first, naming the cat; Escape keeps it and returns focus" | `list.spec.ts:19` (Escape keeps) |
| Profile list — delete modal, confirm | Tab → Delete, Enter deletes; focus lands on New cat after | `tests/component/builder/ProfileList.test.tsx:220` "names an unnamed cat without a name and confirms from the keyboard" | — |

## Builder shell

| Component | Keyboard path asserted | Test | Journey |
|---|---|---|---|
| Topbar — Undo / Redo | Tab → All cats → Undo → Redo → Preview → Publish; Enter fires Undo, Space fires Redo; the inert one stays focusable | `tests/component/builder/Topbar.test.tsx:104` "Undo and Redo are reached by Tab and fire from Enter and Space" (added), `tests/component/builder/Topbar.test.tsx:89` "wires Undo and Redo; the one with nothing to do is aria-disabled, f…" | `builder.spec.ts:32` (⌘Z / ⌘⇧Z) |
| Builder — ⌘Z / ⌘⇧Z / Ctrl+Z / Ctrl+Y | Undo and redo from the keys; ignored while a question is open | `tests/component/builder/Builder.test.tsx:48` "adds a section from the rail and undoes it with ⌘Z, redoes with ⌘⇧Z", `tests/component/builder/Builder.test.tsx:71` "ignores ⌘Z while a question is open" | `builder.spec.ts:32`, `theme.spec.ts:22` |
| Canvas `+ add section` tile | Activation hands focus to the first rail tile on offer | `tests/component/builder/Builder.test.tsx:63` "the canvas's add tile hands focus to the first tile the rail can offer" | — |
| Canvas / BlockFrame — Move up / Move down | Enter on Move up reorders and focus stays on the button; the ends are `aria-disabled`, keep focus, change nothing | `tests/component/builder/Canvas.test.tsx:58` "Move up reorders through one reorder_blocks and keeps focus on the…", `tests/component/builder/Canvas.test.tsx:73` "Move down on the last frame and Move up on the first change nothing"; `BlockFrame.test.tsx:64` | `builder.spec.ts:32`, `build-and-publish.spec.ts` step 3 |
| BlockFrame — handle, Move up, Move down, duplicate, remove | Tab walks them in order; Enter and Space fire each | `tests/component/builder/BlockFrame.test.tsx:83` "Tab walks handle → Move up → Move down → duplicate → remove; Enter…" (added) | — |
| Canvas — keyboard drag (dnd-kit sensor) | Space picks up, ArrowUp moves, Space drops → one `reorder_blocks`; Space-Space changes nothing; Escape cancels; announcements in the shelter's voice | `tests/component/builder/Canvas.test.tsx:125` "a keyboard drag — space, arrow up, space — is one reorder_blocks wi…", `tests/component/builder/Canvas.test.tsx:141` "a keyboard drag dropped where it started changes nothing", `tests/component/builder/Canvas.test.tsx:183` "announces the drag in the shelter's voice" | — |
| Canvas — remove modal | Escape keeps the section; confirm removes | `tests/component/builder/Canvas.test.tsx:89` "remove asks first, naming what leaves; Escape keeps; confirming rem…" | `builder.spec.ts:32` |
| AddSectionTiles (Rail) | Tab reaches Hero → Bio → Photo… in order; Enter and Space add | `tests/component/builder/Rail.test.tsx:65` "the tiles are reached by Tab in order and add from Enter and Space" (added) | — |
| FactsFields | Enter commits the name at once; Tab out commits age; the select commits on choice | `tests/component/builder/FactsFields.test.tsx:51` "writes the name on Enter at once and the sex on choice" | `blocks.spec.ts:53` |

## Block editors (primary action)

| Component | Keyboard path asserted | Test | Journey |
|---|---|---|---|
| HeroEditor — pick / replace photo | Enter opens the picker, Enter chooses, Enter uses; focus returns to `replace photo` | `tests/component/builder/blocks/HeroEditor.test.tsx:31` "places a photo from the keyboard as one replace_image without a slot", `tests/component/builder/blocks/HeroEditor.test.tsx:49` "hands focus to the label row's replace photo when the slot's own pi…" | — |
| BioEditor — toolbar | Space on Bold / Italic marks the selection; Enter in the link field applies; focus returns to the editor | `tests/component/builder/blocks/BioEditor.test.tsx:75` "bolds and italicises the selection from the toolbar, by keyboard", `tests/component/builder/blocks/BioEditor.test.tsx:99` "links the selection to an http(s) address and refuses anything else…" | `blocks.spec.ts:53` |
| PhotoEditor — slot and caption | Keyboard pick fills the slot and focus moves to `replace photo`; Tab out commits the caption | `tests/component/builder/blocks/PhotoEditor.test.tsx:56` "moves focus to the slot's replace photo chip after a keyboard pick…", `tests/component/builder/blocks/PhotoEditor.test.tsx:24` "writes the caption once, after the typing pauses, and again when th…" | — |
| PhotoSlot (shared by photo, quote, day) | Enter opens, Enter chooses, Enter uses; Escape leaves the slot alone | `tests/component/builder/blocks/PhotoSlot.test.tsx:58` "picks a photo from the keyboard alone: Enter opens, Enter chooses,…", `tests/component/builder/blocks/PhotoSlot.test.tsx:81` "says when the library has no photo to pick, and Escape leaves the s…" | — |
| GalleryEditor — add / move / remove | Enter on `add photos` opens the picker; Enter on Move right reorders and keeps focus; Escape keeps a photo | `tests/component/builder/blocks/GalleryEditor.test.tsx:45` "adds several photos at once as one set_field with the whole list", `tests/component/builder/blocks/GalleryEditor.test.tsx:72` "moves a photo left or right as one set_field with the new order", `tests/component/builder/blocks/GalleryEditor.test.tsx:89` "asks before taking a photo off the page, in the core's words" | — |
| VideoEditor — pick a clip, re-trim | Enter on `Pick a clip` opens the picker; Enter on `re-trim` opens the trim editor | `tests/component/builder/blocks/VideoEditor.test.tsx:27` "is striped with `drop a clip` while empty and picks from the librar…", `tests/component/builder/blocks/VideoEditor.test.tsx:47` "reads the trim line from the record and opens the trim editor on re…" | — |
| DayEditor — scene pick and captions | Enter picks a photo into scene 2; caption commits after the pause | `tests/component/builder/blocks/DayEditor.test.tsx:30` "places a photo in scene 2 from the keyboard as replace_image slot 1", `tests/component/builder/blocks/DayEditor.test.tsx:44` "writes a caption to its scene's path, once the typing pauses" | — |
| NeedsEditor — add card | Enter on `add card` adds one and focuses its title; Tab moves to the text | `tests/component/builder/blocks/NeedsEditor.test.tsx:32` "shows one empty card with its caps and adds a second from the keyboard" | `blocks.spec.ts:53` |
| QuoteEditor — pick a photo, fields | Enter opens the picker, Space chooses, Enter uses; Enter commits the attribution | `tests/component/builder/blocks/QuoteEditor.test.tsx:23` "places its photo from the keyboard as one replace_image" (added), `tests/component/builder/blocks/QuoteEditor.test.tsx:38` "writes the line and the attribution to their paths and shows them o…" | — |

## Media

| Component | Keyboard path asserted | Test | Journey |
|---|---|---|---|
| MediaLibrary — tile | Tab reaches the tile; Enter opens, Enter closes; Delete asks, Escape keeps (safe button focused); focus moves to the add tile after a removal | `tests/component/builder/MediaLibrary.test.tsx:90` "opens on Enter: the description and Remove appear, and Enter again…", `tests/component/builder/MediaLibrary.test.tsx:217` "Delete on a tile asks first, naming the file; Escape keeps it", `tests/component/builder/MediaLibrary.test.tsx:233` "removes the tile once deleteMedia answers ok and moves focus to the…" | `media.spec.ts:15` |
| MediaLibrary — Focal point / Trim buttons | From an open tile: Tab → Description → Focal point (Enter opens the sheet); Tab → Trim (Enter opens the modal) | `tests/component/builder/MediaLibrary.editors.test.tsx:75` "Focal point and Trim are reached by Tab from an open tile and open…" (added) | — |
| AltTextField | Enter saves without a newline; Shift+Enter adds a line; Tab out saves a change; focused and empty after a failed describe | `tests/component/builder/AltTextField.test.tsx:53` "saves on Enter without adding a line; Shift+Enter adds one and save…", `tests/component/builder/AltTextField.test.tsx:40` "saves on blur when the text changed, and not when it did not", `tests/component/builder/AltTextField.test.tsx:88` "asks for a sentence, empty and focused, when the describer failed (…" | `media.spec.ts:15` |
| FocalPicker | Arrows nudge 1 %, Shift 10 %, clamped; Enter / Space never land the point; Tab → Reset → Cancel → Save, Enter saves; Escape closes | `tests/component/builder/FocalPicker.test.tsx:53` "nudges 1 % per arrow and 10 % with Shift, clamped to the edges", `tests/component/builder/FocalPicker.test.tsx:78` "does nothing on Enter or Space, so the keyboard never lands the poi…", `tests/component/builder/FocalPicker.test.tsx:106` "Tab walks picker → Reset → Cancel → Save, and Enter on Save sends t…" (added), `tests/component/builder/FocalPicker.test.tsx:131` "closes without saving on Cancel and on Escape" | `media-editors.spec.ts:34` |
| TrimEditor | Arrows move a handle 0.1 s, Shift 1 s; Tab from End → Cancel → Use this stretch, Enter sends; Escape closes without sending | `tests/component/builder/TrimEditor.test.tsx:157` "moves a handle 0.1 s per arrow and 1 s with Shift", `tests/component/builder/TrimEditor.test.tsx:169` "Tab leaves the End handle for the buttons, and Enter on Use this st…" (added), `tests/component/builder/TrimEditor.test.tsx:184` "sends the stretch once and closes at once; Cancel and Escape close…" | `media-editors.spec.ts:85` |
| UploadButton (the add tile) | Focusable striped button, fires on Enter and Space (shared `StripedPlaceholder`); the picker opens from it | `tests/component/shared/StripedPlaceholder.test.tsx:15` "as a button it is focusable and fires on Enter and Space"; `MediaLibrary.upload.test.tsx:52` | — |

## Theme and publishing

| Component | Keyboard path asserted | Test | Journey |
|---|---|---|---|
| ThemePicker — swatches | Tab reaches Paper → Card → Night → Sand; Enter and Space pick; Tab continues to the warmth slider | `tests/component/builder/ThemePicker.test.tsx:46` "the swatches are reached by Tab in order and pick from Enter and Space" (added) | `theme.spec.ts:22` |
| ThemePicker — sliders | Arrows step 0.01 (one `set_theme` on key up), PageUp/Down 0.1, Home/End | `tests/component/builder/ThemePicker.test.tsx:85` "an arrow key moves a slider by 0.01 and records one set_theme on ke…", `tests/component/builder/ThemePicker.test.tsx:103` "PageUp and PageDown move by 0.1, Home and End go to the ends, all w…" | `theme.spec.ts:22`, `build-and-publish.spec.ts` step 4 |
| ThemePicker — Restore to passing | Tab reaches it after the sliders; Enter restores 0.5 / 0.5 | `tests/component/builder/ThemePicker.test.tsx:199` "Restore to passing is reached by Tab after the sliders and fires fr…" (added) | `theme.spec.ts:22` |
| PublishButton / ReadinessList | Enter on Publish; a refusal focuses the first gap; Tab reaches each problem button, Enter reveals its gap; Space on Dismiss closes | `tests/component/builder/PublishButton.test.tsx:104` "a problem's button is reached by Tab and Enter reveals its gap; Dis…" (added), `tests/component/builder/PublishButton.test.tsx:71` "lists what is missing as a lead and buttons, and scrolls to and foc…", `tests/component/builder/PublishButton.test.tsx:133` "focuses the editor's own control, never the drag handle: the photo…" | `build-and-publish.spec.ts` step 6 |
| PublishMenu | Enter on the trigger opens with the first item focused; ArrowDown / ArrowUp / Home / End move; Enter runs an item (Republish publishes); Escape and Tab close and return focus | `tests/component/builder/PublishButton.test.tsx:287` "offers the page, republish, unpublish and archive for a live cat, b…", `tests/component/builder/PublishButton.test.tsx:322` "opens from Enter on the trigger and Enter on an item runs it — Repu…" (added) | `build-and-publish.spec.ts` step 8 |
| Contrast question (modal) | Escape publishes nothing; the danger button runs from the keyboard (shared Modal) | `tests/component/builder/PublishButton.test.tsx:252` "Publish anyway publishes over the warning; Not now and Escape publi…"; `shared/Modal.test.tsx:112` | `build-and-publish.spec.ts` step 6 |
| RestorePrompt | Restore focused on open; Escape restores; Tab → Discard, Enter discards | `tests/component/builder/RestorePrompt.test.tsx:82` "Restore is the safe action: Escape restores", `tests/component/builder/RestorePrompt.test.tsx:149` "Tab moves from Restore to Discard, and Enter fires it" (added) | `offline.spec.ts:30` |
| OfflineNotice | No control by design (a status with no close button); renders the shared Toast | `tests/component/builder/OfflineNotice.test.tsx:193` "is CONTENT.md's sentence as a status that renders nothing while online" | `offline.spec.ts:30` |

## Phone mode

| Component | Keyboard path asserted | Test | Journey |
|---|---|---|---|
| PhoneMode — fields | Tab walks name → age → sex → tagline; Enter commits each | `tests/component/builder/PhoneMode.test.tsx:121` "the keyboard walks name → age → sex → tagline, and each commit is o…" | `phone-mode.spec.ts:44` |
| PhoneMode — publish panel | Tab from View page → Republish → Unpublish; Enter opens the question with its safe button focused; Escape returns focus | `tests/component/builder/PhoneMode.test.tsx:227` "the publish panel's buttons are reached by Tab from its link and fi…" (added) | — |
| PhoneMode — readiness | A refusal focuses the name field | `tests/component/builder/PhoneMode.test.tsx:162` "a refused publish lists the problems; a missing section scrolls to…" | — |
| PhoneMode — focal point and trim | The same FocalPicker and TrimEditor; see Media | — | `phone-mode.spec.ts:44` |

## Shared

| Component | Keyboard path asserted | Test | Journey |
|---|---|---|---|
| Modal | Safe button focused on open; Tab / Shift+Tab stay inside; Escape runs the safe action and returns focus to the opener, also after a scrim click; the danger button runs from the keyboard | `tests/component/shared/Modal.test.tsx:53` "is a labelled modal dialog whose safe button takes focus on open"–`tests/component/shared/Modal.test.tsx:112` "the danger button runs its action from the keyboard and is clay, ne…" | `kit.spec.ts:67` |
| Toast | Tab reaches the action then Dismiss; Enter and Space fire them | `tests/component/shared/Toast.test.tsx:41` "the action and the dismiss button both work from the keyboard" | — |
| IconButton | Named by its label; fires from Enter and Space | `tests/component/shared/IconButton.test.tsx:15` "fires from Enter and Space" | — |
| Button | Tab reaches it; a disabled one is skipped and inert | `tests/component/shared/Button.test.tsx:20` "a disabled button is skipped by Tab and does not fire" | `kit.spec.ts:7` (Tab order over the whole sheet) |
| StripedPlaceholder (as a button) | Focusable; fires on Enter and Space | `tests/component/shared/StripedPlaceholder.test.tsx:15` "as a button it is focusable and fires on Enter and Space" | — |

## Public page

| Component | Keyboard path asserted | Test | Journey |
|---|---|---|---|
| Video — Pause / Play | Tab reaches it; Enter pauses, Space plays; focus stays on the toggled button | `tests/component/profile/Video.test.tsx:66` "the pause control is reached by Tab and toggles from Enter and Space" (added) | `build-and-publish.spec.ts` step 14, `preview.spec.ts:17` |
| Nav — way back and section links | Tab reaches the logo link, then each section link in order | `tests/component/profile/ProfilePage.test.tsx:117` "Tab reaches the way back, then every section link in order" (added) | — |

## Gaps found and closed by T031

Before this audit the following had no keyboard assertion (the component was only
clicked, or only rendered). Each now has one, in the file named above:

1. Topbar Undo / Redo — Tab reach and Enter / Space activation (`Topbar.test.tsx:104`).
2. AddSectionTiles — Tab order and Enter / Space activation (`Rail.test.tsx:65`).
3. BlockFrame — Tab order over handle, Move up, Move down, duplicate, remove and Enter /
   Space on each (`BlockFrame.test.tsx:83`); before, only `.click()` was used.
4. ThemePicker swatches — Tab reach and Enter / Space pick (`ThemePicker.test.tsx:46`).
5. ThemePicker Restore to passing — Tab reach and Enter (`ThemePicker.test.tsx:199`).
6. FocalPicker Save — Tab from the picker through Reset and Cancel, Enter saves
   (`FocalPicker.test.tsx:106`).
7. TrimEditor Use this stretch — Tab from the End handle, Enter sends
   (`TrimEditor.test.tsx:169`).
8. PublishMenu — opened by Enter and an item run by Enter (`PublishButton.test.tsx:322`);
   before, arrows and Escape were asserted but the trigger and items were clicked.
9. ReadinessList — Tab to a problem button, Enter reveals the gap, Space on Dismiss
   (`PublishButton.test.tsx:104`).
10. RestorePrompt Discard — Tab and Enter (`RestorePrompt.test.tsx:149`).
11. QuoteEditor pick — Enter / Space through the picker (`QuoteEditor.test.tsx:23`).
12. MediaLibrary Focal point / Trim buttons — Tab from an open tile, Enter opens
    (`MediaLibrary.editors.test.tsx:75`).
13. PhoneMode publish panel — Tab order and Enter on Unpublish, Escape returns focus
    (`PhoneMode.test.tsx:227`).
14. Profile list card — Tab reaches the card's link then its Delete
    (`ProfileList.test.tsx:166`).
15. Public Video Pause — Tab reach, Enter / Space toggle (`Video.test.tsx:66`).
16. Public Nav — Tab order over the way back and the section links
    (`ProfilePage.test.tsx:117`).

## Stories 3–5 (T049 audit, 2026-09-12)

The components that landed after T031, audited the same way against `tests/component/**`
at commit `16dfbf0`; the `it(` line is at that commit plus the four tests T049 added.

| Component | Keyboard path asserted | Test | Journey |
|---|---|---|---|
| ProposalCard — Apply / Not this | Tab reaches Apply, then Not this; Enter fires Apply once (a second Enter is swallowed, as the double click is); Space fires Not this; Escape declines from anywhere in the card | `tests/component/helper/ProposalCard.test.tsx:93` "keyboard: Tab reaches Apply, then Not this", `:111` "Apply fires from Enter and Not this from Space, once each (keyboard path)" (added), `:102` "Escape declines, from anywhere in the card" | `helper.spec.ts` |
| Helper Composer | Enter sends and clears; Shift+Enter is a new line; disabled while working | `tests/component/helper/Composer.test.tsx:10`, `:20` | `helper.spec.ts` |
| Helper Chips | Buttons that send their label; 44 px targets | `tests/component/helper/Chips.test.tsx:11`, `:33` | — |
| Carousel controls — Tab order | Tab: frame link → Previous → Pause → Next → Open; Enter on Pause turns it into Resume and keeps focus; the group sits outside the frame link | `tests/component/carousel/Carousel.test.tsx:227` "the controls are reached by Tab in order and sit outside the frame link (keyboard path)" | `carousel.spec.ts` |
| Carousel controls — Previous / Next | Enter and Space on the focused Next move one cat and keep focus; Space on a control is the control's own activation, not the page's pause toggle; Shift+Tab back over Resume reaches Previous, Enter moves back | `tests/component/carousel/Carousel.test.tsx:248` "Next fires from Enter and Space, Previous from Enter; Space on a control is not the page's pause (keyboard path)" (added) | `carousel.spec.ts` |
| Carousel — page-level keys | Space toggles pause from anywhere; ArrowRight / ArrowLeft move and pause; under reduced motion arrows still page and no Pause is offered | `tests/component/carousel/Carousel.test.tsx:177`, `:192`, `:250` | `carousel.spec.ts` (with `reducedMotion: "reduce"` too) |
| KioskControls — strip | Faded strip stays in the DOM and the Tab order; Tab lands on Previous (no frame link) and shows the strip; Enter on Pause → Resume with focus kept; Tab walks Next → Open; Tab out fades it; arrows and Space work while faded | `tests/component/carousel/KioskShell.test.tsx:157` "come back while one of them has focus, and fade once focus leaves the strip (keyboard path)", `:142` "stay in the DOM while faded, and the keyboard still works: arrows page, Space pauses" | `kiosk.spec.ts` |
| EnhanceCompare — CompareToggle | Shift+Tab from Keep original reaches the divider then the toggle; ArrowRight / ArrowLeft move and check; Space and Enter check the focused option; only the checked option is in the Tab order | `tests/component/builder/EnhanceCompare.test.tsx:85` "toggles between the two from the keyboard: arrows move and check, Space and Enter check" | `enhance.spec.ts` |
| EnhanceCompare — Use enhanced / Keep original | Keep original (the safe action) takes focus on open and answers from Space; Tab reaches Use enhanced, Enter dispatches exactly one `replace_image` and closes; Escape closes with nothing dispatched | `tests/component/builder/EnhanceCompare.test.tsx:164` "Keep original takes focus on open and answers from Space; Tab reaches Use enhanced, which answers from Enter (keyboard path)" (added), `:182` "Keep original and Escape close without dispatching anything" | `enhance.spec.ts` |
| PhoneMode — helper drive | On the phone tree: Enter in the composer sends and clears it; the model's card is reached by Tab (Apply, then Not this) and Enter on Apply applies the edit — the bio leaves the preview and Undo these is offered | `tests/component/helper/surface-switch.test.tsx:197` "Enter sends from the composer; Tab reaches the card's Apply, and Enter applies it" (added) | `phone-mode.spec.ts`, `helper.spec.ts` |
| PhoneMode — fields, publish panel, media | Unchanged since T031; see the Phone mode rows above | — | `phone-mode.spec.ts` |

### Gaps found and closed by T049

1. ProposalCard — Apply and Not this were only ever clicked; Enter / Space activation
   (`ProposalCard.test.tsx:111`).
2. Carousel Previous / Next — reached by Tab but only clicked; Enter / Space activation
   and the "Space on a control is not the pause toggle" rule (`Carousel.test.tsx:248`).
3. EnhanceCompare Use enhanced / Keep original — only clicked; Space and Enter, and the
   safe action focused on open (`EnhanceCompare.test.tsx:164`).
4. PhoneMode helper drive — the phone surface's card was only clicked; a keyboard-only
   send → Tab → Enter drive (`surface-switch.test.tsx:197`).

Each of the four was seen to fail with its wiring removed from `src` (`onClick` dropped on
the button under test) and to pass with it restored; `src` is unchanged by the audit.

### Noted, not a gap

- Sending from the helper composer disables it for the turn (the helper is working), so
  focus drops to the body and the next Tab starts from the top of the page — on the phone
  that is All cats → Publish → the media tile → the card. Everything stays reachable and
  the card is four Tabs away; keeping focus inside the panel across the send would be a
  refinement in `src`.

## Noted, not a gap

- The theme swatches are a `radiogroup` of `role="radio"` buttons that are each in the
  Tab order and pick on Enter / Space; they do not implement the ARIA radio arrow-key
  pattern (a single Tab stop with arrows moving the choice). Every swatch is reachable and
  operable, and axe passes; the arrow pattern would be a refinement in `src`.

## Phone builder, helper panel, media rail and the sheets (T049 part 2, 2026-09-13)

The components that landed after the 2026-09-12 pass: the phone builder (F44/F45/F55),
the helper panel redesign (F25–F27), the media rail and drawer (F38/F39/F45), the slot
picker sheet, the `Add a section` sheet, `GalleryCellTouch` (F55) and the carousel/kiosk
controls (re-cited at their current lines). Lines are the `it(` line at the T049 part 2
commit. `PhoneMode` and `surface-switch.test.tsx` no longer exist (F44 deleted the
read-only phone mode; the F11 resize case lives in `catalyst-drawer.test.tsx`), so the
"PhoneMode" rows above are history, superseded by the phone rows here.

| Component | Keyboard path asserted | Test | Journey |
|---|---|---|---|
| `PhoneBuilder` — bottom bar tabs and sheets | Media and CATalyst tabs open their sheets; Escape closes a sheet and returns focus to the tab that opened it; the peek's Full hands focus back to the peek | `tests/component/builder/phone/PhoneBuilder.test.tsx:236` "the bottom bar's tabs open the Media and CATalyst sheets, swap, and close with Escape back to the tab", `:271` "a bio chip sends into the peek; Full opened from the peek hands focus back to it" | `phone-builder.spec.ts`, `phone-sheets.spec.ts` |
| `BottomBar` | Tab reaches Media, then CATalyst; Enter and Space open each | `tests/component/builder/phone/BottomBar.test.tsx:59` "Tab reaches Media then CATalyst; Enter and Space open them (keyboard path)" (added) | `phone-builder.spec.ts` |
| `Sheet` (Full) | Tab is trapped inside; Escape and Close close it; focus returns to the opener (or the recorded one, or the stand-in) | `tests/component/builder/phone/Sheet.test.tsx:65` "traps Tab inside, closes on Escape and on Close, and hands focus back to the opener", `:85`, `:104` | `phone-sheets.spec.ts` |
| `Sheet` (Half) | A region, not a dialog: Tab walks out to the canvas and the bar; closes from Close, not Escape | `tests/component/builder/phone/Sheet.test.tsx:148` "is a region, not a dialog: no modal, no trap, and Tab walks out to the canvas and the bar", `:169` | `phone-sheets.spec.ts` |
| `PeekBar` | Shift+Tab from the bar reaches Hide CATalyst then the line; Enter on the line opens Full and Escape returns to it; Space on the chevron hides the peek and focus lands on the CATalyst tab | `tests/component/builder/phone/catalyst-drawer.test.tsx:342` "the peek's two controls sit before the bar in the Tab order; Enter opens Full, Space on the chevron hides it (keyboard path)" (added) | `phone-sheets.spec.ts` |
| `PhoneDrawers` — CATalyst (Full / Half / Peek) | The card in Half is answered from the keyboard the same way as on the desktop (`ProposalCard` rows); Escape on Full is Peek | `tests/component/builder/phone/catalyst-drawer.test.tsx:201`, `:233`, `:281` (the F11 resize case) | `phone-sheets.spec.ts`, `helper-follow.spec.ts` |
| `PhoneDrawers` — Media drawer | Enter on a tile opens the card; Tab walks Description → Focal point → Enhance…; Enter on Enhance… opens the compare with Keep original focused; Escape closes the card first, then the sheet | `tests/component/builder/phone/media-drawer.test.tsx:186` "Enter on a tile opens the card; Tab reaches Enhance… after Focal point and Enter opens the compare, whose Keep original takes focus (keyboard path)" (added), `:103`, `:157` | `phone-sheets.spec.ts`, `media-editors.spec.ts` |
| `CollapsedGroup` (Facts, Theme) | Enter on the head toggles the group; the head is a 44 px button | `tests/component/builder/phone/CollapsedGroup.test.tsx:54` "starts open when told to, and Enter on the head toggles it (keyboard path)" | `phone-builder.spec.ts` |
| `PhoneLabelRow` (↑ ↓ duplicate remove) | The four come after the editor's own controls with no handle; Tab walks ↑ → ↓ → duplicate → remove; Enter and Space fire each; the ends are `aria-disabled` and keep focus | `tests/component/builder/phone/PhoneLabelRow.test.tsx:100` "Tab walks the body's last control → ↑ → ↓ → duplicate → remove; Enter and Space fire each (keyboard path)" (added), `:123` | `phone-builder.spec.ts` |
| `PhoneActions` (the editor's actions in the body) | Visible 44 px buttons in the body's Tab order — the same handlers as the desktop action row (`BlockFrame.test.tsx:89`) | `tests/component/builder/phone/PhoneLabelRow.test.tsx:137` "keeps the editor's own actions in the body as visible 44px buttons, not the desktop's mono links" | `phone-builder.spec.ts` |
| `GalleryCellTouch` (F55) | At 390 px Tab walks Move left → Move right → enhance → Remove photo; Enter moves the photo and focus follows it; Space on Remove photo asks first; Escape keeps it | `tests/component/builder/blocks/touch-slots.test.tsx:83` "at 390px Tab walks Move left → Move right → enhance → Remove photo; Enter moves and keeps focus, Space asks before removing (keyboard path)" (added) | `phone-builder.spec.ts` |
| Slot picker sheet (`MediaPicker` in a `Sheet`, F45/F55) | Enter on Add a photo opens the sheet with Cancel focused; Use photo is disabled until a choice; Tab and Enter choose; Tab reaches Use photo and Enter fills the slot; Escape leaves the slot as it was and returns focus | `tests/component/builder/phone/slot-picker.test.tsx:100` "on the phone the sheet fills the slot from the keyboard alone: Enter opens, Tab and Enter choose, Tab and Enter use (keyboard path)" (added), `:84`; desktop modal `tests/component/builder/blocks/PhotoSlot.test.tsx:91` | `phone-builder.spec.ts` |
| `Add a section` sheet (`SectionPicker` under 768 px) | Enter on the tile opens it with Cancel focused and pinned; Tab and the arrow keys walk the seven options; Enter adds one block and focuses it; Escape returns focus to the tile | `tests/component/builder/SectionPicker.test.tsx:132` "under 768px is a bottom sheet with Cancel pinned", `:44`, `:62`, `:88`, `:98` | `phone-sheets.spec.ts`, `blocks.spec.ts` |
| `PanelHeader` + `CollapsedTab` (helper collapse) | Shift+Tab from the composer reaches the log then the collapse toggle; Enter collapses and focus follows to the tab; Tab reaches the tab and Enter opens; Escape at 1024 closes back to the tab | `tests/component/helper/CollapsedTab.test.tsx:151` "keyboard path: focus follows the press to the tab; Tab reaches it and Enter opens", `tests/component/helper/HelperPanel.test.tsx:269` | `helper.spec.ts` |
| Helper `Composer` | Enter sends and clears; Shift+Enter is a new line; disabled while working; takes focus back when the turn ends | `tests/component/helper/Composer.test.tsx:10`, `:20`, `:47` | `helper.spec.ts` |
| Helper `MessageList` | A named, focusable, polite log in the Tab order | `tests/component/helper/MessageList.test.tsx:120` | `helper.spec.ts` |
| Helper `Chips` | Buttons that send their label; out of the Tab order while disabled; 44 px in the sheet | `tests/component/helper/Chips.test.tsx:11`, `:33`, `:66` | `helper.spec.ts` |
| `ProposalCard` | Tab → Apply → Not this; Enter applies once; Space declines; Escape declines from anywhere | `tests/component/helper/ProposalCard.test.tsx:146`, `:164`, `:155` | `helper.spec.ts` |
| Media rail (`MediaLibrary`, `MediaTile`, `MediaCard`) | Tab to a tile, Enter opens the card and Enter again closes it; Tab walks Description → Focal point / Trim → Remove → Close; Enter on Focal point / Trim opens the editor; Delete on a tile asks first; Escape leaves the field, then the card, focus back on the tile | `tests/component/builder/MediaLibrary.test.tsx:107`, `:261`, `:279`, `:370`; `tests/component/builder/MediaLibrary.editors.test.tsx:77` "Focal point and Trim are reached by Tab from an open tile and open from Enter (keyboard path)" | `media.spec.ts`, `media-editors.spec.ts` |
| `FocalPicker` sheet | Arrows nudge 1 % (Shift 10 %); Tab walks picker → Reset → Cancel → Save; Enter on Save sends; Escape cancels | `tests/component/builder/FocalPicker.test.tsx:86`, `:139`, `:164` | `focal.spec.ts` |
| `TrimEditor` | Arrows move a handle 0.1 s (Shift 1 s); Tab leaves the End handle for the buttons; Enter on Use this stretch sends; Escape cancels | `tests/component/builder/TrimEditor.test.tsx:194`, `:206`, `:221` | `media-editors.spec.ts` |
| `EnhanceCompare` + `CompareToggle` | Unchanged since the 2026-09-12 pass | `tests/component/builder/EnhanceCompare.test.tsx:85`, `:164`, `:182` | `enhance.spec.ts` |
| `Carousel` controls | Unchanged since the 2026-09-12 pass (lines moved) | `tests/component/carousel/Carousel.test.tsx:237`, `:258`, `:187`, `:202`, `:282` | `carousel.spec.ts` |
| `KioskControls` | Unchanged since the 2026-09-12 pass | `tests/component/carousel/KioskShell.test.tsx:157`, `:142` | `kiosk.spec.ts` |

### Gaps found and closed by T049 part 2

1. `BottomBar` — the two tabs were only clicked (`BottomBar.test.tsx:59`).
2. `PhoneLabelRow` — ↑ ↓ duplicate remove were only clicked; the desktop row's proof is
   a different component (`PhoneLabelRow.test.tsx:100`).
3. `GalleryCellTouch` — the touch row was only clicked; the desktop cell's keyboard proof
   is a different component (`touch-slots.test.tsx:83`).
4. `PeekBar` — open CATalyst and Hide CATalyst were only clicked (`catalyst-drawer.test.tsx:342`).
5. Slot picker sheet — the phone's `Add a photo` face and the sheet variant were only
   clicked (`slot-picker.test.tsx:100`).
6. Media drawer `Enhance…` — reached by Tab nowhere; only clicked (`media-drawer.test.tsx:186`).

Each of the six was seen to fail with its wiring removed from `src` (the `onClick` under
test dropped: `BottomBar.tsx`, `PeekBar.tsx` Hide, `GalleryCellTouch.tsx` Move right,
`PhoneLabelRow.tsx` duplicate, `MediaPicker.tsx` Use photo, `MediaCard.tsx` the action
row — 21 failures across the six files with the cascades) and to pass with it restored
from git; `src` is unchanged by the audit.

### Noted, not a gap

- The slot picker's Use photo is `disabled` until a photo is chosen, so it is out of the
  Tab order at first and the sheet's trap wraps from Cancel to the first photo. Reachable
  once it matters; `aria-disabled` with a reason would be a refinement in `src`.
- On the phone the label row sits under the editor body, so a block's ↑ ↓ come after its
  own controls (Bold, rewrite, …) in the Tab order — by design (F44 §2), and the row is
  always visible, so there is nothing to reveal first.
