# Phone sweep on Cloud Run — 2026-09-13

Driven by the controller (Playwright, `iPhone 14` device profile: 390×664 viewport, `isMobile`,
`hasTouch`, taps not clicks) against the deployed revision 00006 (`b58ea93`) at
`<service-url>`, real Gemini
(`gemini-3.8-flash`), real buckets. Screenshots: `.superpowers/sdd/tasks/phone-sweep/`
(untracked). The test cat **Maple** (`jzvekats`) is left **published** on purpose so the
human-pending phone checks (T048: real-phone render, QR scan, phone edit) have a live cat.

## What worked (all on the phone unless noted)

| Step | Result |
|---|---|
| `/cats` anonymous, sign-in page, sign-in `scc` | PASS — one column, hero photo, form; redirected to the list |
| Builder list | PASS — cards with photo, name, `edited …`, Delete; `New cat` |
| New cat, Facts group (name, age, sex, tagline), Theme group (presets, sliders, AA line) | PASS — saved on reload, groups collapse to one summary line |
| Media drawer: upload 3 JPG + 1 MP4 from the phone | PASS — queue (`PROCESSING`/`QUEUED`, `Uploading … 1 of 4`, `100%`), 4 items in 44 s, descriptions written, poster made |
| Media item card: description, `Focal point`, `Remove`; `Not on the page yet` | PASS |
| Hero `Pick a photo` → picker sheet → `Use photo` | PASS — hero fills; `replace photo` `focal point` `enhance` pills |
| CATalyst drawer: `Help me build her page` → 5 questions → proposal → `Go ahead` → build | PASS — send → peek (`CATalyst is working…`), question → half sheet, proposal ends `Want me to build this now?`; build added bio, gallery (2 photos), needs (3 filled cards), quote, theme; tagline `set_field` carded because I had typed one (F52 note); no id in any reply |
| Time to first change after `Go ahead` | **13.2 s** (SC-013 target 5 s — F52; `load_skill`+`add_block` in the first request) |
| `add_block` refusals in the build | 2 (`block`, `block.mediaId`) — retried, F52 |
| Card in the half sheet → Apply → peek receipt `Applied — …` | PASS |
| Follow: `Shorten the bio` → card → Apply → canvas scrolls to the bio, pulse ring, receipt | PASS |
| Peek dismiss (`Hide CATalyst`) and reopen from the tab (full) | PASS |
| Move up / Undo / Redo (block order) | PASS |
| `+ ADD SECTION` → VIDEO → `Pick a clip` → placed; `re-trim` → trim sheet, preview loops the stretch, `Use this stretch` → `PROCESSING` → done | PASS (see design findings for the sheet) |
| Preview page on the phone | PASS — hero pin, facts, bio, photos, quote, needs, portrait video playing muted+loop+playsinline |
| Publish from the phone → toast `Maple is live at …` · `VIEW PAGE`; `Published` menu (`Draft saved`, View page, Republish, Unpublish, Archive) | PASS |
| Public page, fresh context, no cookies | PASS — 200, video muted/loop/playsinline, media under `/media/` |
| `/cats` public | PASS — Maple listed with tagline |
| `/carousel` 1920×1080 | PASS — `01 / 01`, photos rotate, QR decodes to `/cats/maple-jzvekats`, no `Loop`/`Photo n of m` text, 0 console errors |
| `/kiosk?hold=12` 1920×1080 | PASS — no controls, beat advances |

## Findings → tasks

Design (phone builder), filed as **F55**:

1. Gallery tile controls under each photo are an unfinished-looking cluster: `Move left`/`Move right`
   chevrons unboxed, `Remove photo` in a white square, `enhance` in a separate white pill of a
   different size (`23d-gallery.png`). One consistent control row per tile.
2. Empty slots say `DROP A PHOTO` (hero and the gallery's two spare cells) — nothing drops on a
   phone; the gallery also shows two spare dashed cells *and* an `add photos` button.
3. Trim sheet: the footer (`Cancel` / `Use this stretch`) scrolls away — at 390×664 only a
   26 px sliver of the buttons is visible; the portrait preview takes most of the sheet
   (`51-trim-b.png`). The focal sheet already pins its footer (F39). Title and subtitle both say
   "Pick the seconds worth watching".
4. `Add a section` is a centred modal taller than the phone viewport (Cancel off-screen until you
   scroll inside it) — the picker sheets are bottom sheets; this one should match.
5. The first row of the column reads `All cats /` — a dangling slash with nothing after it.
6. The empty CATalyst sheet is a blank white page above the composer — no greeting, no hint
   (`15-catalyst-open.png`).
7. (Judgement, by design in F44) `Published` is a lone blue-dot button in the top bar — cryptic
   for a first-timer; a `● Live` label fits at 390.
8. Carousel/kiosk: `UP NEXT` label with nothing under it when one cat is live.

Bug, filed as **F56**: the focal point sheet says `Tap their face` for a female cat —
`MediaEditors` never passes the cat's `sex` to `FocalPicker`, so F41's pronoun rule is not
applied there (every width).

Already filed: SC-013 / `add_block` shape / hand-typed tagline carded mid-build → F52.

Doc nit: `references/design/CONTENT.md` Block actions row still lists a video `cover frame`
action; the cover frame is the trim start (TrimEditor) — no such button exists.
