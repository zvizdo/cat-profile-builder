# Founding clarifications — session 2026-09-09

Input to `/speckit-specify`. Answers to 32 questions asked against `FOUNDING_IDEA.md`
and `.specify/memory/constitution.md`. This file is the record of decisions made
*before* the spec existed; once `specs/<feature>/spec.md` carries them, this is history.

## Scope and access

- **V1 covers all three surfaces**: builder, published profile page, and the multi-cat
  animated carousel. The AI helper is in v1.
- **One shelter, shared account.** No user table, no roles.
- **Auth**: a single predefined username and password held in environment variables.
  The password is verified with HMAC.
- **Scale**: tens of profiles, up to ~50.
- **Language**: English only. No translation layer.

## The profile document

- **Block types in v1**: hero (name + big photo), rich text / bio, photo, gallery, video.
- **Structured facts**: age and sex only. Both optional. Never required to publish.
- **Layout**: vertical stack of full-width sections. No columns, no free canvas.
- **Reordering**: drag-and-drop *plus* up/down buttons that work from the keyboard.
- **Colour**: curated themes plus bounded tuning of the gradient, with a contrast warning.
  The AI may suggest a theme and help tune it.
- **Media**: photos and videos are uploaded and stored in Google Cloud Storage.
  Limits — photos 25MB, videos 200MB.

## Storage and hosting

- **Profile documents**: JSON files in the Google Cloud Storage bucket. No database.
- **Hosting**: Google Cloud Run.
- **Draft and live are separate documents.** Editing a published profile changes the draft
  only; the public page updates on an explicit Publish.
- **Published URL**: readable slug plus a short id, e.g. `/cats/luna-7fk2`. Rename-safe,
  collision-proof.
- **Concurrent edits**: last write wins. No version check, no lock, no warning.
  See Accepted risks.
- **Draft safety**: the draft autosaves every few seconds and after every change.
- **Adopted cats**: no automatic behaviour. No status field. The volunteer unpublishes or
  deletes by hand.

## The AI helper

- **Entry**: photos and videos must be uploaded before the AI appears. The helper then runs
  a short interview — roughly 5-10 questions — and builds the first draft from the answers.
- **The AI sees photos only.** Uploaded videos are never sent to the model.
- **Manual path**: a volunteer may skip the interview at any time and build by hand. The
  helper stays available in the side panel either way.
- **Edit flow**: the helper states in plain words what it is about to do; the volunteer
  confirms conversationally; the edit then applies immediately.
- **Undo**: full session history — undo and redo every step back to when the builder opened.
  Not persisted across a reload.
- **Failure**: an AI call that fails or returns something invalid changes nothing, says what
  went wrong in plain language, and offers a retry. No partial application. No auto-retry.
- **Photo enhancement (Nano Banana)**: cleanup (light, colour, sharpness, noise), background
  removal or replacement, and smart crop to a block's aspect ratio. No generative restyling —
  the published cat must still look like the real cat.
- **Alt text**: generated on upload for *both* photos and videos by a cheaper Gemini 3.x
  model, as a one-or-two-sentence description. Not surfaced in the editor. The exact model
  ID is configuration fixed in an ADR, per Principle VI. This is a second, cheaper model
  boundary alongside the main text/page-edit model — note that it is the one exception to
  "the AI sees photos only": it receives the video too, purely to describe it.
- **Cost accounting**: none in v1. See Waivers.

## Carousel

- **Contents**: every published profile, automatically. No hand-picking, no named sets.
- **Surfaces**: a public web page, plus a fullscreen kiosk mode for an unattended event
  screen.
- **Motion**: cinematic everywhere — Ken Burns zooms, depth layers, 3D card transitions.
- **Frame-rate floor**: ≥ 30fps with twenty profiles loaded, on both the public page and
  kiosk. This replaces the constitution's default of 55fps. See Waivers.

## Success criterion

A volunteer who has never seen the app publishes a good-looking cat profile in under ten
minutes, unaided.

## Waivers against the constitution

Each needs recording in the spec and in the change description, per Governance → Waivers.

1. **Cost accounting** (Engineering Standards → AI and media guardrails): "Every model call
   MUST record token usage and cost." Waived for v1 — no logging, no estimate, no counter.
   Rejected alternative: silent server-side logging, which is cheap but was declined.
2. **Carousel frame-rate budget** (Quality Gates → Performance review): the default of
   ≥ 55fps with twenty profiles loaded is lowered to buy cinematic motion on every surface.
   The replacement floor is ≥ 30fps with twenty profiles loaded, on every surface.
   Rejected alternatives: automatic degradation on weak devices; cinematic on kiosk only;
   45fps; separate budgets per surface.

## Accepted risks

- **Last write wins.** One shared login means two volunteers can open the same cat at once,
  and the second save silently discards the first. Chosen deliberately over version checks
  or a soft lock.
- **Hidden alt text.** Nothing shows the volunteer what the model wrote about a real animal
  before it goes public.
