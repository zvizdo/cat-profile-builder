# First real-model run on Vertex — 2026-09-11

Task T037. This is the first time the helper and the describer talked to a real Gemini model
instead of the fake one. Everything below is what actually happened, watched in a real
browser, not what the code is supposed to do.

## Setup

- Drafting model (helper): `gemini-3-flash-preview`, describer: `gemini-2.5-flash-lite` (both
  `.env.example` defaults, unchanged).
- `GOOGLE_CLOUD_PROJECT=<project-id>`, `VERTEX_LOCATION=global`, `STORE=fs`, `LOG_LEVEL=debug`.
- Credentials: existing Application Default Credentials for `<project-id>` — no login step
  needed, no `GOOGLE_VERTEX_API_KEY` set anywhere.
- New cat created fresh for this run (`/builder/xwofkrvu`), so nothing here reuses an older
  cat's data.

## 1. Uploads and the real descriptions

Three JPGs and the 10-second clip from `test-media/` were uploaded together. The three photos
came back with real alt text (screen-reader-style descriptions, not captions) within a few
seconds:

1. `PXL_20260622_022941724.jpg` — "A long-haired gray and white cat lies on a wooden floor,
   looking up with green eyes. A pet carrier sits behind the cat."
2. `PXL_20260630_022313665.jpg` — "A fluffy gray and white cat is sleeping comfortably on a
   gray couch, partially covered by a white blanket. The cat is lying on its back with its
   eyes closed and paws relaxed."
3. `PXL_20260704_000044372.jpg` — "A fluffy gray and white cat sleeps peacefully, its paw
   resting on a teal shirt. The cat is lying down with its eyes closed."

**Judgement: yes, these are alt text.** Each is one or two plain sentences describing what is
literally visible — pose, colouring, setting — with no adjectives doing marketing work
("sweet," "adorable"), no invented backstory, and no attempt to sell the cat. They read exactly
like what a screen reader should say in place of the image, which is what `DESCRIBE_PROMPT` in
`src/adapters/vertex/describer.ts` asks for.

**The video did not get a description**, and this is expected, not a bug. The tile said "We
couldn't write a description for this one," and the debug log shows why:

```
{"level":"warn","reason":"not-in-cloud-storage","msg":"describer failed"}
```

`src/adapters/vertex/describer.ts` (`describeVideo`) explicitly checks for this: with
`STORE=fs`, a clip's URI is `file:///…`, and Vertex (running in Google's cloud) cannot open a
path on this laptop. The code comment calls this "a deployment mismatch, not a model failure,"
and the volunteer's path is exactly what the UI showed — write the description by hand. I
watched a frame of the clip (`ffmpeg` grab, not shown to the model) and wrote: "A gray cat runs
across a hardwood floor toward a small fuzzy toy, caught mid-stride and motion-blurred." This
never touched Vertex — it's the fallback path working as designed. **This only shows up when
`STORE=fs` + `MODEL=vertex` are combined, which is exactly this run's configuration** — in a
real deployment (`STORE=gcs`) the video describer would get a real `gs://` URI and this
wouldn't happen. Worth knowing, not worth "fixing" here.

## 2. The interview — tool order and the questions

Debug log confirms the very first thing the model does, before any question, is exactly what
the contract promises:

```
step 0: read_outline
step 0: load_skill        (build-profile, confirmed by the follow-up questions matching its bank)
step 1: list_media
step 0: view_photos
step 1: [] (finishReason: stop)  → first question
```

So `load_skill("build-profile")` fires immediately after `read_outline`, before the model has
seen a single photo or asked anything — matches the brief's requirement.

**Plumbing note, scoped to this opening sequence only**: `read_outline` on its own became one
HTTP request to `/api/helper/chat`; `load_skill` then `list_media` chained into a second
request as two steps; `view_photos` then the first question chained into a third. The four
text-read tools (`read_outline`, `read_page`, `read_blocks`, `list_media`) and `view_photos`
have no server `execute` per `src/core/helper/tools.ts`, so answering them needs the browser,
which plausibly explains why `read_outline` alone ends a request while `load_skill`
(server-`execute`) chains freely. **I can't generalize this rule further** — later in the build
phase, two `add_block` calls (also no-`execute`) chain within one request (log lines 89–90) and
three more chain within the next (94–96), which the "no-`execute` ends the request" theory
doesn't explain. Tracing `helper-stream.ts`'s actual resumption logic would be needed to explain
the build-phase chaining; I haven't done that here, so I'm only claiming the pattern for the
opening sequence quoted above, not as a general rule.

### Questions asked and my answers (playing the volunteer, describing only what's visible)

1. **"She looks like a real sweetheart! I see she's a fluffy gray and white girl who loves a
   good nap on the couch. To get started, what is her name, how old is she, and is she female
   or male?"** → "Her name is Willow, she's about 2 years old, and she's female."
   — **This bundles three separate questions into one message**, which the skill explicitly
   forbids ("Never ask two things in one message"). Flagged below under prompt changes.
2. "What's the first thing people notice when they meet Willow?" → "Her fluffy gray and white
   coat and calm green eyes — she's the kind of cat people want to pet immediately."
3. "How is she around other cats or dogs?" → "I haven't seen her with other cats or dogs — no
   other animals show up in any of the photos or the clip."
4. "Does she do well with kids, or would she be happier in a quiet, adult-only household?" →
   "I haven't seen her around kids, so I honestly don't know. She stays pretty relaxed in
   general — a robot vacuum ran right past her in the video and she barely reacted." (I did see
   a Roomba running in the room in the clip; whether the cat's run was a reaction to it or just
   play is my own inference, not something I could be fully certain of from a single frame —
   noted for honesty, since the bio later repeats this framing.)
5. "What's her energy like—is she mostly a couch cat, an explorer, or somewhere in
   between? (I see photos of her sleeping but also that clip of her running for a toy!)" →
   "Somewhere in between — she naps a lot, but she'll get up and chase a toy across the floor
   when something catches her interest." (Good adaptation to the actual media, exactly what the
   skill asks for.)
6. "Any medical needs or special care a new owner should plan for?" → "Nothing I can see — no
   cone, no medication, no limp, nothing like that in any of the photos or the clip."
7. "Is there a specific daily habit or routine she has—like a favorite window for sunbathing or
   a particular game she never gets tired of?" → "She's got a favorite toy — a small fuzzy one
   she'll chase across the floor when she's in the mood to play."
8. "Is there a photo or clip here that you think captures her personality best?" → "The video —
   it shows her personality best, chasing that toy across the floor."

Eight distinct question-turns (nine questions counting the bundled first one), well inside the
five-to-ten range, so "Build it now" was never needed — the model moved to building on its own
after my eighth answer.

## 3. Timing (SC-013: first block ≤ 5 s)

**Method used, and why**: I first tried a client-side `performance.now()` `MutationObserver`
(recording `t0` at send, `tFirst` when the canvas gained a new section beyond the pre-existing
Facts+Hero). That gave **15.3 s**, but I don't trust that number — recording `t0` and pressing
Enter were two separate Playwright/MCP tool calls, and the gap between them (waiting on the
automation tooling itself, not the app) inflates the result. The debug log's server-side
timestamps aren't subject to that problem, so I used those instead:

- `1789189360195` — server receives the request containing my last answer ("The video — it
  shows her personality best…").
- `1789189364414` — model finishes its first step: fills name/age/sex, replaces the hero
  photo, and loads the `write-bio` skill (all in one step, 4.2 s of Gemini generation time —
  five tool calls decided in one completion).
- `1789189368357` — model decides the **first `add_block`** (the bio block) in the very next
  request, 3.9 s later.

**SC-013's actual wording is a statistical bar, not a single pass/fail**: "…within five
seconds… in **at least nine of ten attempts**." One run is one sample. It cannot itself
establish or refute 9-in-10 compliance — it can only show that a miss is *possible*, which this
run does. So, reframed as one data point rather than a verdict:

- **One sample, measured against "first `add_block`": 8.2 s** (368357 − 360195) — over the 5 s
  target. The architectural reason (a real build turn needs two sequential Gemini round-trips —
  hero-fill-and-skill-load, then the first `add_block` — before anything past the hero can land,
  and each round trip to a real model costs several seconds) is a fair basis for expecting this
  to recur close to 10/10 times *specifically on the first turn of a build*, but that's an
  inference from the mechanism, not something one run measures directly.
- **The same sample, measured against "hero fill" instead: 4.2 s** (364414 − 360195) — inside
  the 5 s target. `build-profile.md` itself calls the hero "already there at `blocks[0]`," and
  FR-080 is worded around the page "assembl[ing] visibly on the canvas as it is produced, rather
  than behind a wait" — not specifically the `add_block` tool. Read that way, the hero's photo
  and facts landing is itself "the first block appearing," and by that reading this run passes.

**Which of those two readings SC-013 means is unresolved, and I'm not deciding it here** — that's
for the spec owner. Three options, with their costs:

1. **Keep "first block" = first `add_block`, change the skill** so it's decided in the same
   model step as the hero fill instead of the next round trip (both are already
   server-`execute`-chainable candidates per `tools.ts`). Cost: a `build-profile.md` step-4
   rewrite and a re-test against the real model; risk that an empty/placeholder block landing
   before its content is filled reads as broken rather than fast; doesn't reduce the real ~4.2 s
   Gemini decision latency, only moves which artifact crosses the line first.
2. **Carve out the first build turn** as its own, more lenient criterion, since a later
   single-block edit wouldn't pay this run's two-round-trip tax. Cost: a spec change needing
   sign-off, and picking a *responsible* number needs the ≥10-attempt sample SC-013's own
   wording already demands — this run's 8.2 s is enough to flag that 5 s is wrong for this case,
   not enough on its own to pick a replacement number.
3. **Redefine "first block" to include the hero fill**, matching this run's 4.2 s (a pass).
   Cost: cheapest, no code change — but it's a definitional change proposed right after a miss
   on the other definition, so it needs to be justified on its own merits (it plausibly is, per
   FR-080's "visible progress" wording) rather than as a way around the miss; and it doesn't make
   the actual content (bio, video, gallery) land any faster than 8.2 s, so if the criterion is
   meant to guarantee *meaningful* content quickly rather than any visible change at all, this
   option satisfies the letter without moving the thing volunteers actually wait for.

I'm not picking one of these — only laying out the options and costs for whoever owns the
spec's intent.

**Decision (2026-09-11)**: The spec owner chose to count the hero fill as the first change
(SC-013 reworded) and to re-sequence the skill so the first section is added in the hero-fill
step. `build-profile.md` now decides the first `add_block` (an empty bio block, filled by
`write-bio` next) in the same model step as the hero fill, and SC-013 is reworded so the first
change to the page — the hero's facts and photo, or a new section — is what counts, scoped to
the volunteer finishing the interview rather than any AI-generated draft. See spec.md SC-013
and the updated skill.

## 4. Verifying the build

**Undo is one step.** Pressing ⌘Z once reverted *everything* from the turn — name, age, sex,
hero photo, tagline, and all three added blocks (bio, video, gallery) — back to the empty
draft, in a single keystroke. ⌘⇧Z restored all of it exactly. The panel's turn-summary line
read: *"Helper: changed name, age, sex; replaced photo; added bio, video section, gallery;
changed tagline; set theme Paper"* — one history entry as promised (FR-036/FR-041).

**Bio (verbatim):**

> Willow is the kind of cat who stops people in their tracks with her fluffy gray and white
> coat and calm green eyes. She is often found curled up for a nap on the couch, but she has a
> playful side that comes out whenever she spots her favorite fuzzy toy. When the mood strikes,
> she'll spring into action and chase it across the floor. She is notably unfazed by the
> bustle of a household; even a robot vacuum passing right by her doesn't seem to break her
> concentration. Willow hasn't met other cats or dogs yet, but she is a relaxed presence who
> enjoys being petted and spending quiet time near her people.

114 words, one paragraph — within the 80–160 word target. No sad-story framing, no "sweet
girl looking for her forever home," no exclusionary language. **One deviation from
`write-bio`**: the skill says to open with something she *does*, not a fact sheet of
appearance — this opening sentence leads with her coat and eye colour rather than an action.
It's not a bad sentence, but it's an appearance-first opening where the skill asks for a
moment-first one. Everything else — behaviour over adjectives, the honest "hasn't met other
cats or dogs yet" framed forward instead of as a warning, one concrete detail per sentence — 
follows the skill closely.

**Tagline (verbatim):** "A calm, fluffy companion with a playful streak." — 47 of 80
characters, same voice as the bio.

**Theme:** kept the default **Paper** preset, but raised warmth from 0.50 to 0.60 (contrast
left at 0.50, "contrast check: passes AA" the whole time). `load_skill("pick-theme")` was
called before `set_theme`, matching the contract.

**End-of-turn check:** yes — `read_outline` then `read_blocks` were called right before the
final message, and the model's closing text was: *"I've finished building Willow's profile.
I've added her details, a bio that highlights her calm but playful personality, her
toy-chasing video, and a gallery of her napping. I also applied a warm 'Paper' theme to match
the photos. Summary: Built Willow's profile with a hero section, bio, toy-chase video, and
napping gallery in a warm Paper theme."* — names the sections and the theme, as the skill asks.

**Blocks added, in order — read from the persisted document itself**
(`.data/private/profiles/xwofkrvu/draft.json`), not just the transcript:

```
blocks[0]  hero    mediaId: gac7unfi   (the "looking up with green eyes" photo)
blocks[1]  bio     "Who she is" — the 114-word paragraph quoted above
blocks[2]  video   mediaId: tejcg2pn   (the 10 s clip)
blocks[3]  gallery mediaIds: [6xjvg652, danv4bai]   (both remaining sleeping photos, one block)
```

Four blocks total (hero + 3), matching the panel's turn-summary ("added bio, video section,
gallery") and the full-page screenshot (§5). No gallery-for-one-photo, no day/needs/quote
blocks invented without material — matches "don't add a block type the answers and media don't
support."

**Reconciling that against the log: six `add_block` tool calls, only three surviving blocks.**
`grep -n '"add_block"'` on the debug log returns six hits — lines 89, 90, 94, 95, 96, and 109
(using `.superpowers/sdd/tasks/T037-dev-vertex.log`'s line numbers) — not three. Three
add_block calls therefore did not end up as blocks in the final document. What the evidence
does and doesn't establish:

- **No `remove_block` call appears anywhere in the log** (`grep -o '"toolCalls":\[[^]]*\]' | sort
  | uniq -c` shows only `add_block`, `list_media`, `load_skill`, `read_blocks`, `read_outline`,
  `set_field`×2-group, `set_theme`, `view_photos`, and empty arrays — no `remove_block` at all).
  So a block that was actually applied can't have quietly disappeared; the three "extra" calls
  must never have been applied in the first place.
- **The server log can't show which three, or why**, because it only records tool *names* per
  step (`"toolCalls":["add_block"]`), never the arguments (`block.type`, `mediaIds`, `index`)
  or the applied/declined/rejected outcome — that status is decided client-side via
  `addToolOutput` and is never printed to this log with the words "applied" or "rejected"
  (confirmed: `grep -i "rejected\|declined\|applied"` on the full log returns nothing, in either
  direction — it's not proof nothing was rejected, it's the log format not capturing outcomes
  at all).
- **My best-supported guess, not a certainty**: `add_block`'s schema (`AddBlockOperationSchema`
  in `src/core/profile/operations.ts`) requires the new gallery's `mediaIds` up front — there's
  no separate "create empty gallery, then add photos" step — and `checkMedia` refuses any id
  that isn't an owned photo of the right kind. Five of the six calls land in two back-to-back
  bursts (2 in one request, 3 in the next) right where the gallery would need to be built, which
  is consistent with (but does not prove) one or more early gallery attempts being refused —
  e.g., for referencing the video's id or a not-yet-visible photo id — before a correct
  two-photo `add_block` landed. The sixth call (line 109) fires *after* a
  `read_outline → set_field → read_blocks` self-check (lines 100–106) and also doesn't survive;
  it's most likely another attempt at the same block, reconsidered or refused, rather than a
  fourth section that was later removed (there's no removal tool call to have done that).
- **What would settle this for certain**: logging each edit tool's arguments and its
  applied/declined/rejected outcome, not just its name. That's a real gap in what this run's
  log can prove — flagged as a suggestion below, not fixed here.

**"Nothing was rejected" (§4 originally) needs a correction.** I can no longer claim that from
the server log alone — the log's `grep -i rejected` returning nothing is explained by the log
format never printing that word, not by every call succeeding. The only thing provably true is
that the *client-visible* result was clean: no error banner appeared in the helper panel, no
console error, and the final document is well-formed. Whether one or more of the six
`add_block` calls specifically received a `{status: "rejected", reason: ...}` and the model
silently retried is plausible and unresolved by this run's evidence.

## 5. Screenshots and console

- Finished canvas, **top of page only**: `.superpowers/sdd/tasks/T037-canvas.png`. This one
  shows just the Facts card and the Hero (name/age/sex, photo, tagline) — it does **not** show
  the Bio, Video, or Gallery blocks described in §4; those claims rested on live observation in
  the browser, not on this image.
- Finished canvas, **full page**: `.superpowers/sdd/tasks/T037-canvas-full.png` — added in this
  revision. The canvas sits in an internally-scrolling `<main>` element, not the page body, so
  a plain `fullPage` screenshot at normal viewport height doesn't reach it either; this one was
  taken after resizing the browser to 1280×2100 (main's `scrollHeight` then equalled its
  `clientHeight`, confirmed via `browser_evaluate` before shooting) so every block rendered
  without internal scroll. It shows all four blocks in the order given in §4: Facts+Hero, Bio,
  Video, Gallery — matching `draft.json` exactly.
- Helper panel (first four chat turns + the pinned turn-summary card only):
  `.superpowers/sdd/tasks/T037-panel.png`. It does **not** show the closing message or the bio
  text — those are transcribed verbatim from the live transcript in §2 and §4, not photographed.
  The tagline is visible in this screenshot and matches the transcribed value exactly.
- Browser console since navigating into this cat's builder page: **zero errors, zero
  warnings.** (An unrelated batch of stale WebSocket/HMR errors showed up under
  `browser_console_messages --all`, but those came from leftover browser tabs open on other
  cats from earlier sessions, not from anything in this run.)

## 6. No leaked content in the debug log

- `grep -i "page-content"` on the full log: no matches.
- Searched for any base64-looking run of 200+ characters: no matches.
- The system prompt is logged in full on every request (by design, at `debug` level) and
  contains no page content, no media table, and no image data — only the fixed instructions
  and skill list, exactly as the contract describes ("no page content, no media table, and no
  photos are placed in the request").

## Cost-relevant facts

- 22 separate `POST /api/helper/chat` requests for the one interview-and-build turn, totalling
  28 individual Gemini `generateText`/step calls to `gemini-3-flash-preview` (drafting model).
- 3 successful calls to `gemini-2.5-flash-lite` (describer), plus 1 short-circuited attempt
  (video) that never reached the API.
- Total real model calls this run: **31** (28 drafting + 3 describing).

## What the prompt or skills should change

1. **`build-profile.md`, step 2 (the interview): the model bundled three questions (name, age,
   sex) into one message on its very first turn**, directly against "Never ask two things in
   one message." The skill already lists name/age/sex as one bullet point in the question
   bank ("Name, age, and whether she's female or male, if not obvious already") — that
   phrasing reads as one bundled question to the model. Suggest splitting it into its own
   explicit instruction: *"If none of name, age, or sex is known, ask for them as their own
   turns, not combined into one question — even though they're one bullet in the bank below."*
   This is the one clear rule violation in this run and the most concrete, fixable thing here.
2. **`write-bio.md`'s opening guidance could be more forceful about appearance vs. action.**
   The model's opening sentence here is well-written but leads with coat colour and eye colour
   — appearance, not a scene. The skill already says "Start with something she does, not a fact
   sheet," but coat/eye descriptions apparently don't register to the model as "a fact sheet."
   Consider adding a negative example alongside the positive guidance, e.g.: *"An opening built
   from her coat colour or eye colour is still a fact sheet, even if it's phrased as a moment —
   put her in an action instead."*
2b. Relatedly: consider whether "Name, age, and whether she's female or male" should actually
    be pulled out of the bulleted bank entirely and stated as a fixed first step ("always ask
    these three separately before anything else"), since every build will need them and
    bundling is the obvious failure mode for a model treating one bullet as one turn.
3. **SC-013 (≤ 5 s, 9-in-10) needs a spec-owner decision, not a prompt fix** — see §3 above for
   the full framing (one-sample caveat, the "first block" ambiguity, and three options with
   costs). Not repeating the options here; flagging that this exists.
4. **The `describeVideo` STORE=fs/MODEL=vertex mismatch is working exactly as designed** and
   needs no prompt change. Correction from the first version of this note: the right place for
   this callout is **`references/project/adr/006-video-processing.md`** (already documents the
   `gs://` file-part dependency and the exact `STORE=fs`+`MODEL=vertex` failure mode at
   lines 46–48), with a one-line cross-reference from
   **`references/project/adr/015-bucket-layout-and-draft-persistence.md`** (line 127, where the
   filesystem adapter's `file:///…` URI is defined) — not ADR-003, which is only about model
   IDs and has no deployment content. On rereading both ADRs for this correction, ADR-006 and
   ADR-015 already state this plainly and already cross-reference each other, so there may be
   nothing left to add here beyond confirming the pointer — worth a quick check by whoever picks
   this up before writing new content.
5. **Log each edit tool's arguments and outcome, not just its name.** This run's `add_block`
   reconciliation (§4) hit a real evidence gap: the debug log records `"toolCalls":["add_block"]`
   per step but never the operation's arguments or whether the browser answered
   `applied`/`declined`/`rejected`. Six `add_block` calls happened this run and only three
   blocks survived; I could reconstruct *that* fact from the persisted `draft.json`, but not
   *why*, or which three didn't make it. A debug-level log line per tool result (tool name,
   a hash or short form of its arguments, and the outcome) would make the next run's reconciliation
   provable instead of inferred.

## Status

All steps completed. Vertex calls behaved correctly (no auth/quota/model-id errors), so no
retries were needed and nothing is blocked.
