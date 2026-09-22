# CATalyst: send button and personalised questions — design

Date: 2026-09-22 · Status: approved in brainstorming, awaiting written-spec review

## Why

Three small updates to the CATalyst helper, from the volunteer's point of view:

1. The chat box has no send button — Enter is the only way to send, which not everyone finds.
2. "Write a bio" writes straight away, even when the page gives it almost nothing to go on,
   so the bio ends up generic.
3. When CATalyst does ask questions (the "Build the page" interview), they read like a fixed
   form ("What's her energy like?") instead of building on what's already in the photos and on
   the page.

**Success looks like:** a volunteer can send with a visible button; "Write a bio" on a thin page
asks one to three questions that clearly come from *this* cat's photos and page; on a
well-filled page it just writes; and the "Build the page" questions point at what CATalyst saw.

## Decisions made in brainstorming

| Question | Decision |
|---|---|
| Should "Write a bio" always ask? | **Only when something is missing** — it writes straight away if the page and photos already give enough. |
| Send button while CATalyst is replying? | **Send only.** Greyed out while busy. No Stop button (a separate feature if ever wanted). |
| How should questions show CATalyst looked? | **Point to what it saw** — e.g. "I can see her curled up on a windowsill in two of the photos. Is that her favourite spot?" |
| Approach | **Instructions only**: change the two skill files; no new tool, no new data sent to the model. |
| Process | Superpowers spec + implementation plan, not Spec Kit (the project owner's call for this change). |

Rejected approaches: a new "ask a question" tool (breaks the fixed twelve-tool reach, FR-093,
and adds UI nobody asked for); attaching the page and photos to every bio request on the
server (breaks FR-082, "nothing about the page is sent to the model unasked", and sends photos
when they are not needed).

## Part 1 — the send button

- **Placement:** a 44px square button to the right of the composer text box, in the same row,
  aligned to the box's bottom edge. Beside the box, not overlaid on it, so the box can grow to
  its ~4-line ceiling without text running under the button.
- **Component:** a new `Send` arrow icon in `src/ui/shared/icons.tsx`, drawn in the existing
  `Button variant="primary" size="icon"` (`src/ui/shared/Button.tsx`, the 44px square for one
  glyph), with `aria-label="Send"`. Blue (Button's own primary) when there is text to send;
  disabled when the trimmed text is empty or the composer is disabled (locked, or CATalyst is
  replying). A pointer press never takes focus from the text box (`onMouseDown` prevented), so
  on a phone a tap-send does not close and reopen the keyboard.
- **Behaviour:** clicking calls the same `send()` the Enter key uses in
  `src/ui/helper/Composer.tsx` — trims, sends, clears. After a click, focus goes back to the
  text box so the volunteer can keep typing. Enter sends and Shift+Enter makes a new line,
  unchanged. The phone drawer uses the same `Composer`, so it gets the button with no extra
  work; a click-send drives the drawer to peek exactly as an Enter-send does today.
- **Accessibility (Principle IX):** a real `<button>`, labelled, reachable by Tab, operable by
  Enter and Space, with the standard visible focus outline.

## Part 2 — "Write a bio" asks when it needs to (`src/core/helper/skills/write-bio.md`)

A new section at the top of the skill, applying when the volunteer asks for a bio **on its
own** (the "Write a bio" chip, or typing a request to write one):

1. **Look first, in as few steps as it can.** The outline if not yet read this request; then
   `read_page` (facts and every section's words in one read) and `list_media` together in one
   step; then `view_photos` on up to six of the most telling photos (the cat with people or
   animals, doing something specific; skip near-duplicates). Each step is a model round trip
   (seconds each), so fewer steps means a faster first question.
2. **Judge whether there is enough.** Enough means both:
   - at least **two concrete things she does** (a habit, a game, how she greets people), and
   - at least **one fact about the home she'd suit** (other animals, kids, energy level, or a
     medical or care need).

   If both are there, write straight away — no questions.
3. **Otherwise ask one to three questions, one per message**, only about the gaps. Each
   question points to something specific CATalyst saw, whenever it can ("I can see her on a
   windowsill in two of the photos — is that her spot?"). The moment the volunteer says
   anything like "just write it", stop asking and write with what there is. On an answer it
   does not look again — what it read and saw is already in the conversation — and "I don't
   know" settles that gap rather than prompting a re-ask.
4. **Write**, following the existing voice rules unchanged. Replacing an existing bio still
   goes through the Apply / "Not this" card (FR-038/FR-043) — no change to the edit protocol.

Guardrails:

- **Photo guesses are never written as fact.** What a photo plainly shows (coat, a dog in the
  frame) may be used. What it only suggests ("loves windows", "gets on with the dog") must be
  confirmed by the volunteer before it goes in the bio — which is exactly why it is asked as a
  question.
- **No questions for rewrite or shorten requests.** The material is already on the page.
- **No second interview inside "Build the page".** When `build-profile` loads `write-bio` to
  write the bio, the interview has already happened: skip straight to writing.

## Part 3 — "Build the page" questions build on what it saw (`src/core/helper/skills/build-profile.md`)

The walkthrough keeps its shape: look first, name/age/sex one at a time, five to ten interview
questions one at a time (FR-033), propose and wait for a clear yes (FR-034), then build.
Two changes:

- **Observations drive the questions.** After step 1's looking, CATalyst notes (to itself, not
  in a message) the specific things it saw — setting, other animals or people, what she is
  doing, anything unusual. Interview questions are written from those notes, each pointing to
  what it saw whenever it can. The existing question bank becomes the fallback for topics the
  photos and page say nothing about, rather than the main source.
- **The same photo-guess guardrail** as `write-bio`: anything only inferred from a photo is
  asked as a question, never assumed into the page.

## What does not change

- The twelve tools (FR-093), the edit protocol, the card flow, the reducer, the chat route and
  what it sends to the model (FR-082). The photo budget (six per call, twelve per request).
- The system prompt in `src/core/helper/prompt.ts`.
- The chips; "Write a bio" still sends its label word for word.

## Docs to update

- `specs/001-cat-profile-builder/contracts/helper-protocol.md`, Skills section: the
  `build-profile` row (questions built from what it saw, the photo-guess guardrail) and the
  `write-bio` row (looks first, asks one to three questions only when it lacks enough, no
  questions on rewrite/shorten or inside a build). The sentence "`build-profile` is the only
  place the interview exists" becomes: `build-profile` holds the full interview; `write-bio`
  holds a short one of its own for a standalone bio request; neither has a counter or mode in
  the reducer.
- `Composer.tsx`'s header comment: Enter still sends, and there is now a Send button.
- `references/design/CONTENT.md`, Helper table, `Input` row: add the button's name, `Send`.
- `build-profile.md` §2: "Before any question from the bank below" becomes "Before any
  interview question", since the bank is now only a fallback.

## Testing

- **Component — `tests/component/helper/Composer.test.tsx`:** click sends the trimmed text and
  clears the box; the button is disabled when the text is empty/whitespace and when the
  composer is disabled; keyboard path (Tab reaches the button; Enter and Space send); focus
  returns to the text box after a click-send; existing Enter/Shift+Enter tests still pass.
- **Unit — `tests/unit/core/helper/skills.test.ts`**, in the existing F52 style: `write-bio`
  contains the look-first steps, the "enough" bar, "one to three questions, one per message",
  point-to-what-you-saw, confirm-photo-guesses, no questions on rewrite/shorten, no second
  interview inside a build. `build-profile` contains observation-driven questions and the
  photo-guess guardrail, and still contains the five-to-ten and "Want me to build this now?"
  rules.
- **Fake model — new scenario `bio-interview`** in `src/adapters/fake/scenarios/`, registered
  in `src/adapters/fake/language-model.ts`, with a unit test alongside the others in
  `tests/unit/adapters/fake/scenarios.test.ts`. Played out as a pure function of the prompt
  (like the existing scenarios): on "Write a bio" → `load_skill` write-bio → `read_outline` →
  `list_media` → `view_photos` → a text question that names a photo → after the volunteer's
  answer → `set_field` on the bio (or `add_block` when the page has no bio) → `read_outline`
  re-read (the outline, since a freshly added block's id is not known in advance).
- **End-to-end — `tests/e2e/helper.spec.ts`:** with `x-fake-scenario: bio-interview`, click
  "Write a bio", see the question, type an answer and send it **with the Send button**, see the
  bio appear on the canvas.
- **Manual check against the real model (`MODEL=vertex`)** — the fake model proves the flow,
  not the quality of the questions. Three cats:
  1. photos but little text → "Write a bio" asks personalised questions that name what is in
     the photos;
  2. a well-filled page → "Write a bio" writes straight away;
  3. "shorten the bio" → no questions.

  Plus one "Build the page" run on a photo-rich empty page, checking its questions point at the
  photos, that no second interview starts after the yes, and that the first block still lands
  within 8 s (FR-080); and one "just write it" run. The full case list is in the plan's Task 5.
- **Process waiver:** this change skips the Spec Kit pipeline at the owner's request; the
  constitution's Waivers rule requires that to be recorded in the change description (plan
  Task 5). The actual replies get pasted back for review before the work is called done.
- All gates: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` (coverage
  thresholds), `pnpm build && pnpm test:e2e`.

## Risk to watch

The whole of parts 2 and 3 rests on Gemini following the skill text well: judging "enough"
sensibly, and writing questions that genuinely come from the photos. If the manual check shows
it skipping questions it should ask (or asking on a full page), the fix is sharper wording in
the skill — not new code.
