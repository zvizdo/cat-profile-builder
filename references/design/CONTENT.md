# Content inventory

Every string in the designs, in one place. Voice rules: plain, specific, never cute. Say what happened and what to do. No emoji. Sentence case except mono labels, which are uppercase with `.2em` tracking. A notice never blames the volunteer and never explains twice.

Strings marked **[new]** don't appear in the design files — they're the same voice applied to states a developer will hit and shouldn't have to invent. Change them freely; keep the register.

---

## Sign in / set-up

| Where | String |
|---|---|
| Tab | `Sign in` · `First time here` |
| Sign-in title | `Sign in` |
| Sign-in sub | `One shared account for everyone who writes cat profiles. Ask a coordinator if you don't have it.` |
| Set-up title | `Set up the shelter account` |
| Set-up sub | `Do this once for the whole shelter. Every volunteer then uses the same username and password.` |
| Fields | `Invite code from your coordinator` · `Username` · `Password` / `Choose a password` |
| Password hint | `Ten characters or more. Write it on the whiteboard — everyone uses this one.` |
| Primary | `Continue` / `Create the account` |
| Aside | `Forgotten the password?` / `We already have an account` |
| Session | `Stays signed in for 30 days` |
| Error | `That username and password don't match.` |
| After 3 failures **[new]** | `Still not working? Call the coordinator on 401-555-0134 — we'd rather reset it than lock you out.` |
| Photo panel | `Seven cats are waiting on a page.` (count is live) |

## Profile list

| Where | String |
|---|---|
| Title / count | `Cats` · `12 · 7 published` · filtered: `7 published` / `5 in progress` |
| Filters | `All 12` · `Live 7` · `Drafts 5` |
| Search | `Search by name` |
| Sort | `Sorted by last edited` |
| Actions | `New cat` · `Sign out` |
| Badges | `LIVE` · `DRAFT` |
| Card meta | `edited 4d` |
| New tile | `+ new cat` — `Starts with a name and one photo. Everything else can wait.` |
| Empty shelter | `No cats listed yet. Start with the one who needs a home soonest.` |
| No search results **[new]** | `No cat by that name. Check the drafts filter — it might not be published yet.` |

## Builder

| Where | String |
|---|---|
| Chrome | `All cats /` · `cat name` · `Draft saved 2s ago` · `Preview` · `Publish` |
| Rail | `Add section` · `Bio` `Photo` `Gallery` `Video` `Facts` · `Theme` · `warmth` `contrast` · `Media · 7 items` (no `Hero` tile — Checkpoint 2, F1: every profile already has one, mandatory and fixed at the top) |
| Contrast note | `contrast check: passes AA` · `passes AA · light labels swap in` · `passes AA at 0.62 warmth` |
| Canvas | `CANVAS · vertical stack, full-width sections only` · `desktop` `phone` (from 768 px; under it the phone builder has no canvas label — see Phone builder) |
| Block labels | `HERO · full-bleed photo + name` · `BIO · paragraphs, bold, italic, links` · `VIDEO · one clip, trimmed` · `trim 0:04 – 0:12 of 2:07 · muted autoplay + loop` · `GALLERY · 3 of up to 12` · `CATalyst · just now` — beside the label of every block the helper's latest turn touched, with the 6px blue dot, until the volunteer's next edit (F34) |
| Block actions | hero: `replace photo` · `focal point` (both once a photo is placed — `focal point` opens the focal point sheet for it, F39; while the slot is empty its own `Pick a photo` / `Add a photo` is the one way in, **[F55, 2026-09-13]**) · `enhance` — no `duplicate`, no `remove` (Checkpoint 2, F1: mandatory, fixed at the top) · bio: `rewrite` `shorten` `duplicate` `remove` · video: `replace clip` `re-trim` `remove` (no `cover frame` action — the cover frame is the trim's start, chosen in the trim editor; the stale word dropped **[F55, 2026-09-13]**) · gallery: `add photos` `reorder` `duplicate` `remove` — same words at every width; only the control changes (below) |
| Block actions on touch widths **[F47]** | ≥1180 (`wide`): hover-revealed text, unchanged. 768–1179 (`TOKENS.json` `breakpoints.tablet`; F28 review #6; comp 7c "iPad 1024×768 · touch-first"): the same words as always-visible pills — a finger has no hover to reveal them with. Below 768: the phone builder's own icon row (F44), untouched here. |
| Gallery tile controls on touch **[F55, 2026-09-13; amended F61, 2026-09-13]** | Under 1180 px each gallery photo's `Move left` · `Move right` · `enhance` (or `revert to original`) · `Remove photo` are the same 44 px pills the hero's row draws — the two moves and `Remove photo` as icon pills, `Remove photo` in clay on its own un-themed chip (F12) — on two fixed rows: the moves, then the enhance-or-revert pill and `Remove photo`. The grid is two-up under 1180 px (not only under 768). **F61**: the row used to be `flex-wrap`, and `revert to original` (139.2 px) was wide enough to wrap one tile to a third line while its row neighbour's `enhance` (87.8 px) stayed at two, so the two columns' pill rows ended up 52 px apart — fixed by two rows that can never grow a third, and by the pill's visible word for `revert` shortening to `revert` (its accessible name stays `revert to original`) so the tile never needs to ellipsize the verb either. From 1180 px the pointer's row (ghost chevrons, the white `Remove` square, `enhance`/`revert to original` beneath) is unchanged. |
| Canvas placeholders | `+ add section` · `drop a photo` · `drop here` — from 1180 px. On touch (under 1180) an empty slot never says drop: **[F55, 2026-09-13]** `Add a photo` / `Add a clip` is the slot's mono label and the whole striped face is the button that opens the picker (named `Add a photo`, or `Add a photo for scene 2` where a section has several; the picker sheet itself stays `Pick a photo` · `Cancel` · `Use photo`). The gallery keeps one `Add a photo` cell after its photos on touch, not that and a second striped spare — `add photos` on the row is the way to add several. `photo missing — pick another` and its `Pick a photo` button are the same at every width. |
| Media card header **[new]** | the file name, middle-truncated, case as written: `PXL_20260622…724.jpg` · clip: the length first, `0:10 · PXL_2…557.mp4` (F38) |
| Media card close **[new]** | `Close` (the button's name; the `×` icon) (F38) |
| Media card, on the page **[new]** | `On the page · hero` · `On the page · gallery, slot 2 · day, scene 2` (every slot holding it, in page order) · `Not on the page yet` (F39; FR-013) |
| Media card actions | `Focal point` · `Trim` / `Re-trim` · `Remove` (named `Remove {file}`) — ghost buttons, `Remove` in clay. (The phone-only `Enhance in the hero` / `Revert to original in the hero` retired with the old phone mode, F44: the phone has the frames' own `enhance` / `revert to original` now.) In the phone's Media drawer **[F45]** a placed photo's card adds `Enhance…` (`Processing…` while the server works; `Revert to original` on an enhanced copy) between the editor and `Remove`: the compare opens over the drawer and `Use enhanced` is one swap on the photo's first placement. A photo not on the page offers none — there is no slot for the copy to go to. |
| Remove refusal (server, FR-076) | `Marlow's live page uses this photo. Unpublish first.` — in the one toast stack |
| Focal point | `Where should the crop hold on?` — `Click her face. Every crop on the site, the phone and the carousel is derived from this one point.` · `Reset to centre` · `Arrow keys nudge by 1%, shift by 10%` · `Save focal point` · `Derived crops · live` — the hero crop carries the cat's name, as the hero does (F39); `her` follows the cat's recorded sex, the same as everywhere else on this page (F41) |
| Focal point on a phone **[new]** | `Tap her face.` replaces `Click her face.` under 768 px; the rest of the sentence unchanged. The arrow-key hint is left out; `Save focal point` stays in reach in a footer that does not scroll away (F39) |
| Phone builder (<768) **[F44]** | Below 768 px the builder is the same builder in one column (FR-091, rewritten 2026-09-13; supersedes the `Phone mode (<768)` row and, before it, `Read-only (<1024)`). Top bar: the cat's name · `Undo` `Redo` · `Preview` (an icon; opens the preview page) · `Publish` / `● Live` / `● Archived` — the dot with one short word (**[F55, 2026-09-13]** amends F44's dot-only button, which a first-timer could not read; `Live` is the list's own word; the menu is named the same; measured at 390: `Charlotte` shows whole beside `Undo` `Redo` `Preview` `● Archived`, a longer name truncates with an ellipsis, never the controls). Bottom bar: `Media` · `CATalyst` — two tabs, each an icon over its name. |
| Phone collapsed facts **[F44]** | `Facts` · `Vini · 2 years · male` — or `Unnamed cat · age? · sex?` while a fact is unset. Open for a brand-new cat, folded once it has a name; a press opens the fields. |
| Phone collapsed theme **[F44]** | `Theme` · `Paper · warmth 0.50 · contrast 0.60` — the preset's name and both readings to two places; a press opens the swatches, the sliders and the contrast note. |
| Phone label row **[F44]** | Under every frame: the block label, then `Move up` `Move down` `duplicate` `remove` as icon buttons (the hero's row has none of the four). The editor's own actions (`replace photo`, `focal point`, `enhance`, `rewrite`, `shorten`, `add photos`, `replace clip`, `re-trim`) sit under the body as visible buttons. |
| Phone sheet headers **[F44]** | `Media · 7 items` · `Close` — the Media drawer; `CATalyst AI Assistant` — the CATalyst drawer, whose panel draws its own header. The save state sits at the top of the `Published` / `Archived` menu as its first, plain line (`Draft saved 2s ago`); a draft has no menu, so on the phone it shows the 6 px blue dot alone beside the name (the sentence is announced, not drawn — the bar has no room for it). The way back to the list is the first row of the column: `‹ All cats` — the icon set's chevron (`Prev`) and the words, named `All cats` (**[F55, 2026-09-13]**: the desktop's `All cats /` is a breadcrumb with the name after it; alone on the phone the slash dangled). |
| Phone peek line **[F45]** | The CATalyst peek bar — a 48 px bar on the bottom bar, named `open CATalyst` for the screen reader, its words `aria-hidden` (the topbar announces the turn) — reuses the working sentence (`CATalyst is working…`, with the breathing disc), a waiting card's own sentence, the receipt (`Applied — …`), the proposal question (`Want me to build this now?`), the refusal and the failure sentence, or the helper's last words: one line, truncated, a chevron at its end. Nothing before the first request. A tap is Full. `Hide CATalyst` — the chevron-down at the bar's end (44 px), or a swipe down on the bar — puts the bar away; it returns on its own when the next turn starts or a card arrives, and a turn that ends behind it lights the tab's disc. |
| Phone drawer heights **[F45]** | CATalyst: Full (the modal sheet; the panel's own header) → on send, Peek → a card, or a turn ending on a question, raises Half (`50dvh`; the sheet's title row `CATalyst AI Assistant` · `Close` is the handle a finger pulls down); Apply / Not this / a send / Close drop to Peek. Media: Full only — `Add photos or video` first (a 44 px row, the reading voice), the tiles, the card. From a block, `Pick a photo` / `replace photo` open the picker as a bottom sheet (the same `Pick a photo` · `Cancel` · `Use photo`). |
| Phone section picker **[F55, 2026-09-13]** | `+ add section` opens `Add a section` · `Pick what comes next on the page.` as a bottom sheet under 768 px, the same shape as the slot picker's: the seven tiles scroll inside it and `Cancel` is pinned to its foot (the centred card stood taller than the phone's window). From 768 px it is the centred card as before. |
| Pronoun **[F41]** | Every gendered word the builder shows the volunteer — the bio's `Who she is` kicker, a needs card's `What it means for her…` placeholder, the quote's `Her foster` placeholder, the name field's `Her name` placeholder, the tagline's `…under her name…` placeholder, the focal point's `Click her face.`, and a day/needs section's own name in a proposal, a removal question or a drag announcement (`"A day in her life" section`, `"What she needs" section`) — follows the cat's recorded sex exactly as the public page's own section words do (`Who she is` / `Who he is` / `Who they are`), unset or `unknown` falling to `they`. One table in `src/core/profile/pronouns.ts` is the source for all of it. |

### Helper

| Where | String |
|---|---|
| Header | `CATalyst AI Assistant` — `sees this page · cannot publish` |
| Build proposal **[new]** | No button: the interview ends in a plain-text message — the sections it will add, in order, the tagline direction, and the theme it will pick — asking `Want me to build this now?` A clear yes builds it; "not yet" or a new detail keeps the conversation going |
| Proposal | `Proposed · 2 operations` · ledger rows keyed `bio` `order` `theme` `photo` `section` `gallery` `quote` `caption` `name` `age` `sex` `tagline` `cards` `scene` (the comp's `reorder` is `order`) with readouts `41 → 9 words` `4 → 2` `Paper → Sand` · `Apply` · `Not this` · `one undo`. **[F58, 2026-09-13]** For a text edit the readout grows into the change block: a text field (tagline, name, age, quote, attribution, a caption, a card's title or text) draws the old value struck through in `meta` and the new one under it in `body`, both full length, in place of the `5 → 9 words` count — unless both fit the one-line `Charlotte → Marmalade` readout, which stays; the bio keeps its `118 → 63 words` beside the sentence and draws its word diff as prose under the row (below); the needs cards draw each card's title and text the same two-line way, a dropped card all struck, a new one all new. **[F59, 2026-09-13]** A `replace_image` draws the current photo above the proposed one under the row — two 56px faces cropped on each record's own focal point (the rail's own crop) beside its own caption line, never squeezed under it, the current one dimmed and struck, the proposed one plain, no arrow (stacked "was, then now" is the same order the text form reads in); a photo the library has since lost draws a striped face, never a broken image. A gallery's dropped photos draw the same way, struck, above the kept ones, plain. A `remove_block` draws the section's own one-line preview struck through — the same line the outline reads it by — with its photo beside it when it has exactly one (a hero, a photo section, a video's poster, a quote's photo), dimmed the same way; a gallery, a day section, a bio or the needs cards draw no face. Every caption and the removal line itself read in the ledger's own mono voice, at the ledger's own size (`meta`, `MonoLabel`'s reading size) — never the panel's base text. |
| Proposal change **[F58, 2026-09-13]** | The bio's diff: its paragraphs as written, removed words struck through in `meta`, added words in `ink` with a hairline underline — no colour on either (clay is the notice's, blue is the ring's). The first ~8 lines, then `Show the full text` (the link voice, as `show the suggestion again`), which opens the rest in place. A bio edit that changes only formatting (a bold toggled, the words the same) says `Only the formatting changes.` above the paragraph instead. For a screen reader that does not announce `<del>` / `<ins>`: each line of the two-line form is led in with a visually hidden `was:` / `now:`, and the diff with one visually hidden sentence, `Removed words are struck through; added words are underlined.` On the phone any card that draws a change block opens the CATalyst drawer to Full (design §4): at 390×664 the Half sheet holds the ledger line and the notice, not two more lines and Apply under them; only the one-line `Charlotte → Marmalade` card stays Half. **[F59, 2026-09-13]** The rule is the block's, not the field's: a `replace_image` pair, a gallery's dropped faces and a `remove_block`'s struck line and face open Full the same way — measured at 390×664, two full alt-text lines under each face put Apply exactly as far under Half's fold as a long bio diff does. |
| Applied | `Applied — theme warmed, video lifted above the gallery.` · `↶ undo both` — live: `Applied — moved quote; changed bio.` (the turn's own clauses) · `Undo these` — F34: each label with a block on the canvas (`quote`, `bio`) is a button that scrolls to it and blinks its ring again; a theme or a facts field stays plain words |
| Undone **[new]** | `Undone.` · `Redo these` — in the dashed box, in place of the Applied block, while the turn's edits are one redo away; gone once anything newer is on top |
| Dismissed | `Left as it was. Nothing on your page changed.` · `show the suggestion again` — only when the turn applied nothing |
| Not applied **[new]** | `Not applied: shortening the bio.` · `show the suggestion again` — under the Applied line, for a card declined in a turn that applied something else |
| Consequence | `Shortening the bio replaces your text` — `You wrote that paragraph. The original is recoverable with one undo, and only one.` |
| Failure | `I couldn't reach the model. Nothing on your page changed.` · `Try again` — F42: the first sentence names what went wrong: `The connection dropped.` when the network went away mid-stream, `The helper stopped mid-step.` when a step ended with a call nobody could answer (the stall guard); after edits landed, `I added 2 sections before I was cut off. Undo these, or ask me to continue.` as before |
| Locked | `Add one photo and I can help.` |
| Collapsed | the 52 px tab: toggle `open CATalyst` · label `CATalyst`, or `CATalyst · 1 suggestion` while a card waits — from 768 px; below 1180 the open panel lies over the canvas and Escape folds it (F46). [superseded 2026-09-13: `Collapsed. The canvas keeps the full width, and CATalyst remembers where you left off.` — the tab is the collapsed state; the sentence described a column that stayed 360 px wide] |
| Input | `Ask for a change…` · button `Send` (F65: an arrow beside the box, the same as Enter) · chips `Write a bio` `Pick a theme` `Tidy the order` |
| Greeting **[F55, 2026-09-13]** | One line above the composer while the thread is empty, both layouts, gone once anything is said: `Tell me about Charlotte, or start with Build the page.` while the page is just the hero (the `Build the page` chip is there to press) · `Tell me what to change on Charlotte's page.` once it has sections · the name falls back to `this cat` (`Tell me about this cat, or start with Build the page.`). Pronoun-free — the helper has not been told the cat's sex. |

## Toasts

| Kind | String |
|---|---|
| Success | `Gallery photo added.` · `Undo` |
| Progress | `Uploading rain-day.mov — 2 of 3` · `68%` |
| Warning | `That photo is 640px wide — too small for the hero.` · `Use anyway` |
| Error | `Upload failed. Nothing was added.` · `Try again` |
| Published **[new]** | `Charlotte is live at southcountycats.org/charlotte.` · `View page` |
| Unpublished **[new]** | `Charlotte is back to draft. She's off the site and off the carousel.` · `Undo` |
| Offline **[new]** | `You're offline. Your last change is saved here and will sync when you're back.` |

## Modals

| Where | String |
|---|---|
| Remove section | `Remove the gallery?` — `Three photos come off Charlotte's page. They stay in your media library, and one undo brings the section back.` · `Keep it` · `Remove section` |
| Video too long | `That clip is 2:07. A profile plays up to 15 seconds; the carousel shows the first 8.` (a clip already inside the limit: `That clip is 0:10. Pick the seconds worth watching.`) — `Drag the handles to choose the stretch. Its first frame is the cover.` **[F55, 2026-09-13]** (was `Pick the seconds worth watching — drag to change it.`, which repeated the short title word for word) · `0:28 – 0:40 of 2:07 · muted · loops` · `Cancel` · `Use this stretch` · `Remove trim` (decision Q4, 2026-09-10: a profile clip is 1–15 s, the carousel plays the first 8 s; the app does not guess a stretch). On a phone the preview is held to 40dvh and the footer is pinned like the focal sheet's (F39), so `Use this stretch` is in reach without scrolling **[F55]**. |
| Unsupported file **[new]** | `We can't read that file.` — `Photos as JPEG, PNG or WebP; video as MP4 or MOV. Nothing was added.` · `Close` · `Choose another` (HEIC is not decoded — the picker lets iOS convert it; a HEIC that arrives anyway is refused, FR-008 / ADR-005) |
| Unpublish **[new]** | `Take Charlotte off the site?` — `Her page stops working and she leaves the event carousel. Everything you wrote is kept as a draft.` · `Keep her live` · `Move to draft` |
| Someone else is editing **[new]** | `Another volunteer has this cat open.` — `You're both signed in as the shelter. Whoever saves last wins, so agree who's driving before you both type.` · `Open anyway` · `Go back to the list` |

## Publish validation

| Where | String |
|---|---|
| Blocked | `Two things missing: fee, and one photo in the gallery.` (lists what's missing, then scrolls to the first gap) |
| Blocked — no age **[new]** | `Add her age.` / `Add his age.` / `Add their age.` (Checkpoint 2, F1: age joins the required set; pronoun follows the recorded sex) |
| Blocked — no definite sex **[new]** | `Say whether the cat is female or male.` (Checkpoint 2, F1: sex joins the required set; this problem exists exactly when the sex is not recorded, so the sentence has no pronoun to use) |
| Draft badge | `UNFINISHED` |

**Proposed required set — confirm with the client, this was never specified:** name · one photo with a focal point and alt text · age · sex · good-with · fee (may be `$0`) · one bio paragraph. Everything else optional. Gallery, video, extra photo sections and traits are never required. A block that exists but is empty blocks publishing and says which one.

## Event carousel

| Where | String |
|---|---|
| Header | `Adoptable now` |
| Per cat | tag (`Explorer`, `Lap specialist`, `Quiet type`, `Bonded pair`, `New arrival`) · one line of copy · `Age` · `Good with` |
| Footer | `Up next` (no counter text — removed on user request, 2026-09-12) — drawn only when there is a next cat; with one cat in the rotation the label is left out rather than heading nothing **[F55, 2026-09-13]** |
| QR card | `Scan` — `Charlotte's page` — `Photos and the full story` |
| Empty rotation | `Nothing in the rotation` — `No cats are on the carousel right now.` — `Switch a cat back to IN and the loop rebuilds itself. Until then the screen stays dark rather than showing an empty frame.` |
| Offline | `The carousel keeps looping on yesterday's cats.` (+ a dated mono line) |

## Carousel set-up

| Where | String |
|---|---|
| Header | `Event carousel` · `Not on a screen yet` / `Casting to Lobby TV` / `Nothing to cast yet` · `Copy kiosk link` · `Start on Lobby TV` / `Stop casting` / `Add a cat to cast` |
| Rotation | `Rotation` · `4 of 6 on the carousel` · `Drag to order. A cat leaves the carousel the moment its profile goes back to draft.` · `IN` / `OUT` · `+ add a published cat` |
| Preview | `PREVIEW · 1920×1080 at 45%` · `4 cats × 6.5s = 26s loop` (singular: `1 cat × 6.5s = 6.5s loop`) |
| Timing | `Hold per cat` · `5s` `6.5s` `8s` `12s` |
| Timing notes | 5s: `Brisk. Good for a busy doorway where nobody stands still.` · 6.5/8s: `The default. Long enough to read the name, the line, and reach for a phone.` · 12s: `Slow enough to read the whole line twice — right for a seated waiting area.` |
| Carousel toggles | `Scan-to-keep QR card` · `Different photo each loop` · `Play clips, muted` |
| Pairing | `Open southcountycats.org/tv and type 4821.` |

## Public index

The front door at `/cats`, built from the profile page's parts (design audit, 2026-09-12). All strings **[new]**.

| Where | String |
|---|---|
| Kicker | `Adoptable now` (shared with the carousel header) |
| Title | `Cats looking for a home` |
| Intro | `Open a page for the photos and the full story.` **[2026-09-13, user request]** (was `Every cat here …`) |
| Card | photo (the manifest's alt) · name · the display line (tagline, else the bio's first sentence) |
| Empty | `No cats are listed yet. Check back soon.` (in the intro's place; no grid, no striped tile) |
| Missing photo | `photo coming` (the striped slot's mono label) |

## Public profile

| Where | String |
|---|---|
| Nav | `Story` `Her day` `Film` `Adopt` |
| Hero kicker | `Looking for a home` · `Scroll in` |
| Facts | `Age` `Sex` `Coat` `Good with` `Fee` |
| Sections | `Who she is` · `A day in her life` · `What she needs in a home` · `Moving picture` (`0:14 · no sound needed`) · `Her foster, Dana` · `Next step` |
| CTAs | `Start an application` · `Ask about Charlotte` · `Updated 4 days ago by a volunteer` |
| Footer | `southcountycats.org · a volunteer-run rescue in South County, Rhode Island` |

Cat-specific copy (bio, day captions, quote, trait pills) is written per cat by a volunteer — the strings in the files are Charlotte's, and they set the register: behaviour over adjectives, one concrete detail per sentence.
