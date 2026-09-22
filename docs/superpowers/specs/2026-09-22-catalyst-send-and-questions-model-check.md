# CATalyst: send button and personalised questions — real-model check

Date: 2026-09-22 · Model: Vertex AI (`gemini-3.8-flash` drafting, `gemini-2.5-flash-lite`
describer), project `as-dev-anze`, location `global` · Spec:
`docs/superpowers/specs/2026-09-22-catalyst-send-and-questions-design.md` (Parts 2 and 3)

**Waiver — Spec Kit workflow.** This change used a Superpowers spec
(`docs/superpowers/specs/2026-09-22-catalyst-send-and-questions-design.md`) and plan
(`docs/superpowers/plans/2026-09-22-catalyst-send-and-questions.md`) instead of the Spec Kit
pipeline (`/speckit-specify` → … → `/speckit-converge`), at the project owner's explicit
request on 2026-09-22. Reason: a small, three-part change to existing helper behaviour.
Rejected alternative: the full Spec Kit pipeline, including `/speckit-converge` as the
definition of done; completion is instead the gates in Step 1 plus the real-model check.

## How it was run

`STORE=fs MODEL=vertex GOOGLE_CLOUD_PROJECT=as-dev-anze VERTEX_LOCATION=global
DATA_DIR=.data-modelcheck SHELTER_USERNAME=volunteer SHELTER_PASSWORD_HMAC=<e2e fixture>
SESSION_SECRET=e2e-session-secret-not-a-secret PUBLIC_BASE_URL=http://localhost:3000 pnpm dev`,
driven in Chromium through the Playwright MCP tools at 1440×900 (case 6 at 390×844). The
scratch data folder was deleted afterwards. Timings are wall-clock from the click (or Send) to
the end of the turn ("CATalyst is working…" gone). Tool calls are from the server's per-request
turn log (`msg: "helper turn"`), one line per model request.

What the fixture photos actually show (read by hand): `cat-1.jpg` — a grey-brown tabby peeking
round a door frame onto a wooden floor, tiles in front; `cat-2.jpg` — the same tabby lying in a
suction-cup window hammock ("…er Lazy Day zzz" on the frame), a car and a red shrub outside;
`cat-3.jpg` — the tabby loafing, paws tucked, on a white windowsill looking out at a fenced
yard, raindrops on the glass.

## Result summary

| Case | Round 0 (as committed in Task 2) | Round 1 (after rewording) | Round 2 (second rewording) | Round 3 (source rules moved) |
|---|---|---|---|---|
| 1 Photos, little text | **Fail** — bio stated photo guesses | **Fail** (corrected after review; was recorded as Pass) | **Borderline** — one mild frequency stretch | not re-run |
| 2 Well-filled page | Pass | Pass on its criterion; same photo-scene stitching as case 1 (corrected note) | Pass; one "once she has eaten" link | not re-run |
| 3 Shorten | Pass | Pass (regression re-run) | not re-run | not re-run |
| 4 Build the page | **Fail** — 2 of 6 interview questions pointed at photos | **Pass** — 4 of 6 | Pass on questions and the yes; FR-080 1 of 2; build bio invented "Between naps" and turned "never met a dog" into "never lived with dogs" | **Borderline** — the round-2 faults are gone (no dog claim, kids left out); four small stretches remain; FR-080 **fail** (hero 14.7 s) |
| 5 "Just write it" | Pass (but bio full of photo guesses) | Pass, bio frame-only | Pass — "they", frame-only | not re-run |
| 6 Phone (optional) | — | Pass | not re-run | not re-run |

Two rewording rounds were used (Step 4). Round 1's case 1 verdict was corrected after the
task review; see "Round 2" for the second rewording and its results. Round 3 is not a third
rewording of the wording: it moves write-bio's existing source rules out of the section a
build skips (final-review finding), and re-runs case 4 only.

---

## Round 0 — the skill text as committed at cb8be5d

### Case 1 — photos, little text (cat `mlvpby4a`, name "Mila" + three photos)

Click "Write a bio" → first question: **12.4 s**.
Turn log: `[read_outline, load_skill]` 2.0 s · `[read_page, list_media]` 2.3 s ·
`[view_photos]` → stop, 7.8 s.

> **CATalyst:** I see Mila resting in a window hammock in one photo and tucked onto a
> windowsill in another. Is window watching one of her favourite daily routines, and what
> catches her attention out there?

> **Volunteer (Send):** Yes, the window is her spot. She chatters at the birds at the feeder
> every morning.

3.9 s; turn log `[]` → stop (no new reads).

> **CATalyst:** That morning bird chattering is wonderful.
>
> How is Mila around other pets or people in the house—has she lived with other cats, dogs,
> or kids, or does she seem to prefer a quieter environment?

> **Volunteer (Send):** She shares her foster home with one calm older cat and they mostly
> ignore each other. I don't know about dogs or kids.

26.5 s; turn log `[add_block, add_block]` 14.1 s · `[read_outline]` · `[read_blocks]` · `[]`.

> **CATalyst:** I have added Mila's bio to the page: *(bio below)* Take a look and let me know
> if you’d like to tweak any details!
>
> Applied — added bio.

Bio written:

> Mila starts her mornings stationed at the window, chattering at the birds visiting the feeder
> outside. Once the morning rush dies down, she settles into her window hammock to keep watch
> over the yard or tucks her paws in for a long midday nap in the sun.
>
> In her foster home, she shares space with a calm older cat, and the two are content to simply
> mind their own business and share a room in peace. She would do well in a relaxed household
> that gives her a sunny perch of her own and a quiet routine to settle into.

- 1–3 questions, one per message: **pass** (2).
- At least one names something in the photos: **pass** (hammock, windowsill).
- Answering triggers no second look: **pass** (`toolCalls: []` on the first answer; only
  writes and re-reads on the second).
- Bio states nothing that was only an unconfirmed photo guess: **fail** — "Once the morning
  rush dies down", "tucks her paws in for a long midday nap in the sun" and "a sunny perch"
  come only from the photos and say more than the frames show.

**Case 1, round 0: FAIL.**

### Case 2 — well-filled page (cat `bck5viba`, "Pepper")

Setup: name Pepper, age "2 years", sex female; three photos, cat-2 as hero; a Quote block
"Every morning at six she sits on my chest and taps my cheek with one paw until I get up and
fill her bowl." — Her foster; a Needs card "A home without dogs" / "She prefers a home without
dogs — she hides under the bed for hours when one visits."; a Photo block (cat-3) captioned
"Her favourite game: she bats a bottle cap across the kitchen floor, then waits for you to kick
it back."

Click "Write a bio" → bio written, **28.1 s**, no question. Turn log: `[read_outline,
load_skill]` · `[read_page, list_media]` · `[view_photos, add_block, add_block]` 17.3 s ·
`[read_outline]` · `[read_blocks]` · `[]`.

> **CATalyst:** I've written and added a bio for Pepper just below the hero section: *(bio
> below)* Let me know if you would like to tweak any details or add anything else about her
> personality!
>
> Applied — added bio.

> Every morning at six, Pepper climbs onto your chest and taps your cheek with one paw until
> you get up to fill her bowl. Once breakfast is settled, she invents her own games: batting a
> bottle cap across the kitchen floor, then waiting patiently for you to kick it back. Between
> rounds, she spends her day curled on a sunny windowsill or stretched out in her window
> hammock watching the yard.
>
> At two years old, she is calm and observant, but dogs are too much for her—a visiting dog
> sends her under the bed for hours. She needs a dog-free home where she can settle into her
> daily routine and claim every windowsill in peace.

**Case 2, round 0: PASS** (no question). Note: the same photo-guess habit as case 1 ("curled on
a sunny windowsill", "calm and observant").

### Case 3 — shorten (same cat)

Typed "Shorten the bio", clicked Send → card after **11.1 s**. Turn log: `[set_field]` only —
no question, no reads.

> PROPOSED · 1 OPERATION · bio · Shorten the bio. · 115 → 69 words

Proposed text:

> Every morning at six, Pepper taps your cheek with one paw until you get up to fill her bowl.
> When she isn't watching the yard from her window hammock, she bats bottle caps across the
> kitchen floor and waits for you to kick them back. Dogs are too much for her—a visiting dog
> sends her under the bed for hours—so she needs a dog-free home where she can relax.

**Case 3, round 0: PASS.**

### Case 4 — build the page (cat `frqzghjr`, three photos only)

Click "Build the page" → first message **14.0 s**. Turn log: `[read_outline, load_skill]` ·
`[list_media]` · `[view_photos]` → stop.

| # | CATalyst | Volunteer | Points at a photo? |
|---|---|---|---|
| — | What is this cat's name? | Juniper | (fact) |
| — | How old is Juniper? | About 3 years | (fact) |
| — | Is Juniper female or male? | Female | (fact) |
| 1 | In one photo, Juniper is peeking cautiously around a doorway. Does she take a little time to warm up to new spaces and new people? | Yes, she hides for the first day, then follows you from room to room. | yes |
| 2 | She has two photos by the window—one loafing on the sill and another resting in a window hammock. Is bird-watching or looking outside a big part of her daily routine? | Yes, she spends hours in the hammock watching the squirrels in the maple tree. | yes |
| 3 | How does she do around other cats or dogs? | She's fine with calm cats but has never met a dog. | no |
| 4 | How does she like to receive affection—is she a lap cat, or does she prefer to sit nearby and be petted on her own terms? | Not a lap cat. She sits beside you on the sofa and head-butts your hand. | no |
| 5 | Does she do well with kids, or would she thrive best in a quieter, adult household? | I don't know about kids. | no |
| 6 | Does she have a favorite toy or playful habit, or is she strictly about resting and observing? | She chases hair ties down the hallway and brings them back. | no |

Every answer turn logged `[]` (no reads). The proposal (31.5 s, `[load_skill ×3]`):

> I have everything I need to put Juniper's page together.
>
> Here is what I plan to build:
>
> - Hero featuring her calm window-hammock photo, filled with her name, age, and sex
> - Bio capturing how she warms up into a loyal shadow, her love of window watching, and her
>   hair-tie fetch game
> - Photo of her peeking around the doorway to show her gentle, curious start in a new room
> - What she needs cards detailing a patient first day, good window perches, and calm animal
>   companions
> - Quote from her foster about sofa head-butts paired with her windowsill photo
>
> I'll set the tagline around her window-watching routine and hair-tie games, and use the warm
> neutral paper theme to match her daylight photos.
>
> Want me to build this now?

"Yes" → first change (name) at **7.5 s**, hero photo at **8.3 s** (250 ms polling), turn over at
67.4 s. No question after the yes. Blocks: hero, bio, photo, needs, quote.

> I've built Juniper's profile using the warm Paper theme, featuring a hero, bio, doorway
> photo, home needs cards, and a foster quote with her windowsill picture.
>
> Applied — changed name, age; replaced photo; added bio; changed sex; added photo section,
> "What she needs" section, quote; changed bio, tagline; set theme Paper.

Bio:

> Juniper spends her mornings in her window hammock, keeping an eye on the squirrels in the
> maple tree outside. When she isn't watching the yard, she plays fetch, chasing hair ties down
> the hallway and carrying them straight back to drop at your feet. She isn't a lap cat, but
> once she settles in, she'll sit beside you on the sofa and head-butt your hand whenever she
> wants attention.
>
> In a new place, Juniper usually tucks herself away for the first day before venturing out
> and following you from room to room like a shadow. She shares her space easily with calm
> cats, though she has never met a dog, and her history with children is unknown.

- Most interview questions point at the photos: **fail** — 2 of 6.
- No question after the yes: pass. Bio written with no question: pass.
- FR-080 (first block within 8 s of the yes): pass on the first change (7.5 s); the hero
  photo itself landed at ~8.3 s.

**Case 4, round 0: FAIL** (the photo-question criterion).

### Case 5 — "just write it" (cat `ni5i6dgw`, photos only)

Click "Write a bio" → first question **18.1 s**. Turn log: `[read_outline, load_skill]` ·
`[read_page, list_media]` · `[view_photos]` → stop.

> **CATalyst:** I noticed in two of the photos that they're perched right by the window—one
> loafing on the sill and another lounging in a window hammock.
>
> What is their name, and what do they spend their time watching or doing around the house?

> **Volunteer (Send):** just write it

22.0 s, no further question. Turn log: `[add_block, add_block]` 15.1 s · `[read_outline]` ·
`[read_blocks]` · `[]`.

> **CATalyst:** I've written a bio based on the photos and added it to the page: *(bio below)*
> Whenever you're ready, you can let me know their name, age, sex, or any specific details
> about how they get along with other pets, and we can easily tune the text.
>
> Applied — added bio.

> A typical morning starts at the glass. This tabby settles neatly onto the windowsill with
> paws tucked beneath them, tracking whatever moves across the backyard. When it is time to
> nap, they move up to the window perch, resting their chin right over the edge to keep one
> eye on the room and the other on the sun. They navigate the home with quiet curiosity,
> peeking around doorways and pausing on the threshold before deciding where to settle next. A
> warm windowsill, a soft perch, and an open view of the outdoors are all they need to feel
> right at home.

**Case 5, round 0: PASS** on its criterion (wrote at once). But the bio is mostly photo guesses
stated as fact ("A typical morning starts at the glass", "quiet curiosity", "all they need").

---

## Step 4 — the rewording (round 1)

Two failures, two wording changes, nothing else touched. Every phrase pinned in
`tests/unit/core/helper/skills.test.ts` is unchanged and still on one line.

**`write-bio.md`**, after "Photos show; they don't prove." (fixes case 1, and the same habit in
cases 2 and 5):

> This holds for every sentence you write, including after "just write it". From a photo alone
> you may say where she is and what she's doing in that frame — "she loafs on the sill with her
> paws tucked in." You may not add when, how often, why, or how she feels about it — "every
> morning," "a long nap in the sun," "she loves the view," "calm and observant," "all she
> needs." Those come only from the page or from the volunteer's own words. Before you save,
> check each sentence: if its only source is a photo and it says more than the frame shows, cut
> it. A shorter bio that is true beats a fuller one that guesses.

**`build-profile.md`**, in "3. The interview" after the photo-question example (fixes case 4):

> Work through your note first: ask about each specific thing you saw, one per question, before
> any topic the photos can't show. Most of your questions — more than half — should name
> something in a photo. When you do reach a fallback topic, tie it to a photo if you honestly
> can ("She's on her own in every photo — has she lived with other cats?"); ask it plainly only
> when nothing you saw bears on it.

`pnpm vitest run tests/unit/core/helper/skills.test.ts` → before: 20 passed; after: 20 passed.

## Round 1 — after the rewording (same answers as round 0)

### Case 1 — re-check (cat `53b3tyyo`, "Mila" + three photos)

First question **13.5 s**. Turn log: `[read_outline, load_skill]` · `[read_page, list_media]` ·
`[view_photos]` → stop.

> **CATalyst:** I noticed Mila spending time by the window in two of her photos—resting on a
> window perch and loafing on the sill looking outside. Is that one of her favourite spots, and
> what does she like to watch out there?

> **Volunteer (Send):** Yes, the window is her spot. She chatters at the birds at the feeder
> every morning.

5.9 s; `[]` → stop.

> **CATalyst:** In another photo she's peeking around a doorway. How is she around the house
> with people, and has she lived with other cats, dogs, or kids?

> **Volunteer (Send):** She shares her foster home with one calm older cat and they mostly
> ignore each other. I don't know about dogs or kids.

30.2 s; `[add_block, add_block]` 23.8 s · `[read_outline]` · `[read_blocks]` · `[]`.

> **CATalyst:** I have written and added Mila's bio: *(bio below)* Take a look and let me know
> if you'd like to adjust any details!
>
> Applied — added bio.

> Every morning, Mila heads straight to the windowsill to chatter at the birds visiting the
> feeder. When the feeder clears out, she tucks her paws beneath her on the sill or settles
> onto her window perch to watch the yard.
>
> She currently shares her foster home with a calm older cat, and the two of them comfortably
> ignore each other and mind their own business. She hasn't lived with dogs or kids yet, so an
> easygoing home with a good bird-watching ledge suits her best.

- 1–3 questions, one per message: pass (2). Both name something in the photos: pass.
- No second look on either answer: pass.
- No unconfirmed photo guess: ~~pass~~ **fail (corrected after review)**. "When the feeder
  clears out, she tucks her paws beneath her on the sill or settles onto her window perch" joins
  two photo scenes to the volunteer's bird answer as a sequence nobody gave. That is the same
  photo-plus-routine "when" guess that failed round 0 ("Once the morning rush dies down"). The
  round-1 bio also copied the skill's own example ("tucks her paws beneath her"), which matches
  `cat-3.jpg` almost exactly.

**Case 1, round 1: ~~PASS~~ FAIL (corrected after review).** Also, "I don't know about dogs or
kids" became "She hasn't lived with dogs or kids yet", turning an unknown into a claim.

### Case 4 — re-check (cat `tzqnv3ue`, three photos only)

First message **17.5 s**. Name / age / sex asked as three turns (3.4 s, 4.4 s, 5.9 s).

| # | CATalyst | Volunteer | Points at a photo? |
|---|---|---|---|
| 1 | In one photo, she's peeking cautiously around a doorway. Is Juniper someone who takes time to investigate new rooms and people, or does she settle in quickly? | Yes, she hides for the first day, then follows you from room to room. | yes |
| 2 | In another photo, she is resting comfortably on a window hammock. Does she spend much of her day birdwatching from her perch? | Yes, she spends hours in the hammock watching the squirrels in the maple tree. | yes |
| 3 | In a third photo, she's sitting on a windowsill with her paws neatly tucked under her. When she's not keeping watch at the window, does she enjoy cuddling in laps, or does she prefer relaxing right next to you? | Not a lap cat. She sits beside you on the sofa and head-butts your hand. | yes |
| 4 | She is on her own in every photo—how is she around other cats or dogs? | She's fine with calm cats but has never met a dog. | yes |
| 5 | Given that she takes a little time to settle in at first, does she do best in a quieter home, or is she comfortable around kids? | I don't know about kids. | no |
| 6 | Does Juniper have any medical conditions, special diet, or care needs an adopter should know about? | None, she's healthy and spayed. | no |

Every answer turn logged `[]`. Proposal (25.5 s):

> I'll set up Juniper's profile starting with her window hammock portrait as the hero, followed
> by her bio, a photo section showing her doorway peek, a section on what she needs in a home,
> and a closing foster quote featuring her windowsill photo. For her tagline, I'll focus on how
> she warms up from quiet first-day hiding to following you room to room and head-butting your
> hand on the sofa. I'll use the paper theme with warm, natural daylight tones to complement
> her tabby markings.
>
> Want me to build this now?

"Yes" → name at **5.8 s**, hero photo at **6.5 s** (100 ms polling); turn over at 56.3 s. Turn
log after the yes: `[set_field ×3, replace_image, add_block]` 6.7 s · `[add_block]` ×3 ·
`[read_outline]` · `[set_field ×2, set_theme]` · `[read_outline]` · `[]` — no `view_photos`, no
question.

> I built Juniper's profile in the warm Paper theme, featuring her window hammock portrait as
> the hero, a full bio, a photo of her doorway exploration, a three-card needs section, and a
> closing foster quote.
>
> Applied — changed name, age, sex; replaced photo; added bio, photo section, "What she needs"
> section, quote; changed bio, tagline; set theme Paper.

Bio:

> Juniper likes to spend her first day in a new home tucked out of sight, but once she maps the
> territory, she becomes a steady shadow. She follows you from room to room, settling nearby to
> see what you are doing. She is not a lap cat; instead, she hops up next to you on the sofa
> and head-butts your knuckles when she wants chin scratches.
>
> When she is off duty, she spends hours in her window hammock keeping watch over the squirrels
> in the maple tree. Juniper gets along well with calm cats. She has not met dogs, and her
> comfort around children is unknown. She is healthy, spayed, and ready for a quiet home that
> gives her a little patience while she gets her bearings.

- Most interview questions point at the photos: **pass** — 4 of 6.
- No further question after the yes: pass. Hero fill within 8 s (FR-080): **pass** (5.8 s /
  6.5 s). Bio with no question: pass.

**Case 4, round 1: PASS.** Question 4 repeats the skill's own example almost word for word. It
is true of these photos, but that is the risk of giving an example.

### Case 5 — regression (cat `syqvh5yh`, photos only)

First question **20.5 s**:

> **CATalyst:** I can see her relaxing by the window in two of the photos—tucked neatly on the
> sill and resting in a hammock. Is that her favourite spot, and what does she spend her time
> doing there?

> **Volunteer (Send):** just write it

33.6 s, no further question. Turn log: `[add_block, add_block]` 25.9 s · `[read_outline]` ·
`[read_blocks]` · `[]`.

> **CATalyst:** I’ve added a bio to the page based on what’s visible in her photos: *(bio
> below)* Whenever you're ready, we can add more details about her personality, habits, or the
> kind of home she'd thrive in.
>
> Applied — added bio.

> This grey-and-black striped tabby loafs on the windowsill with her paws tucked neatly beneath
> her body, looking out through the glass at the yard. On a suspended perch, she rests looking
> out toward the trees. Moving between rooms, she pauses on the threshold and peeks around the
> doorframe before stepping onto the tile.

**Case 5, round 1: PASS.** The bio now keeps to what the frames show. It is thin, and it opens
on her coat, which the voice rules discourage. That is the expected cost of "a shorter bio that
is true".

### Cases 2 and 3 — regression (cat `bzus27qs`, same setup as round 0)

"Write a bio" → bio written, **44.3 s**, no question. Turn log: `[read_outline, load_skill]` ·
`[read_page, list_media]` · `[view_photos, add_block, add_block]` 27.1 s · `[read_outline]` ·
`[read_blocks]` · `[]`.

> **CATalyst:** I have written and added a bio right after the hero image: *(bio below)* Take a
> look and let me know if you'd like to adjust any details.
>
> Applied — added bio.

> Every morning at six, Pepper sits on your chest and taps your cheek with one paw until you
> get up to fill her bowl. She invents her own games during the day, batting a bottle cap
> across the kitchen floor and waiting for you to kick it back. When she rests, she tucks her
> paws beneath her on the windowsill or stretches out on her window perch.
>
> Pepper needs a home without dogs. When a dog visits her foster home, she retreats under the
> bed for hours, so she is at her best as the only four-legged companion.

**Case 2, round 1: PASS on its criterion (no question).** Correction after review: the bio is
not free of photo guesses. "When she rests, she tucks her paws beneath her on the windowsill or
stretches out on her window perch" is the same photo-scene-plus-routine stitching as case 1. It
also overreaches the page text: "the only four-legged companion" goes further than the "no dogs"
card, and it breaks the skill's own rule against exclusionary phrasing.

"Shorten the bio" + Send → card after **10.7 s**, turn log `[set_field]`, no question.

> PROPOSED · 1 OPERATION · bio · Shorten the bio. · 98 → 65 words

> Every morning at six, Pepper sits on your chest and taps your cheek with one paw until you
> get up to fill her bowl. She bats bottle caps across the kitchen floor, waiting for you to
> kick them back, then settles on the windowsill with her paws tucked under her. She needs a
> home without dogs—when one visits, she retreats under the bed for hours.

**Case 3, round 1: PASS.**

### Case 6 — phone (optional; cat `37ueieor`, "Mila" + three photos, 390×844)

Set up at 1440, then resized to 390. "Write a bio" from the CATalyst drawer (Full). The drawer
dropped straight to Peek on the chip. The question arrived after **15.9 s** in the Half sheet.
Turn log (`surface: "phone"`): `[read_outline, load_skill]` · `[read_page, list_media]` ·
`[view_photos]` → stop.

> **CATalyst:** I can see Mila resting in a window hammock in one photo and loafing on a
> windowsill looking outside in another. Are windows her favourite spot, and how does she spend
> her time when people are around?

Typed the answer in the Half sheet and clicked **Send**. 0.4 s later: no CATalyst region, no
dialog, the 48 px Peek bar ("open CATalyst") showing — **dropped to Peek on send**. Reply after
8.6 s (`[]` → stop), raised in the Half sheet again:

> **Volunteer (Send):** Yes, the window is her spot. She chatters at the birds at the feeder
> every morning.

> **CATalyst:** What kind of home suits her best—how is she with other cats, dogs, or kids?

Questions short (about 33 and 17 words; the desktop questions in case 1 ran about 30–37): **pass**. Peek on
send: **pass**. **Case 6: PASS.** (Not answered to the end; the criterion stops at the send.)

## What this check leaves open

- **Slower bio writing.** The write step (the request that adds the bio) went from 14–17 s in
  round 0 to 24–27 s in round 1, most likely from the new check-each-sentence instruction.
  Time to the first question did not change (12–21 s either way).
- **"I don't know" → a claim.** Case 1, round 1 wrote "She hasn't lived with dogs or kids yet"
  from "I don't know about dogs or kids". The skill already says to write around an "I don't
  know". This check does not test that, so it was not reworded.
- **Sex assumed.** With sex unset (case 5), the questions and bio use "her"/"she" from the
  photos alone.

---

## Round 2 — after the second rewording (task-review fix)

### Why a second round

The task review found that round 1's self-check only covered sentences sourced from photos. So
the model still stretched the volunteer's and the page's words, and turned unknowns into claims
("I don't know about dogs or kids" → "She hasn't lived with dogs or kids yet"; "home without
dogs" → "the only four-legged companion"; "head-butts your hand" → "wants chin scratches"). It
also showed that round 1's case 1 verdict was too generous (corrected above). And both skills'
new examples were copied into the replies: "she loafs on the sill with her paws tucked in"
matches `cat-3.jpg`, and "She's on her own in every photo…" was repeated almost word for word.

### The second rewording

**`write-bio.md`**, the "I don't know" step:

> An answer of "I don't know" settles that gap — don't ask about it again, and leave that topic
> out of the bio. An unknown is not a "hasn't," a "never," or a "yet": "I don't know about dogs"
> gives you nothing to say about dogs.

**`write-bio.md`**, the paragraph after "Photos show; they don't prove." (replaces round 1's):

> This holds for every sentence you write, including after "just write it". From a photo alone
> you may say where she is and what she's doing in that frame — "she's stretched along the back
> of the sofa." You may not add when, how often, why, or how she feels about it — "every
> morning," "once the house goes quiet," "she loves the view," "calm and observant," "all she
> needs." Nor may you stitch a photo into something the volunteer told you, as if it came next
> in her day — "after the birds leave, she naps on the sill" invents a sequence nobody gave you.
> Those come only from the page or from the volunteer's own words, and even then say no more
> than those words say: "no dogs" is not "no other pets," and "head-butts your hand" is not
> "wants chin scratches." Before you save, check each sentence against its source — a photo,
> the page, or an answer — and cut or pull back any that says more than its source does. If the
> page doesn't give her sex, don't guess it from a photo: write "they." A shorter bio that is
> true, even under 80 words, beats a fuller one that guesses.

This is the reviewer's proposed text, plus the "Nor may you stitch…" sentence, which targets the
exact failure in round 1's case 1. The example sentence no longer matches any fixture photo.

**`write-bio.md`**, "Length and paragraphing": "80–160 words when the material is there; when
it's thin, stop short rather than pad (see "Photos show; they don't prove" above)." This
removes the clash with "even under 80 words".

**`build-profile.md`**, the fallback-topic sentence (drops the copyable example):

> When you do reach a fallback topic, tie it to what you actually saw if you honestly can — who
> else is or isn't in the frame, which room she's in — and ask it plainly only when nothing you
> saw bears on it.

Every pinned phrase in `tests/unit/core/helper/skills.test.ts` is unchanged and on one line.
`pnpm vitest run tests/unit/core/helper/skills.test.ts tests/contract` → 18 files passed,
318 tests passed (34 skipped, 9 todo); `skills.test.ts` alone 20/20; `pnpm format:check` clean.

Same setup as rounds 0 and 1. Vertex latency was uneven during this round: one `view_photos`
step took 55.8 s for about the same output (565 tokens) that took 7–9 s in rounds 0 and 1. The
timings below are recorded as they happened.

### Case 1 — photos, little text (cat `bhmjl2o3`, "Mila" + three photos)

Click "Write a bio" → first question **17.4 s**. Turn log: `[read_outline, load_skill]` 2.1 s ·
`[read_page, list_media]` 5.0 s · `[view_photos]` → stop 10.1 s.

> **CATalyst:** I can see Mila resting on a window perch and tucked neatly on a windowsill in
> two of the photos. Are windows her go-to spot, and what does she spend her day doing?

> **Volunteer (Send):** Yes, the window is her spot. She chatters at the birds at the feeder
> every morning.

5.4 s; `[]` → stop (no new reads).

> **CATalyst:** What kind of home suits her best—how is she around other cats, dogs, or kids?

> **Volunteer (Send):** She shares her foster home with one calm older cat and they mostly
> ignore each other. I don't know about dogs or kids.

Bio write **33.1 s** from Send (the write request itself: `[add_block, add_block]` 24.2 s), then
`[read_outline]` · `[read_blocks]` · `[]`.

> **CATalyst:** I've added a bio for Mila: *(bio below)* Take a look and let me know if you'd
> like to adjust any details!

> Mila spends her mornings at the window, chattering at the birds at the feeder outside. A tabby
> cat with brown and black stripes, she spends much of her time resting on a window perch or
> tucked on the sill.
>
> She shares her foster home with one calm older cat, and the two mostly ignore each other.

(56 words.)

- 1–3 questions, one per message: pass (2). The first names what the photos show: pass.
- No second look on an answer: pass.
- Unknowns: **pass**. Dogs and kids are simply left out; no "hasn't", "never" or "yet".
- Stitching: **pass**. No "when X, she Y" sequence joining a photo scene to the bird answer.
- Photo guesses, judged by the round-0 standard: **borderline**. "She spends much of her time
  resting on a window perch or tucked on the sill" says how often, which the frames can't show.
  The nearest source is the volunteer's "the window is her spot", which supports "window" but
  not "much of her time … resting". It is much milder than rounds 0 and 1 (no invented sequence,
  no sun, no nap). By the strict rule it is still a frequency claim.

**Case 1, round 2: BORDERLINE — pass on unknowns, stitching, questions and no second look;
one mild frequency stretch ("much of her time") remains.** Not a clean pass.

### Case 2 — well-filled page (cat `ng7ryuct`, same setup as before)

"Write a bio" → bio written, **57.9 s**, no question. Turn log: `[read_outline, load_skill]`
5.9 s · `[read_page, list_media]` 5.2 s · `[view_photos, add_block]` 33.9 s · `[read_outline]` ·
`[read_blocks]` · `[]`.

> **CATalyst:** I've added a bio for Pepper right below the hero image: *(bio below)* Let me
> know if you'd like to adjust any details or add anything else about her routine!

> Every morning at six, Pepper sits on her foster's chest and taps their cheek with one paw until
> someone gets up to fill her bowl. Once she has eaten, she is ready for her favourite game:
> batting a bottle cap across the kitchen floor, then waiting for you to kick it back.
>
> Pepper needs a home without dogs. When a dog visits, she hides under the bed for hours, so she
> will do best in a home where she doesn't have to share space with one.

(86 words.)

- Writes with no question: **pass**.
- No photo content at all this time: no windowsill, no perch, no "calm".
- The dogs need stays inside what the card says ("a home without dogs"; no "only pet").
- One stitch between page facts: "Once she has eaten, she is ready for her favourite game" joins
  the quote (breakfast) to the caption (bottle cap) as a sequence neither gives.

**Case 2, round 2: PASS on its criterion.** The page's words are kept close. One invented
"once she has eaten" link is left.

### Case 4 — build the page (two samples)

**Sample A (cat `fte5ha6e`).** Click "Build the page" → first message **63.3 s** (the
`view_photos` step alone took 55.8 s; see the latency note above).

| # | CATalyst (verbatim) | Volunteer | Points at a photo? |
|---|---|---|---|
| — | What is this cat's name? | Juniper | (fact) |
| — | How old is Juniper? | About 3 years | (fact) |
| — | Is Juniper female or male? | Female | (fact) |
| 1 | In one photo, she is peeking carefully around a doorway. How does she usually react when exploring new spaces or meeting new people? | Yes, she hides for the first day, then follows you from room to room. | yes |
| 2 | In another photo, she is resting on a window hammock with her chin propped on the wooden perch. Is watching out the window a big part of her daily routine? | Yes, she spends hours in the hammock watching the squirrels in the maple tree. | yes |
| 3 | In another photo, she has her paws tucked underneath her on a windowsill, quietly watching the backyard. Is she generally a calm observer, or does she have playful energetic moments as well? | She has bursts — she chases hair ties down the hallway and brings them back. | yes |
| 4 | How does she do around other cats or dogs? | She's fine with calm cats but has never met a dog. | no |
| 5 | Is she good with kids, or does she do better in a quiet, adult household? | I don't know about kids. | no |

Answer turns 5.4 / 5.4 / 8.4 s (name/age/sex), then 3.4 / 3.4 / 6.9 / 8.9 s; every one logged
`[]`. Proposal (25.6 s):

> I’ll set up Juniper’s profile with her window hammock photo as the hero, followed by her bio,
> a photo of her curious doorway peek, a section on what she needs in a home, a photo of her
> watching the yard from the windowsill, and a foster quote highlighting her playful hair-tie
> fetch games. For the style, I'll write a tagline celebrating how she blossoms into a loyal
> shadow and use the paper theme to complement the natural indoor daylight in her photos.
>
> Want me to build this now?

"Yes" → name at **10.8 s**, hero photo at **11.5 s**. The first build request
(`[set_field ×3, replace_image, add_block]`) took 11.5 s for 1060 output tokens. In round 1 the
same step took 6.7 s for 853 tokens. No question after the yes; turn over at 123.2 s. Blocks:
hero, bio, photo, needs, photo, quote.

> I've built Juniper's profile in the paper theme with a hero portrait, bio, two photo
> spotlights, a home needs section, and a closing foster quote.
>
> Applied — changed name, age, sex; replaced photo; added bio, photo section, "What she needs"
> section, photo section, quote; changed bio, tagline; set theme Paper.

> Juniper likes to take her time when arriving in a new home, usually tucked out of sight for
> her first day. Once she gets her bearings, she steps out and quietly becomes your shadow,
> following along from room to room as you go about your day.
>
> Her favorite perch is her window hammock, where she will spend hours keeping watch over
> squirrels in the maple tree outside. Between naps and window duty, she gets sudden bursts of
> play, sprinting down the hallway after hair ties and carrying them back like a retriever. She
> lives comfortably alongside calm, easygoing cats, but has never lived with dogs.

- Most interview questions point at photos: **pass** (3 of 5). No copied example: question 4
  is a plain fallback, not "on her own in every photo".
- No question after the yes: pass. Bio with no question: pass.
- FR-080 (hero within 8 s of the yes): **fail** in this sample (name 10.8 s, hero 11.5 s).
- Bio honesty (build-profile writes through write-bio): stretches remain. "Between naps" is
  invented. "Her favorite perch" and "like a retriever" go past the answers. "Has never lived
  with dogs" goes past "has never met a dog".

**Sample B (cat `hn4xpioi`).** First message **12.4 s** (`view_photos` 7.3 s). The script
answered by keyword. Two answers were off-topic (question 6 got the "hides" answer, question 7
got the hair-tie answer). That spoils the bio input but not question grounding or hero timing.

| # | CATalyst (verbatim) | Volunteer (as sent) | Points at a photo? |
|---|---|---|---|
| — | What is this cat's name? | Juniper | (fact) |
| — | How old is Juniper? | About 3 years | (fact) |
| — | Is Juniper female or male? | Female | (fact) |
| 1 | In one photo, she is peeking curiously around a doorway. How does she usually react when meeting new people or exploring a new room? | Yes, she hides for the first day, then follows you from room to room. | yes |
| 2 | She is perched by a window watching the outdoors in two of her photos. Does she spend much of her day bird-watching or looking outside? | Yes, she spends hours in the hammock watching the squirrels in the maple tree. | yes |
| 3 | In the photo on the white windowsill, she looks very calm and settled with her paws tucked under. How does she prefer to show affection or interact with people once she's comfortable? | Yes, she hides for the first day, then follows you from room to room. *(off-topic)* | yes |
| 4 | Since she is the only animal in her photos, how does she do around other pets, or would she prefer being the only cat in the home? | She chases hair ties down the hallway and brings them back. *(off-topic)* | yes |
| 5 | Given that she likes to take that first day to hide and settle in, what kind of home would suit her best—would a calmer household be ideal, or does she do well with kids and busy routines? | Yes, she hides for the first day, then follows you from room to room. | no (ties to an answer) |

Proposal:

> I will build Juniper's profile starting with a hero photo of her peeking around the doorway,
> followed by her bio, a photo of her watching squirrels from the window perch, a "What she
> needs" section highlighting a patient start and a sunny window spot, and closing with a foster
> quote about her loyal nature. For the tagline, I will focus on how quickly she goes from shy on
> day one to your devoted shadow on day two, paired with a warm paper theme to suit the natural
> light in her photos.
>
> Want me to build this now?

"Yes" → name at **6.2 s**, hero photo at **6.9 s** (first build request 7.0 s, 961 output
tokens). No question after the yes; turn over at 65.8 s.

> I have built Juniper's profile with a hero photo, bio, window photo, needs section, and foster
> quote, styled in the warm Paper theme.

> Juniper spends hours in her window hammock, watching the squirrels move through the maple tree
> outside. When she is not on lookout duty, she brings a dedicated game of fetch to the hallway,
> chasing after hair ties and carrying them back for another throw.
>
> In a new home, she typically spends her first day tucked out of sight while she takes in the
> sounds and smells. Once that first day passes, she steps right out and follows you from room
> to room, keeping quiet company wherever you go.

- Most questions point at photos: **pass** (4 of 5). Question 4 ties the fallback to what is
  in the frames ("the only animal in her photos"), as the new wording asks; it is not the old
  example copied.
- No question after the yes: pass. FR-080: **pass** (hero 6.9 s). Bio with no question: pass.
- Bio honesty: nothing about dogs, other cats or kids is claimed. One invented "why" remains
  ("while she takes in the sounds and smells").

**Case 4, round 2: PASS on the questions and the yes in both samples. FR-080 passed in B and
failed in A** during a slow Vertex period (the same `view_photos` step was 6–8× slower than in
the other runs). The build-profile change only touched interview wording, not the build. The
build bios still show small stretches; build-profile's writing is out of this check's criteria,
but the pattern is recorded.

### Case 5 — "just write it" (cat `tawxbcuc`, photos only)

First question **22.6 s** (`view_photos` 13.3 s):

> **CATalyst:** I can see them resting in a window hammock and tucked onto a windowsill in two
> of the photos. Is lounging by the window their favourite spot, and what do they spend most of
> their time doing when they aren't watching outside?

> **Volunteer (Send):** just write it

26.1 s, no further question (`[add_block, add_block]` 17.5 s · `[read_outline]` ·
`[read_blocks]` · `[]`).

> **CATalyst:** I've added a bio to the page based on what's visible in their photos: *(bio
> below)* Whenever you have more details about their daily routine, personality, or the kind of
> home they need, we can easily weave those in.

> They step into the doorway and pause to look around the frame into the room. On the
> windowsill, they sit with their paws tucked beneath their body, looking out into the yard. In
> the window perch, they rest their chin against the edge, looking out toward the tree.

(48 words.)

- Wrote at once with no further question: **pass**.
- Sex unset → "they" throughout, in the question and the bio: **pass** (round 1 used "her").
- Every sentence is one frame; no when, how often, why or feeling: **pass**.

**Case 5, round 2: PASS.**

### Round 2 summary

| Case | Round 2 |
|---|---|
| 1 Photos, little text | **Borderline** — unknowns, stitching, questions and no second look all pass; one mild frequency stretch ("much of her time") |
| 2 Well-filled page | Pass (no question); page words kept close; one "once she has eaten" link |
| 4 Build the page | Pass on questions (3/5, 4/5) and the yes; FR-080 pass in 1 of 2 samples (11.5 s in a slow Vertex period, 6.9 s otherwise) |
| 5 "Just write it" | Pass — "they", frame-only |

Cases 3 and 6 were not re-run (write-bio's rewrite/shorten skip and the phone surface are
unchanged). Two rewording rounds are used up, as the brief allows.

---

## Round 3 (build bio after the source-rules move)

### Why

The final branch review found that write-bio's source rules ("Photos show; they don't prove",
the per-sentence source check, and "an unknown is not a never") sat inside `## Before you
write`, the section a build and a rewrite are told to skip. That explains round 2's sample A
build bio ("Between naps", "has never lived with dogs"). The rules now sit under their own
heading, `## Every sentence has a source`, which says it applies to every bio, inside
`build-profile` too. The wording of the rules did not change. Only case 4 was re-run.

### Case 4 — build the page (cat `m77pbrkg`, three photos only)

Same setup as before: a new cat, `cat-1.jpg`, `cat-2.jpg`, `cat-3.jpg`, nothing else. Answers
sent with the Send button. Click "Build the page" → first message **12.0 s**.

| # | CATalyst (verbatim) | Volunteer | Points at a photo? |
|---|---|---|---|
| — | What is this cat's name? | Hazel | (fact) |
| — | How old is Hazel? | About 3 years | (fact) |
| — | Is Hazel female or male? | Female | (fact) |
| 1 | In one of the photos, Hazel is peeking around a doorway looking curious. How does she usually react when exploring new rooms or meeting someone new? | She hides for the first day, then follows you from room to room. | yes |
| 2 | In two of the photos, Hazel is settled by the window—resting on a perch and watching the yard. Is bird-watching or window-sitting a big part of her daily routine? | Yes, she spends hours in the hammock watching the squirrels in the maple tree. | yes |
| 3 | In the photo on her window hammock, Hazel looks completely at ease with the camera close up. How is she with affection, petting, or being picked up? | She likes chin scratches but does not like being picked up. | yes |
| 4 | In all of her photos, Hazel is on her own in a calm room. How does she do around other cats, dogs, or children? | She's fine with calm cats but has never met a dog. I don't know about kids. | yes (close to the old "on her own in every photo" example) |
| 5 | What kind of home environment do you think would suit Hazel best? | A quiet home where she can have a window and a few days to settle in. | no |

Answer turns 13.0 / 2.9 / 8.4 s (name/age/sex), then 7.9 / 3.4 / 2.9 / 2.4 s. Proposal
(23.6 s; the turn log shows `[load_skill, load_skill]`):

> I plan to build Hazel's profile starting with her perched in the window hammock as the hero,
> followed by her bio, a photo of her watching the yard, a needs section covering her settling
> time and quiet environment, and a closing foster quote with her peeking around the door. I'll
> frame her tagline around her love of windows and quiet companionship, set in the warm paper
> theme.
>
> Want me to build this now?

"Yes" (Send) → name on the page at **14.7 s**. The hero photo came in the same model request
(`[set_field ×3, replace_image, add_block]`, 15.5 s on the server for 614 output tokens), so
the hero landed at about the same time. No question after the yes; turn over at **55.4 s**.
Turn log after the yes: `[set_field ×3, replace_image, add_block]` 15.5 s · `[add_block]`
3.4 s · `[add_block]` 3.6 s · `[add_block]` 2.8 s · `[load_skill, read_page]` 7.2 s ·
`[set_field]` 8.2 s · `[read_blocks]` 2.1 s · `[set_field]` 3.6 s · `[set_theme]` 2.4 s ·
`[read_outline]` 2.7 s · `[]` 3.3 s. So `write-bio` was loaded for the bio.

> Hazel's page is ready, featuring a hero, bio, window photo, needs cards, and foster quote
> styled in the warm paper theme.
>
> Applied — changed name, age, sex; replaced photo; added bio, photo section, "What she needs"
> section, quote; changed bio, tagline; set theme Paper.

The bio (verbatim):

> Hazel spends hours curled in her window hammock, watching squirrels in the maple tree
> outside. When arriving in a new place, she usually hides for the first day. Once she gets her
> bearings, she turns into a gentle shadow, following you from room to room to keep you
> company.
>
> She enjoys chin scratches and resting nearby, though she prefers keeping all four paws on the
> ground over being picked up. Hazel does well around calm cats. A quiet home with a sunny
> windowsill and a little patience while she settles in suits her best.

Other text the build wrote (verbatim): tagline "A dedicated window-watcher who follows you from
room to room."; photo caption "Hazel spends hours watching squirrels from the windowsill.";
needs cards "Time to settle in" — "Hazel typically hides on her first day in a new home. With a
calm environment and patience, she quickly warms up and follows you from room to room.", "A
window view" — "A sunny window or window hammock is her favorite spot in the house, where she
can watch birds and squirrels for hours.", "Affection on her terms" — "Hazel adores chin
scratches and lounging nearby, though she prefers keeping her paws grounded rather than being
picked up."; quote "She hides for the first day, then follows you from room to room." — "Her
foster".

Sentence by sentence against the sources:

- "spends hours … watching squirrels in the maple tree" — from the answer. "curled" is not in
  the answer or the photo (she lies with her chin on the edge): a small stretch.
- "usually hides for the first day" — from the answer.
- "follows you from room to room" — from the answer. "gentle shadow" and "to keep you company"
  add a feeling and a why: a small stretch.
- "enjoys chin scratches … prefers keeping all four paws on the ground over being picked up" —
  from the answer. "and resting nearby" is invented.
- "does well around calm cats" — from "fine with calm cats". **Nothing about dogs** (round 2
  wrote "has never lived with dogs"), and **nothing about kids** (the "I don't know" was left
  out, as the rule says).
- "A quiet home … a little patience while she settles in" — from the last answer. "sunny" is
  invented.
- No invented routine like round 2's "Between naps"; no photo-to-answer sequence stitching.

Outside the bio (build-profile's own writing, not write-bio's): the caption ties the squirrel
answer (about the hammock) to the windowsill photo, and the needs cards add "birds", "her
favorite spot", "quickly warms up" and "lounging nearby".

- Most interview questions point at photos: **pass** (4 of 5). Question 4 is close to the old
  "on her own in every photo" example, though it asks about cats, dogs and children together.
- No question after the yes: **pass**.
- FR-080 (hero within 8 s of the yes): **fail** (14.7 s). The first build request produced 614
  output tokens yet took 15.5 s, which points at Vertex latency rather than a longer first step
  (round 2 sample A: 11.5 s for 1060 tokens; sample B: 7.0 s for 961).
- Build bio stays within its sources: **borderline**. The two round-2 faults are gone: no
  invented routine, and the dog answer is neither widened nor turned into a claim; the unknown
  (kids) is left out. Four small stretches remain ("curled", "gentle shadow … to keep you
  company", "resting nearby", "sunny"). None is a claim about other animals, kids, health or
  behaviour that an adopter would rely on.

**Case 4, round 3: BORDERLINE.** The move fixed what it was meant to fix (the build bio now
follows the unknown-topic and no-widening rules), but the model still adds small descriptive
details in a build, and FR-080 failed in this sample. A single sample; not a statistical claim.
