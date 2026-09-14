---
name: build-profile
description: Interview the volunteer from the photos on hand, then assemble a first profile section by section
---

Use this when the page is empty, or nearly empty, and the volunteer wants a first draft —
"help me build the page," "make a profile for her," or the "Build the page" chip.

## 1. Look before you ask

1. `read_outline` — see what already exists. If blocks beyond the hero are already filled in,
   this is not a first build; ask what the volunteer wants changed instead of restarting.
2. `list_media` — see every photo and clip on hand, whether or not it's placed yet.
3. `view_photos` on the most useful ones — up to six in this call. Prefer the ones that look
   like they'd make a good hero, plus any that show the cat with people, other animals, or
   doing something specific. Skip near-duplicates.

## 2. Name, age, and sex — always first

Before any question from the bank below, ask for whatever of her name, her age, and whether
she's female or male isn't already obvious from the page or the photos — **as three separate
turns, never bundled into one message**, even though asking all three at once would feel
efficient. One turn, one answer, then the next. Skip only the ones a photo or the page already
settled.

## 3. The interview

Ask five to ten questions, **one at a time**, and wait for the answer before the next one.
Never ask two things in one message. Stop on your own once you judge you have enough to build a
good page — you don't need all ten. Stop at once, mid-list if you must, the moment the volunteer
says anything like "build it" or "just build it from what you have": that sentence ends the
interview outright, not a suggestion to confirm. Either way, stop at ten questions even if you
don't have everything, and move on with what you learned.

Draw from this bank, and adapt the order and wording to what the photos already showed you —
don't ask something a photo already answered, and do ask about anything a photo raises.

- What's the first thing people notice when they meet her?
- How is she around other cats or dogs? (If a photo shows another animal, ask about that
  relationship directly rather than asking generically.)
- Good with kids, or does she do better in a quiet, adult household?
- Anything worth knowing about her litter box habits?
- What's her energy like — a couch cat, an explorer, somewhere in between?
- Any medical needs or care a new owner should plan for?
- A daily habit or routine that says something about her — a favorite window, a game she
  never gets tired of?
- Is there a photo or clip here that captures her best? (Skip if there's only one photo.)
- Anything specific she needs in a home — no other cats, a patient adopter, a quiet house?

## 4. Choose sections and order

Decide which block types the answers and media actually support. Don't add a video block if
there's no clip; don't add a gallery for one spare photo; don't add a needs card with nothing
to put in it. A clip on hand belongs on the page: if `list_media` showed one, add a video
block for it. `load_skill({ name: "tidy-order" })` for how to sequence what you do add.

## 5. Propose, then wait for yes

Before touching the page, tell the volunteer what you're about to build — a short, plain
sentence or two, in your own voice, naming: the sections you'll add, in the order you chose;
the direction the tagline will take; and the theme you'll pick. End the message with exactly:
"Want me to build this now?"

Then stop and wait. Build only once the volunteer gives a clear yes — "yes," "go ahead,"
"sounds good," or the like. "Not yet," a question, or a new detail about the cat all mean the
interview isn't over yet: answer it, or fold the detail into your plan and adjust it if it
changes what you'd build, then ask again once you're ready.
Never build without a clear yes — not a well-argued proposal, not a pause, a yes.

## 6. Build it, one block at a time

The yes starts the build **at once, with no read first** and no reload of this skill: you
read the outline in step 1 (it gave you the hero's id and which facts were already filled),
and the volunteer's answers are in this conversation. Your very first model step after the
yes is the hero fill — nothing before it.

The hero is already there at `blocks[0]` — you cannot add, remove, or move it. Set only the
facts the page does not already hold — the outline from step 1 told you which. Never
`set_field` a name, age or sex that is already there: re-setting a filled field is a change the
volunteer has to approve, and it stalls the build on a card for nothing. The same goes for the
tagline: if the volunteer typed a tagline, leave it and skip the tagline step below. Fill in
the missing facts with `set_field` (name, age, sex) and give the hero its photo with
`replace_image`, and in that same model step `add_block` an **empty** bio block —
`content: { paragraphs: [] }`, no text yet — so the first section lands on the canvas alongside
the hero. Don't leave it to a later turn, and don't draft any bio text into it here; that's
`write-bio`'s job next.

For everything else, call `add_block` **one block at a time**, in the order you chose, so
each one lands on the canvas as you go. Fill each block's content as you add it or right
after — captions, day scenes, needs cards, quote text — using what the volunteer told you.

### The `add_block` shape

`block` is the whole section: its `type` (that key, exactly) plus that type's own fields and
nothing else — no `id`, no `kind`, no field from another type. Media go in `mediaId` or
`mediaIds`; text goes in the type's own field. A refused call is a wasted round trip, so
match these exactly — one worked example per type:

The empty bio (the hero-fill step):

```json
{ "op": "add_block", "block": { "type": "bio", "content": { "paragraphs": [] } } }
```

A photo section — `caption` is optional, 200 characters or fewer:

```json
{ "op": "add_block", "block": { "type": "photo", "mediaId": "photo2aa", "caption": "Her favorite windowsill." } }
```

A gallery — `mediaIds` only, two to twelve photo ids; a gallery has no caption:

```json
{ "op": "add_block", "block": { "type": "gallery", "mediaIds": ["photo2bb", "photo2cc"] } }
```

A video section — the clip's id, nothing else:

```json
{ "op": "add_block", "block": { "type": "video", "mediaId": "video2aa" } }
```

A day in her life — exactly three scenes, each with a `mediaId` (or `null`) and a caption of
120 characters or fewer:

```json
{ "op": "add_block", "block": { "type": "day", "scenes": [{ "mediaId": "photo2aa", "caption": "Morning: the sunny sill." }, { "mediaId": "photo2bb", "caption": "Afternoon: a long nap." }, { "mediaId": null, "caption": "Evening: the toy mouse." }] } }
```

What she needs — one to three cards, `title` 60 and `text` 240 characters or fewer:

```json
{ "op": "add_block", "block": { "type": "needs", "cards": [{ "title": "A quiet home", "text": "She settles fastest where the days are calm and predictable." }] } }
```

A quote — `text` 200 characters or fewer, `mediaId` a photo id or `null`, `attribution`
optional:

```json
{ "op": "add_block", "block": { "type": "quote", "mediaId": null, "text": "She waits by the door every evening like she has somewhere to be.", "attribution": "Her foster" } }
```

Never add a hero — the page already has one.

For the bio: `load_skill({ name: "write-bio" })` and follow it, then `set_field` the bio
block's `content` with the full bio. Because the block is still empty when you write to it,
this is a neutral change, not a destructive one, so it applies with no card. That's only true
while the field is empty — once it holds real bio text, replacing it is always destructive and
always cards (helper-protocol.md), whoever wrote what's there.

If the tagline is still empty, set one with `set_field` on the profile's `tagline` path — one
line, 80 characters or fewer, in the same voice as the bio.

For the look: `load_skill({ name: "pick-theme" })` and follow it — it applies the theme itself.

## 7. Check your work

Never publish, delete anything, or skip past a card the volunteer would otherwise see.

This check happens **exactly once, at the true end of the build** — after every block from
step 6 is added and filled, never partway through as a way to decide whether to add one more
block. Don't read the outline to check your progress mid-build; only read it here, last.

`read_outline` once more to re-read what you changed. Confirm every block you meant to add is
there, in the order you intended, and nothing is empty that shouldn't be. Then summarise what
you built in one line — name the sections and the theme, not a step-by-step recap.
