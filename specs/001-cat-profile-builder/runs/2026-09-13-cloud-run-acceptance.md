# Cloud Run acceptance run — 2026-09-13

Task T048. The whole volunteer journey driven against the deployed app, the real Gemini
model and the real buckets — nothing faked, nothing local. Every step below was run by a
headless Playwright script against the live URL and checked by reading the page, the
buckets, and the Cloud Run logs afterwards; the screenshots are what the browser saw.

## Verdict

**12 of 14 steps pass. Two do not: step 4 misses SC-013 (first change 13.4 s, target 8 s after F57 amendment),
and step 8's SC-004 is marginal (LCP median 2.3 s passes, but 2 of 5 Lighthouse runs hit
3.4 s).** Three things are human-pending (a real phone). Nothing broke, nothing leaked, the
test cat was deleted and both buckets are clean.

**Re-measure 2026-09-13 (revision 00008, after F52–F57):** step 4 passes — ten builds, 10/10 ≤ 8 s (median 5.35 s, range 4.0–7.8 s), 0 refused `add_block`, 0 cards, every block filled, no id in any reply; `MaxListenersExceededWarning` 0 on 00008 vs 78 on 00006 over a comparable half hour; the F55/F56 phone polish 9/9 on the live app. See `2026-09-13-cloud-run-remeasure.md`. With that, 13 of the 14 automated steps pass and the 14th (SC-004) is marginal-pass; the three human-pending phone checks remain.

### Bugs and findings, most important first

1. **SC-013 missed: 13.4 s from "Yes, build it." to the first change on the canvas (target
   ≤ 5 s).** Measured in the page itself (a `MutationObserver` started the instant Enter was
   pressed) and confirmed by the server log. The log explains it: the build turn's first
   request was a lone `read_outline` (6.6 s of model time), and only the *second* request
   carried `set_field ×3, replace_image, add_block` (another 6.6 s). Each request to
   `gemini-3.8-flash` costs roughly 6–7 s here, so anything that spends a whole round trip
   on a read before the hero fill is over budget on its own. One sample against a
   9-in-10 criterion, but the mechanism is structural, not noise. See §4.
   
   **Amendment 2026-09-13 (F57):** The structural cause (the lone read) is fixed by F52 and proven in ten builds: 4.6–7.4 s (median 5.8 s), 3/10 ≤ 5 s and 10/10 ≤ 8 s. The criterion changes to eight seconds. Table in F52 §5.
2. **`add_block` arrives malformed and is retried — 6 times in this run.** Six
   `helper invalid tool input` log lines, all `add_block`, paths `block.type` (×2),
   `block` (×2), `block.mediaId`, `block.text`. The server refuses them, the model retries,
   the volunteer sees nothing — but each retry is a wasted model round trip (and this is
   what the 2026-09-11 run's "six add_block calls, three blocks" mystery was). This is the
   strongest lever on bug 1 as well: fewer wasted requests, faster first change.
3. **`MaxListenersExceededWarning` is still printed on the deployed revision — 1,558 stderr
   lines in the 32-minute window (779 pairs of "11 error listeners" / "11 close
   listeners").** F36 and the F40 review fixed it for media read streams
   (`src/adapters/gcs/media-store.ts`, `withHeadroom`), but the warning correlates with
   `/api/helper/chat` (273), `/builder/{id}` (265), `/api/profiles/{id}/draft` (85) and
   `/builder` (54) — document reads and the helper route, not the media stream path. So
   there is a second, uncovered source. It is noise, not a failure, but it is 63% of every
   log line the service wrote.
4. **SC-004 marginal.** Lighthouse (mobile, simulated Slow 4G, 4× CPU) LCP over five runs:
   3.35 / 2.22 / 2.23 / 2.29 / 3.37 s. Median 2.29 s passes 2.5 s; two runs miss. The LCP
   element is the hero `<img>` every time; it is preloaded and not lazy. The two slow runs
   differ in where the time went (run 1: 1.1 s TTFB, run 5: 2.7 s render delay with the
   image already loaded), which reads like laptop-side noise under 4× throttling rather
   than a page problem — but it is not a comfortable margin. See §8.
5. **Describer calls the gray-and-white cat "a tabby" in every clip description** (three
   trims, three descriptions, all "A tabby cat…"); the photo descriptions from the same
   describer say "gray and white". Alt-text quality, not a defect; noted for the prompt.

Not bugs, but worth knowing: the trim editor's poster is taken at *start + 0.5 s*, so a
0–8 s trim of a clip whose first poster was also at 0.5 s lands on a byte-identical poster
with the same content-hashed name (`poster.4d2bf24404.jpg`) — correct by design (ADR-015),
but it means "a new poster" needs a trim that moves the start. And the phone builder is the
F44/F45 one: blocks *are* editable on the phone (the new quote block had two text fields),
so the brief's "read-only preview" wording is older than the UI.

## Setup

- URL `<service-url>`, Cloud Run service
  `south-county-cats-adopt` in `us-west1`, project `<project-id>`, revision
  `south-county-cats-adopt-00006-lj2`, built from commit `b58ea93`.
- The service's own `configuration validated` line: `STORE=gcs`, `MODEL=vertex`,
  `MODEL_DRAFTING=gemini-3.8-flash`, `MODEL_DESCRIBER=gemini-2.5-flash-lite`,
  `VERTEX_LOCATION=global`, `LOG_LEVEL=info`, buckets `<project-id>-cat-profiles-private`
  and `-public`. No `GOOGLE_VERTEX_API_KEY` anywhere.
- Test media from `test-media/`: `PXL_20260622_022941724.jpg`, `PXL_20260630_022313665.jpg`,
  `PXL_20260704_000044372.jpg` (the darkest of the three, mean luminance 108 vs 111 and 124)
  and `PXL_20260904_202047557.mp4` (10.5 s, portrait with `rotation=-90`, an audio track and
  a data track, Pixel 9 tags with GPS). The 243 MB file is
  `PXL_20260907_181251908.mp4` (243,627,354 bytes).
- Test cat: **Willow**, id `tezvj5ah`, created at 14:37:55 and deleted at 15:08:42 UTC.
  The two existing cats (`b4uxvi2x`, `lbsq3wlo` — Vini and Charlotte, both drafts) were
  not touched; they are still the only two prefixes in either bucket.
- Scripts and every screenshot: scratchpad `t048/` (`step*.mjs`, `results.jsonl`,
  `notes.json`, `run.log`, the Lighthouse JSON/HTML, `view-source.html`, `ffprobe-web.txt`,
  the two `asset.json` downloads). Key screenshots copied to
  `.superpowers/sdd/tasks/T048-*.png`.
- Browser: headless Chromium via `@playwright/test`, 1440×900 for the builder, fresh
  cookie-less contexts for every visitor check, 390×844 with `isMobile` for the phone
  proxies. Default timeout 30 s; real-model turns waited on the topbar's "CATalyst is
  working…" status going away.

## The steps

Times are wall-clock for the step as the script ran it, not counting my own reading.

| # | What | Time | Result | Screenshot(s) |
|---|---|---|---|---|
| 1 | Sign in, wrong password once | 2.2 s | PASS | `01-wrong-password`, `01-signed-in-list` |
| 2 | New cat; 3 JPGs + clip; descriptions; upright poster; 243 MB refused | 45.5 s | PASS | `02-uploaded`, `02-clip-tile-open`, `02-oversize-refused` |
| 3 | Trim to 8 s; new poster + description; ffprobe the web clip | 215 s (two cuts) | PASS | `03-trim-modal`, `03-retrim-modal`, `03-trimmed-tile` |
| 4 | Focal point; "help me build her page"; interview; build; SC-013; undo/redo | 154 s | **FAIL (SC-013 only)** | `04-focal-sheet`, `04-interview`, `04-streaming`, `04-built-full`, `04-after-undo`, `04-after-redo` |
| 5 | "shorten the bio" → card → Apply; "move the video up" at once | 54 s | PASS | `05-shorten-card`, `05-shorten-applied`, `05-video-moved` |
| 6 | Enhance the darkest photo → compare → accept; `auto-v1` in the bucket | 5.6 s | PASS | `06-compare`, `06-compare-enhanced-side`, `06-accepted` |
| 7 | Sand; contrast to the warning; Restore to passing; publish | 4.7 s | PASS | `07-contrast-warning`, `07-restored`, `07-published` |
| 8 | Public page fresh context + phone viewport; video; view-source; media URLs; LCP | 6 s + 5 Lighthouse runs | PASS (SC-004 marginal; real phone pending) | `08-public-desktop(-full)`, `08-public-phone(-full)`, `lighthouse-willow*.json` |
| 9 | `/cats`; `/carousel` with QR (decoded, opened in a phone context); `/kiosk?hold=12` | 16 s | PASS (real scan pending) | `09-cats`, `09-carousel-willow`, `09-qr`, `09-qr-scan-phone`, `09-kiosk-1/2` |
| 9b | Phone mode, real model: tagline saved; one structural change; "Undo these" | 131 s | PASS (real phone pending) | `09b-phone-builder`, `09b-tagline-saved`, `09b-peek-question`, `09b-full-question`, `09b-new-block`, `09b-receipt-undo`, `09b-undone` |
| 10 | Archive → 404 → `/cats` empty → `/carousel` empty; Restore byte-identical | 11 s | PASS | `10-archive-question`, `10-archived-404`, `10-cats-empty`, `10-carousel-empty`, `10-restored-page` |
| 11 | Remove a used photo → refused naming her; Unpublish → 404; delete the draft | 5 s | PASS | `11-remove-refused`, `11-unpublished-404`, `11-delete-question`, `11-deleted-list` |
| 12 | Both buckets empty for the id | — | PASS | pasted below |
| 13 | Cloud Run logs: no provider error, no secret, no `console.log` | — | PASS (bug 3 noted) | pasted below |

Two script mistakes were caught and re-judged rather than re-run: step 2's script first
reported FAIL only because its own `/4 items/` check was case-sensitive against the
CSS-uppercased heading `MEDIA · 4 ITEMS`; step 8's first pass flagged 27 "bad" media URLs
that were the app's own `/_next/image?url=%2Fmedia%2F…` wrappers, `/logo.png` and four
`/_next/static/media/*.woff2` fonts. Both are recorded as-is in `results.jsonl`; the
substance passed both times.

## 1. Sign-in

`/builder` sent the signed-out browser to `/sign-in?next=/builder`. Username `scc`, a wrong
password, Enter: exactly one alert, **"That username and password don't match."** — and
nothing else changed on the page. The right password landed on `/builder` with the list and
the `New cat` button; the `cpb_session` cookie was saved as the storage state every later
script reused.

## 2. Uploads, descriptions, the poster, the 243 MB refusal

All four files went through the rail's one file input together. Settle times from the
moment the input was set:

- `PXL_20260622…jpg` at +3.9 s — "A fluffy gray and white cat lies on a wooden floor,
  looking up with green eyes. A pet carrier is visible in the background."
- `PXL_20260630…jpg` at +7.2 s — "A fluffy gray and white cat is sleeping comfortably on a
  gray couch, partially covered by a white blanket. The cat is lying on its back with its
  eyes closed and paws resting on its chest."
- `PXL_20260704…jpg` at +10.5 s — "A fluffy gray and white cat sleeps peacefully, resting
  its head on a teal fabric. Its eyes are closed, and one paw is tucked under its chin."
- `PXL_20260904…mp4` at +44.2 s (transcode + describe) — "A tabby cat with a long tail walks
  across a wooden floor. The cat is in a hallway with doors on either side and a table in
  the background." — tile `0:10`, "described automatically".

These are real alt text, same quality as the 2026-09-11 run, and this time the **video got a
real description too** (the earlier run's `not-in-cloud-storage` skip was a `STORE=fs`
artefact; with `STORE=gcs` the describer gets a `gs://` URI). "Tabby" is wrong (finding 5).

**Poster upright:** the clip is stored rotated (`rotation=-90`), and the poster the tile
shows is `1080×1920` — taller than wide, so the phone's rotation was applied. The tile in
`02-uploaded.png` shows the hallway floor the right way up.

**243 MB refused before upload:** selecting `PXL_20260907_181251908.mp4` produced the error
toast **"That video is over 200MB."** in 12 ms, and the request listener saw **zero**
`PUT`s, zero requests to `storage.googleapis.com` and zero server-action `POST`s — the
bytes never left the browser. The rail stayed at "MEDIA · 4 ITEMS".

## 3. Trim to 8 s, then ffprobe

First cut, `0:00–0:08` (`03-trim-modal.png`): the modal read "That clip is 0:10. Pick the
seconds worth watching." with the live line "0:00.0 – 0:08.0 of 0:10 · muted · loops"; the
End handle was moved with Shift+ArrowLeft. `Use this stretch` → the tile came back as
`0:08` in 27.9 s with a **new description** ("A tabby cat is crouched low on a wooden
floor, looking towards a toy mouse…") — but the **same poster name**, `poster.4d2bf24404.jpg`.
That is by design (poster at start + 0.5 s, content-hashed name; see the note under the
verdict), so to show a genuinely new poster I re-trimmed to **`0:01–0:09`** (still 8 s) via
`Re-trim`. That came back in 31.4 s with `poster.f3bc7dcfdd.jpg` and a third distinct
description ("A tabby cat with a striped tail walks across a polished wooden floor. The
cat is in a hallway with white doors on either side."). The server logged both:
`trim started {start:0,end:8}` → `trim finished {durationSeconds:8}` (27 s), then
`{start:1,end:9}` → `finished` (30 s).

The record in the private bucket (`gcloud storage cat …/media/t7hywcbq/asset.json`):
`status: ready`, `durationSeconds: 8`, `trim: {start:1, end:9}`,
`revisions: {web: f507ca7f21, poster: f3bc7dcfdd}`, `alt.source: model`.

The web clip, downloaded through the app (`/media/profiles/tezvj5ah/media/t7hywcbq/web.f507ca7f21.mp4`
→ `200`, 5,297,934 bytes, `video/mp4`, `cache-control: public, max-age=31536000, immutable`),
under `ffprobe -show_streams -show_format`:

```
nb_streams=1            codec_type=video  codec_name=h264  1080x1920  30/1
duration=8.000000       (format and stream)
no rotation, no SIDE_DATA block
TAG:major_brand=isom  TAG:minor_version=512  TAG:compatible_brands=isomiso2avc1mp41
TAG:encoder=Lavf59.27.100 / Lavc59.37.100 libx264  TAG:handler_name=VideoHandler  TAG:language=und
```

versus the original's `codec_type=audio`, `codec_type=data`, `rotation=-90`,
`creation_time`, `location=+47.4559-122.1847/`, `com.android.model=Pixel 9`,
`com.android.manufacturer=Google`. So: exactly 8.000 s, no audio stream, no rotation, and
the phone's own metadata is gone — only the container's structural tags remain. The public
bucket holds the three `web.*.mp4` and two `poster.*.jpg` revisions this produced, all
immutable by name.

## 4. Focal point, the interview, the build, SC-013, undo/redo

**Focal point** on the "looking up" photo: the sheet "Where should the crop hold on?",
three ArrowRight and five ArrowUp on the picker, `Save focal point` → the tile's
`object-position` went `50% 50%` → `53% 45%`, and the hero on the canvas used it.

**"help me build her page"** — the very first request logged `read_outline, load_skill`
(build-profile, 2.3 s), then `list_media`, then `view_photos`, then the first question.
`load_skill` fires before any question, as the contract asks. The interview, with my
answers (playing the volunteer, only what the media shows):

| # | CATalyst asked | Turn | I answered |
|---|---|---|---|
| 1 | What is her name? | 12.1 s | Her name is Willow. |
| 2 | How old is Willow? | 5.6 s | She's about 2 years old. |
| 3 | And she's female, right? | 6.4 s | She's female. |
| 4 | What's the first thing people notice when they meet her? | 8.0 s | Her fluffy gray and white coat and calm green eyes… |
| 5 | What's her energy like — a couch cat, an explorer, or somewhere in between? | 5.6 s | Somewhere in between… |
| 6 | How is she around other cats or dogs? | 6.4 s | I haven't seen her with other cats or dogs… |
| 7 | Does she have a daily habit or routine that says something about her…? | 6.4 s | She's got a favorite toy — a small fuzzy mouse… |
| 8 | Is there anything specific she needs in a home…? | 5.6 s | Nothing I can see — no cone, no medication, no limp… |
| — | *proposal* (25.7 s; `load_skill ×3`) | | |

Name, age and sex came as **three separate questions** this time — the 2026-09-11 run's
bundling is gone. Eight questions, then the proposal, verbatim: *"I'll set up Willow's page
with her hero photo, followed by her bio, a gallery of her cozy nap spots, and a video clip
of her on the move. For the tagline, I'll highlight her calm, observant nature and bursts
of play chasing her toy mouse, set against the warm neutral Paper theme. Want me to build
this now?"* No "Build it now" button anywhere; nothing on the canvas changed before the yes.

**"Yes, build it."** — the build turn took 66.4 s end to end and streamed: facts and hero
photo, an empty bio then its text, the gallery (two photos), the video, the tagline, the
Paper theme, then a `read_page`/`read_outline` self-check and the closing line *"Willow's
page is all set up with her hero photo, bio, nap gallery, and hallway video in the Paper
theme."* Receipt: **"Applied — changed name, age, sex; replaced photo; added bio; changed
bio; added gallery, video section; changed tagline; set theme Paper."** Final order
`hero, bio, gallery, video`; facts `Willow · 2 years · female`; tagline "Calm and curious,
with an eye out for her favorite toy mouse." (61/80). The bio (two paragraphs, 140 words)
opens with an action — "Willow will watch quietly from the floor until a toy mouse
skitters by, then dash down the hallway after it…" — the 09-11 run's appearance-first
opening is gone too. `04-built-full.png` shows the whole canvas and the whole thread.

**SC-013 — 13.4 s. FAIL.** A `MutationObserver` installed before Enter recorded the first
change (the hero photo; the name landed in the same render) at **13,404 ms**. The server
log for the same window:

```
14:50:17.0  helper turn  6.6 s  toolCalls [read_outline]                              ← request 1
14:50:23.9  helper turn  6.6 s  toolCalls [set_field, set_field, set_field, replace_image, add_block]
            helper invalid tool input {toolName: add_block, paths: [block.type]}       ← request 2
14:50:26.6  helper turn  2.5 s  toolCalls [add_block]                                 ← the bio block
```

Sent at ~14:50:10.1; hero fill decided at 14:50:23.85 → 13.7 s server-side, matching the
page. The re-sequenced skill from 09-11 (first `add_block` in the hero-fill step) is
working — the `add_block` *is* in that step — but it was malformed and refused, and the
whole step sat behind a `read_outline`-only request. Cause and lever are in bugs 1 and 2.

**No id in any reply** (F21): every assistant message and the panel text were scanned for
`[a-z2-7]{8}` tokens; the only hits were none. **Undo/redo:** one ⌘Z on the canvas reverted
everything — `["hero"]`, name empty; ⌘⇧Z brought all four blocks and "Willow" back.

## 5. Two edits by talking

**"shorten the bio"** → 31.5 s to a card (`05-shorten-card.png`): *PROPOSED · 1 OPERATION —
bio — Shorten the bio. 140 → 101 words — "Shortening the bio replaces your text. You
wrote that paragraph. The original is recoverable with one undo, and only one." — Apply /
Not this / one undo*. The bio on the canvas was untouched while the card waited. `Apply` →
6.9 s later the bio was 101 words and the receipt read "Applied — changed bio." with
`Undo these`.

**"move the video up"** → applied at once, no card: 14.5 s, order
`hero, bio, gallery, video` → `hero, bio, video, gallery`, receipt "Applied — moved video
section.", and the reply spelled out the new order in words. No id in the panel.

## 6. Enhance

The darkest photo (`empvnins`) sat in gallery slot 2, so its cell's `enhance` was used.
The compare (`06-compare.png`) was up in **2.4 s**: "Use the enhanced photo in slot 2 of
the gallery? It changes nowhere else on the page, and one undo brings the original back.
The enhanced copy stays in your library either way." — original left, enhanced right,
divider at 50, focus on `Keep original`. The `Enhanced` radio showed the enhanced side
alone; `Use enhanced` → the slot's `src` changed from
`empvnins/clean.d3444cba7a.jpg` to **`cccvp7hm/clean.9c7e2a7bb5.jpg`**, the cell carried the
`enhanced` badge and `revert to original`, and the rail said "MEDIA · 5 ITEMS".

Private bucket, `profiles/tezvj5ah/media/cccvp7hm/asset.json`:

```
"enhancement": { "sourceMediaId": "empvnins", "recipe": "auto-v1" }
"revisions":   { "clean": "9c7e2a7bb5" }
"alt": the source photo's own description, source "model"
```

## 7. Theme, contrast warning, publish

`Sand` → "contrast check: passes AA". ArrowLeft on the contrast slider until the note
changed: at **0.15** it read **"contrast check: fails — publish will warn"** and `Restore to
passing` appeared in the theme panel (`07-contrast-warning.png`). Pressing it put both
sliders at 0.50 and the note back to "passes AA". `Publish` (1.5 s) asked no contrast
question and toasted **"Willow is live at
<service-host>/cats/willow-tezvj5ah. VIEW PAGE"**;
the topbar button became `Published`; the server logged `published {slug: willow}`.

## 8. The public page

Fresh, cookie-less contexts, desktop 1280×800 and phone 390×844 (`isMobile`):

- `200` in 2.6 s / 1.2 s; `h1` "Willow"; zero cookies set by the visit.
- `<video>`: `muted=true`, `loop=true`, `playsinline=true`, `controls=false`, playing
  (`paused=false`, `readyState=4`), `src` = the `/media/…/web.f507ca7f21.mp4` above; no
  sound/mute/volume button on the page.
- **view-source** (the served HTML, saved as `view-source.html`, 1 line): none of `draft`,
  `updatedAt`, `publishedAt`, `schemaVersion`; the same for the hydrated DOM. No
  `storage.googleapis`, no `original`.
- **Media URLs** (every `img`/`video`/`source` `src`, `poster`, `srcset`): five distinct cat
  media, all on the app origin under `/media/profiles/tezvj5ah/media/…` —
  `cbrs774c/clean.7530d98b1c.jpg` (hero, served through `/_next/image?url=%2Fmedia%2F…`),
  `b66xsu2p/clean.17728c83c9.jpg`, `cccvp7hm/clean.9c7e2a7bb5.jpg` (the enhanced one),
  `t7hywcbq/poster.f3bc7dcfdd.jpg`, `t7hywcbq/web.f507ca7f21.mp4`. **None is an
  `original`**, and none of the actual network requests went anywhere but the app origin.

**SC-004 — LCP, five Lighthouse runs (12.8.2, mobile emulation, simulated throttling:
150 ms RTT, 1.6 Mbps, 4× CPU, headless Chrome on this laptop):**

| run | LCP | TTFB | load delay | load time | render delay | note |
|---|---|---|---|---|---|---|
| 1 | **3.35 s** | 1135 | 599 | 362 | 1256 | ran alongside the step-8 Playwright script |
| 2 | 2.22 s | 644 | 709 | 507 | 359 | |
| 3 | 2.23 s | 653 | 593 | 631 | 351 | |
| 4 | 2.29 s | 1200 | 958 | 83 | 50 | sequential, nothing else running |
| 5 | **3.37 s** | 632 | 0 | 0 | 2742 | sequential, nothing else running |

**Median 2.29 s — under 2.5 s. Two of five over.** The LCP element is the hero `<img>` in
every run (`prioritize-lcp-image` and `lcp-lazy-loaded` both pass; FCP 0.9–1.0 s; TBT
10–30 ms; CLS 0; performance score 0.91 on run 1). Run 5's shape (image fully loaded by
0.6 s, then 2.7 s before it painted) is not a network story. I am reporting this as
marginal rather than a clean pass or fail; a real phone on a real network is the number
that matters (pending below). Reports: `lighthouse-willow.report.html` (run 1, copied to
`.superpowers/sdd/tasks/T048-lighthouse-run1.html`) and `lighthouse-willow-{2..5}.json`.

## 9. `/cats`, `/carousel`, the QR, `/kiosk`

- `/cats`: one card, `Willow — Calm and curious, with an eye out for her favorite toy
  mouse.` with her photo, `href=/cats/willow-tezvj5ah`. (She was the only live cat; Vini
  and Charlotte are drafts.)
- `/carousel`: counter `01 / 01`, Willow on stage over her hero photo with the age/sex pills,
  `Open Willow's page` → her URL, and the QR card ("SCAN — Willow's page — Photos and
  the full story", 180 px at 1440×900). The QR `<svg>` was screenshotted and decoded with
  `jsqr` + `pngjs` (the same pair `tests/e2e/_lib/qr.ts` uses): payload
  **`<service-url>/cats/willow-tezvj5ah`**.
  Opened in a fresh 390×844 mobile context → `200`, `h1` "Willow" (`09-qr-scan-phone.png`).
- `/kiosk?hold=12`: no `header`/`nav`/`footer`, one link, `--hold: 12s` on the stage, and the
  beat parity flipped `a → b` after **11.5 s** — with a single cat the loop re-enters her
  own beat, so the counter stays `01 / 01` (my first script waited for `02 /` and timed
  out; that was the script, not the kiosk).

## 9b. Phone mode with the real model

390×844, `isMobile`, signed in, `/builder/tezvj5ah` (`09b-phone-builder.png`): one column,
`main` 390 px wide, no `aside`, no "Add section" rail, no drag handles, the `Drawers` bar
with `Media` and `CATalyst`, viewport meta
`width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`.

**Tagline:** the Facts fold was open; the tagline was changed twice across two attempts
(the first attempt's script waited for a *visible* "Draft saved" — on the phone that status
is screen-reader-only, so the wait failed even though the save had happened; the second
attempt waited on the text). Final: "Calm, curious, and quick to chase a toy mouse." →
**"Calm and curious, with a soft spot for a toy mouse."**, the topbar status said "Draft
saved", and after a full reload the field read the new line back.

**"add a section about her favourite box"** from the full CATalyst sheet: the send dropped
the sheet to the 48 px peek ("CATalyst is working…"), and 57 s later the peek carried a
question — *"Tell me a little about her favourite box—what kind of box is it, and what
does she like to do with it? Once you share a few details, I can add a quote section
highlighting her habit…"* (`09b-peek-question.png`). Tapping the peek opened Full; I
answered ("It's a plain cardboard shipping box by the window; she naps in it every
afternoon. Keep the section short."), and 66 s later the peek read **"Applied — added
quote; changed quote, attribution; replaced photo."** Order `hero, bio, video, gallery` →
`…, quote`; the new block on the phone canvas (`09b-new-block.png`) is a quote over the
sleeping photo — *"Every afternoon, she curls up for a nap in her favourite cardboard box
by the window." — FOSTER NOTE* — with its two text fields (this phone builder edits in
place; it is not read-only). Server: 18 `helper turn` lines with `surface: "phone"` across the two attempts, three
more malformed `add_block`s along the way (bug 2).

**Undo these:** tapping the peek opened the sheet on the receipt; `Undo these` → order back
to `hero, bio, video, gallery`; draft saved.

## 10. Archive and restore

`published.json` was downloaded from the private bucket before archiving (2,457 bytes).
`Published ▾ → Archive` asked **"Archive Willow? Her page comes down and she leaves the
carousel. Everything is kept exactly as it was."** → `Archived`. Then, from cookie-less
contexts: her URL **`404`** ("This cat isn't listed right now."), `/cats` **"No cats are
listed yet. Check back soon."** with no Willow link, `/carousel` **"Nothing in the
rotation — No cats are on the carousel right now…"**. The private bucket held
`archived.json` + `draft.json` + `media/` and no `published.json`.

`Archived ▾ → Restore` → `Published`; her URL `200` with `h1` "Willow"; `/cats` lists her
again; and `published.json` downloaded again **`Buffer.equals` → true** (2,457 = 2,457
bytes, byte-identical).

## 11. Refusal, unpublish, delete

- Focus the hero's photo tile in the rail, `Delete`, confirm `Remove` → the alert
  **"Willow's live page uses this photo. Unpublish first."** and the tile stayed.
- `Published ▾ → Unpublish` asked **"Take Willow off the site? Her page stops working and she
  leaves the event carousel. Everything you wrote is kept as a draft."** → `Move to draft` →
  toast **"Willow is back to draft. She's off the site and off the carousel. UNDO"**; her URL
  `404` in a fresh context; server `unpublished`.
- `/builder` → `Delete Willow` → **"Delete Willow? Willow's draft and every photo in the
  library are removed. This can't be undone."** → `Delete`. The list then showed only
  `DRAFT Vini` and `DRAFT Charlotte`.

## 12. The buckets

```
$ gcloud storage ls -r gs://<project-id>-cat-profiles-private/profiles/tezvj5ah/
ERROR: (gcloud.storage.ls) One or more URLs matched no objects.
$ gcloud storage ls -r gs://<project-id>-cat-profiles-public/profiles/tezvj5ah/
ERROR: (gcloud.storage.ls) One or more URLs matched no objects.
$ gcloud storage ls gs://<project-id>-cat-profiles-private/profiles/   # and -public: the same two
gs://<project-id>-cat-profiles-private/profiles/b4uxvi2x/
gs://<project-id>-cat-profiles-private/profiles/lbsq3wlo/
```

Nothing left for `tezvj5ah` in either bucket — including the five media folders, the three
web clips and two posters that step 3 produced, and the enhanced copy.

## 13. The logs

`gcloud logging read` over `resource.labels.service_name="south-county-cats-adopt"` from
14:37:00 to 15:09:00 UTC: **2,468 entries** — 826 request-log entries (statuses `200`,
`206` ×16 for video ranges, `304`, one `307`, two `404`s which are the archived and
unpublished visits Cloud Run marks `WARNING`), 76 structured app lines, and 1,566 plain-text
lines.

- **`helper turn`: 62** (44 `surface: full`, 18 `phone`), 80 model steps in all, 343 s of
  model time, 696,190 input tokens and 30,194 output tokens to `gemini-3.8-flash`; **none
  `errored`, none `aborted`**; every `finishReason` is `stop` or `tool-calls`.
- Other structured lines: `helper invalid tool input` ×6 (bug 2), `trim started/finished`
  ×2 each, `published`, `unpublished`, `configuration validated` ×2.
- **No provider error text:** the only "vertex" hits are `MODEL=vertex` in the configuration
  lines; no `GoogleGenerativeAI`, `RESOURCE_EXHAUSTED`, `PERMISSION_DENIED`, `quota`, stack
  traces or `Error:`. (Every "error" substring is the `errored: false` key.)
- **No secret:** no password, `AIza…`, `Bearer`, `private_key`, `-----BEGIN` or session
  secret anywhere; the configuration line prints bucket names, project id, model ids and
  the public URL only.
- **No `console.log` lines.** The plain-text lines are Next's startup banner, one Cloud Run
  scaling line, and **1,558 lines of `(node:1) MaxListenersExceededWarning: Possible
  EventEmitter memory leak detected. 11 error listeners / 11 close listeners`** — bug 3.

## Human-pending (needs a real phone over the internet)

1. **Step 8 on a phone**: open `/cats/<slug>-<id>` of a live cat on a phone over mobile
   data — renders, video silent and looping, and (ideally) a field LCP number. The
   automated proxy passed on a 390×844 mobile-emulated context.
2. **Step 9's QR scan**: point the phone's camera at the carousel's QR → her page. The
   automated proxy decoded the QR payload from a screenshot and opened it in a phone-sized
   context.
3. **Step 9b on a phone**: sign in on the phone and repeat the tagline / one structural
   change / "Undo these" flow. The automated proxy passed on a 390×844 `isMobile` context
   with the real model.

The test cat is deleted, so the human steps need a cat that is live at the time — Vini or
Charlotte once published, or a fresh one.

## What to do next

- **Bug 1 + 2 together** (SC-013): make `add_block`'s arguments land on the first try (the
  six failures name `block`, `block.type`, `block.mediaId`, `block.text` — the schema shape
  the model keeps getting wrong is worth a look in `build-profile.md` and the tool
  description), and look at why the build turn opens with a read-only request when the
  skill already told it what to do. Then re-measure SC-013 over the ten attempts its
  wording asks for.
- **Bug 3**: find the second `MaxListeners` source (document reads / the helper route, not
  media streams) — 63% of the service's log volume is this warning.
- **SC-004**: a field measurement from a real phone; if it is also around 2.3 s the margin
  is thin enough to be worth a look at the fonts (four `woff2` files load ahead of the hero
  image) and the hero's `_next/image` hop.
- **Finding 5**: the clip describer's "tabby".
