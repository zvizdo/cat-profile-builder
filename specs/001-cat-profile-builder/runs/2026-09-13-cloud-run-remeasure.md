# Cloud Run re-measure — 2026-09-13

Post-deploy checks against the deployed Cloud Run revision **00008**
(`south-county-cats-adopt-00008-zck`, commit `1095738`),
`<service-url>`, real Gemini
`gemini-3.8-flash`, real buckets (`<project-id>-cat-profiles-private`, `<project-id>-cat-profiles-public`),
project `<project-id>`. Signed in as `scc`. Three jobs: SC-013 re-measure against the new
eight-second criterion (T048 step 4), a `MaxListenersExceededWarning` check (F53), and a phone
spot-check of F55/F56.

## Verdict

**SC-013 now passes: 10 of 10 builds under 8 s** (range 4.0–7.8 s, median 5.35 s), and every
build's first request already carries `set_field ×3, replace_image, add_block` with no lone
`read_outline` — confirmed both from the browser and from the server log. Zero refused
`add_block` calls anywhere in the run (client-side and server-side agree: 0 of 225 helper turns
in the window). `MaxListenersExceededWarning` is **gone on revision 00008** (0 occurrences over
its whole lifetime so far) versus 78 occurrences on the prior revision `00006-lj2` in a
comparable 30-minute window. The phone spot-check passes on every item checked. All twelve test
cats created during this run were deleted and both buckets confirmed empty for every one of
their ids.

## Job 1 — SC-013 re-measure (T048 step 4, criterion now ≤ 8 s in ≥ 9/10)

**Result: 10/10 ≤ 8 s.** Median 5.35 s, range 4.0–7.8 s.

Driver: adapted from the F52 driver
(`/private/tmp/claude-501/-Users-anzekravanja-Projects-cat-profile-builder/dd220710-9cf3-470e-800a-df8868bcd501/scratchpad/f52/drive.mjs`),
copied to
`/private/tmp/claude-501/-Users-anzekravanja-Projects-cat-profile-builder/dd220710-9cf3-470e-800a-df8868bcd501/scratchpad/remeasure/drive.mjs`:
pointed at the Cloud Run URL (was localhost), signed in as `scc`/`catsarecool` (was the e2e
fixture's `volunteer`), Playwright loaded from the main checkout's `node_modules` (the F52
worktree that shipped it no longer exists). Same method as F52/T048: fresh cat via "New cat",
the same three `test-media` photos uploaded to the rail, "help me build her page" typed into
CATalyst, the interview answered with the fixed T048/F52 answers (Willow, female, 2 years old,
etc.), then "Yes, build it." First change = the first canvas mutation that changes content
(facts values, image sources, section count or text) from the Enter keypress of the yes,
timed by a `MutationObserver` installed in the page immediately before the keypress; the canvas
*lock* mutation (~3 ms) is excluded by requiring the DOM signature to actually change. A
one-off trial build (cat `ivbuw2je`, not counted in the table) confirmed the driver worked
against Cloud Run before the ten counted builds ran.

Ten builds ran back-to-back (~2 minutes apart) between 17:37:28 and 17:55:31 UTC.

| # | First change (s) | Refused `add_block` | Requests (build turn) | Blocks | Cards | Every block filled | id-like token in a reply |
|---|---|---|---|---|---|---|---|
| 1 | 5.1 | 0 | 9 | 5 | 0 | yes | no |
| 2 | 7.8 | 0 | 10 | 4 | 0 | yes | no |
| 3 | 4.7 | 0 | 6 | 4 | 0 | yes | no |
| 4 | 5.8 | 0 | 6 | 4 | 0 | yes | no |
| 5 | 5.5 | 0 | 11 | 5 | 1 | yes | no |
| 6 | 4.2 | 0 | 7 | 5 | 0 | yes | no |
| 7 | 5.2 | 0 | 7 | 5 | 0 | yes | no |
| 8 | 5.8 | 0 | 10 | 4 | 0 | yes | no |
| 9 | 5.9 | 0 | 8 | 4 | 0 | yes | no |
| 10 | 4.0 | 0 | 9 | 4 | 0 | yes | no |

**Tally: 10/10 ≤ 8 s** (needs ≥ 9/10). Median 5.35 s, range 4.0–7.8 s. "Every block filled" means
every text field the block type has came back non-empty (bio paragraph(s), needs cards' title
and text, day/quote lines, photo captions) and every image slot has a `src`; galleries have no
text fields by design (F52) so their `text0of0` is expected, not a miss. Zero id-like tokens
(`[a-z2-7]{8}`) turned up in any CATalyst reply across all ten panels' full text.

In every one of the ten builds the build turn's **first** request already carried the hero fill
— `set_field ×3, replace_image, add_block`, no lone `read_outline`, no `load_skill` reload —
confirmed two ways:

- **Client-side** (`grep -c tool-input-error` on each `drive.log`, and each `BUILD TIMELINE`
  line): 0 `tool-input-error` chunks in all ten runs; every timeline's first entry after
  `0.2s REQ` is `set_field | set_field | set_field | replace_image | add_block`.
- **Server-side**, `gcloud logging read 'resource.type="cloud_run_revision" AND
  resource.labels.revision_name="south-county-cats-adopt-00008-zck" AND (jsonPayload.msg="helper
  turn" OR jsonPayload.msg="helper invalid tool input")' --project <project-id> --format json
  --limit 300` for the window `17:35:00Z`–`17:56:00Z` (covers the trial and all ten builds):
  **225 `helper turn` entries, 0 `helper invalid tool input` entries.** Matched each build's
  profile id to its first turn whose `toolCalls` included an edit tool — all ten read
  `["set_field","set_field","set_field","replace_image","add_block"]`, with `durationMs`
  4534–8257 and `outputTokens` 625–1173 (the whole cost is the model's own first-call latency,
  matching F52 §5's finding that the remaining time is `gemini-3.8-flash` thinking before its
  first tool call, not a structural defect).

Raw captures (every request/response, per-build logs, screenshots):
`/private/tmp/claude-501/-Users-anzekravanja-Projects-cat-profile-builder/dd220710-9cf3-470e-800a-df8868bcd501/scratchpad/remeasure/`
(`drive.mjs`, `run-all.sh`, `runs/final-1`…`runs/final-10`, `runs/trial`, `pids.txt`,
`server-log.json`).

## Job 2 — MaxListeners check (F53)

**Result: 0 on revision 00008; 78 on revision 00006-lj2 in a comparable 30-minute window.**
Expectation met.

- `gcloud logging read 'resource.type="cloud_run_revision" AND
  resource.labels.revision_name="south-county-cats-adopt-00008-zck" AND
  textPayload:"MaxListenersExceededWarning"' --project <project-id> --format json --limit 50`
  → **0 lines**, over revision 00008's entire lifetime so far (it started serving at
  17:31:53 UTC; this check ran after job 1's builder loads, ~225 helper turns, and draft
  saves had already happened on it).
- Same query against `south-county-cats-adopt-00006-lj2`, windowed to its last 30 minutes of
  traffic before 00008 took over (`16:53:00Z`–`17:23:13Z`, the revision's last logged instance
  of the warning): **78 lines**.

## Job 3 — Phone spot-check (F55/F56)

Playwright, 390×844 (iPhone-14-sized) viewport against the same Cloud Run URL, signed in as
`scc`. All items pass.

| Check | Result | Evidence |
|---|---|---|
| Gallery tile pills (builder canvas) | **pass** | `.superpowers/sdd/tasks/remeasure-gallery-tiles.png` — two-photo gallery block renders as pill-bordered tiles with "Move left/right", "enhance", "Remove photo" pill controls |
| Empty hero shows only "Add a photo" | **pass** | Fresh cat `gyzx5v6p`, hero region's only control before any photo is a single "Add a photo" button (no replace/focal/enhance) — `.superpowers/sdd/tasks/remeasure-empty-hero.png` |
| Trim sheet's "Use this stretch" visible without scrolling at 390×664 | **pass** | Bounding box `x=201, y=584, w=157, h=49` → bottom edge at 633 px, inside the 664 px viewport — `.superpowers/sdd/tasks/remeasure-trim-sheet-390x664.png` |
| "Add a section" opens as a bottom sheet with "Cancel" visible | **pass** | `.superpowers/sdd/tasks/remeasure-add-section-sheet.png` |
| Top-left row reads "‹ All cats" | **pass** | DOM: an `svg` chevron-left icon (`path d="M12 5l-5 5 5 5"`) immediately before a `span` with text "All cats" |
| Empty CATalyst sheet shows the greeting line | **pass** | Fresh cat `gyzx5v6p`, no photo yet: "CATalyst locked" / "Add one photo and I can help." — `.superpowers/sdd/tasks/remeasure-catalyst-empty.png` |
| Focal sheet says "Tap her face." for a female cat | **pass** | Cat `tibklyuo` (Willow, female): dialog "Where should the crop hold on?" / "Tap her face. Every crop on the site, the phone and the carousel is derived from this one point." — `.superpowers/sdd/tasks/remeasure-focal-sheet.png` |
| Top bar shows "● Live" after publishing | **pass** | Cat `tibklyuo` after Publish: button reads "Live" with a filled pill/dot span (`<span aria-hidden="true" class="size-6 rounded-pill bg-blue">`) before the text — `.superpowers/sdd/tasks/remeasure-live-badge.png` |
| `/carousel` at 1920×1080: "Up next" absent while exactly one cat is live | **pass** | Checked before `tibklyuo` was published, while Maple was the only live cat: page shows "01 / 01", no "Up next" text anywhere — `.superpowers/sdd/tasks/remeasure-carousel-single.png` |

`tibklyuo` (the fully-built final-9 test cat) was published, checked for the Live badge, then
immediately unpublished via the top-bar menu ("Live" → "Unpublish" → confirm "Move to draft")
before deletion — it was live for well under a minute, and the `/carousel` single-live-cat check
was made beforehand while only Maple was live, so no moment had two cats live on the carousel
during this job.

## Cleanup

Twelve test cats were created during this run (ten SC-013 builds, one SC-013 trial, one phone
spot-check cat) — all named "Willow" except the un-named phone-check cat, all distinct from
"Vini", "Charlotte" and "Maple", none of which were touched:

| Label | Profile id |
|---|---|
| trial | `ivbuw2je` |
| final-1 | `r4wdhz4q` |
| final-2 | `dis2nvod` |
| final-3 | `z27b7ggh` |
| final-4 | `7xfkflqn` |
| final-5 | `agejltjb` |
| final-6 | `6totcdre` |
| final-7 | `tifgf3qp` |
| final-8 | `hdh524do` |
| final-9 / phone spot-check | `tibklyuo` |
| final-10 | `jqicpy5h` |
| phone-check (empty-hero/empty-CATalyst) | `gyzx5v6p` |

All twelve were deleted from the builder list (`Delete <name>` → confirm "Delete") after
`tibklyuo` was unpublished. Confirmed with
`gcloud storage ls -r gs://<project-id>-cat-profiles-private/profiles/ | grep <id>` and the same
against `gs://<project-id>-cat-profiles-public` for each of the twelve ids: **no output for any
id in either bucket.** The builder list afterward shows only Charlotte (draft), Maple (live) and
Vini (draft) — unchanged.

## F64 — edge hairline on the phone (revision 00011, commit 0393726)

Same method as the investigation (Playwright iPhone 14 emulation, 390×844 at dpr 3, `/kiosk?hold=4`,
per-frame mean brightness of the device-pixel rows at the frame's top and bottom edges).

| | top edge row, 16 frames | bottom edge row, 16 frames |
|---|---|---|
| before (revision 00010) | 13 13 13 13 13 13 13 **134** 13 13 **134** 13 13 **132** 14 14 | 13 13 **76 75 74** 13 13 13 **74** 13 **75** 13 13 13 28 28 |
| after (revision 00011) | steady — equals the row inside the frame in every frame | steady — background (14) in every frame |

Two runs after, one starting at page load and one starting exactly at a beat change: the row outside
the frame stays background and the first row inside matches its neighbour, frame after frame. Stage
rect on the phone: top 312.3333 css px (device pixel 937), 1168×657 device px — whole on all four
edges; landscape 844×390: 2080×1170 at (226, 0). Chromium only; the real-phone (Safari) look is the
human check.
