# Feature Specification: Cat Profile Builder

**Feature Branch**: `001-cat-profile-builder`

**Created**: 2026-09-09

**Status**: Draft

**Input**: `FOUNDING_IDEA.md` plus the 32 decisions recorded in
`references/project/founding-clarifications.md` (clarification session, 2026-09-09).

## Overview

A cat adoption volunteer builds a beautiful public profile page for a cat, section by
section, and publishes it. An AI helper sits beside the canvas: it can interview the
volunteer and produce a whole first draft from uploaded photos, then keep editing the page
on request. A second public surface plays every published profile as an animated carousel,
both as a shareable web page and as a fullscreen display for an adoption event.

This specification covers the entire first version. All three surfaces — builder, published
profile page, carousel — are in scope.

## Clarifications

### Session 2026-09-09

32 questions were asked and answered before this spec existed. The full record, including
rejected alternatives, is `references/project/founding-clarifications.md`. The decisions are
carried into the requirements below; this list is the audit trail.

- Q: How much of the product does v1 cover? → A: All three surfaces, AI helper included
- Q: Who signs in? → A: One shelter, one shared account, no roles
- Q: How do they log in? → A: One username and password from configuration, password checked with HMAC
- Q: How many profiles? → A: Tens, up to ~50
- Q: Which block types? → A: Hero, rich text/bio, photo, gallery, video
- Q: Structured facts? → A: Age and sex only, both optional
- Q: Layout freedom? → A: Vertical stack of full-width sections
- Q: Where do videos live? → A: Uploaded and stored in the media store
- Q: How are blocks reordered? → A: Drag-and-drop plus keyboard-operable up/down buttons
- Q: Colour control? → A: Curated themes plus bounded gradient tuning, AI may suggest and tune
- Q: Where are profile documents stored? → A: JSON documents in the media bucket, no database
- Q: Where does the app run? → A: A managed container host
- Q: Draft vs live? → A: Separate documents; the public page changes only on explicit Publish
- Q: Published URL shape? → A: Readable slug plus a short id
- Q: Concurrent edits? → A: Last write wins, no version check, no lock, no warning
- Q: Draft safety? → A: Autosave every few seconds and after every change
- Q: Adopted cats? → A: No automatic behaviour, no status field
- Q: Upload limits? → A: Photos 25MB, videos 200MB
- Q: What seeds an AI first draft? → A: Media upload is required first, then a 5-10 question interview
- Q: Does the AI see videos? → A: No, except the alt-text describer
- Q: Can the interview be skipped? → A: Yes, at any time; the helper stays available
- Q: How do AI edits land? → A: The helper states its intent, the volunteer confirms in conversation, the edit applies immediately *(superseded 2026-09-10: additive changes apply at once, undoable per turn; only destructive changes ask first)*
- Q: How far back does undo go? → A: Full session history, undo and redo, not persisted across reload
- Q: What happens when the AI fails? → A: Nothing changes, plain-language explanation, offer to retry *(superseded 2026-09-10: changes already applied in that turn stay, the helper says how far it got, and one undo removes them)*
- Q: What may photo enhancement do? → A: Cleanup, background removal or replacement, smart crop. No generative restyling *(superseded 2026-09-10: generative enhancement deferred; v1 enhancement is a deterministic one-click adjustment)*
- Q: Who writes alt text? → A: A cheaper model on upload, for photos and videos, not surfaced in the editor *(superseded 2026-09-10: it is surfaced and editable, never required)*
- Q: Is model cost recorded? → A: No, waived for v1
- Q: Which cats are in the carousel? → A: Every published profile, automatically
- Q: Where does the carousel run? → A: A public page plus a fullscreen kiosk mode
- Q: How ambitious is the motion? → A: Cinematic on every surface
- Q: What frame rate must it hold? → A: At least 30fps with twenty profiles loaded
- Q: What makes v1 a success? → A: A first-time volunteer publishes a good-looking profile in under ten minutes, unaided

### Session 2026-09-10 (planning — design handoff reconciliation)

A design handoff (`references/design/`) arrived after this spec was written and disagreed
with it in a dozen places. Each disagreement was put to the shelter at `/speckit-plan`; the
full ledger is `specs/001-cat-profile-builder/research.md` §2. Decisions:

- Q: Video length? → A: Upload any length up to 200MB; the trimmed clip must be 15 seconds or shorter to publish; only the trimmed clip is ever sent to a model
- Q: A 15-second clip on an 8-second carousel slot? → A: The carousel plays the first 8 seconds only
- Q: Structured facts beyond age and sex? → A: No — age and sex only, as already specified
- Q: Public page shape? → A: Free vertical stack, with three block types added from the design: "A day in her life", "What she needs", and "Quote"
- Q: Which cats are on the carousel? → A: Every live cat automatically; a volunteer may **archive** a cat, which takes the page down and off the carousel without deleting it
- Q: Hold time per cat on the carousel? → A: 8 seconds by default, changeable with a `hold` parameter on the kiosk URL
- Q: QR code on the carousel? → A: Yes, one per cat, linking to that cat's page
- Q: Who sees the alt text? → A: The model writes it; it is shown on the media tile and may be edited any time; editing is never required
- Q: Adoption call to action? → A: None
- Q: The builder on a phone? → A: Phone mode: upload, interview, helper-driven editing, name, age and sex, focal points, video trim, and publish. Manual block editing needs a tablet or laptop
- Q: First-time set-up in the app? → A: No — credentials stay configuration
- Q: Warn when two volunteers open the same cat? → A: No — accepted risk stands
- Q: A public "all cats" page? → A: Yes
- Q: Where does the one-line description come from? → A: An optional tagline field; the first sentence of the bio when empty
- Q: "Updated N days ago" and a footer line? → A: Neither

### Session 2026-09-10 (planning — integrity audit)

An audit of the plan against this spec and the constitution surfaced contradictions and
undecided behaviour. Decisions:

- Q: Keep Nano Banana (generative photo enhancement) in v1? → A: No. Deferred. v1 ships a deterministic one-click enhancement (auto-levels, light contrast and saturation, gentle sharpening) that never re-draws the cat. Re-framing is the focal point's job
- Q: What does one cat's turn on the carousel show? → A: One photo, or the clip, for the whole turn; a different one on each loop
- Q: Can a profile publish with an empty section? → A: No. Each empty section is named as missing
- Q: Does undo cover focal point, alt text and trim edits? → A: No. Undo covers the page document only; those editors save immediately and have their own way back
- Q: HEIC photos from iPhones? → A: The file picker accepts JPEG, PNG, WebP, MP4 and MOV; iOS converts HEIC on the way up; HEIC that arrives anyway is refused with a plain message
- Q: Delete a live or archived cat? → A: Not directly. Delete is offered on drafts only; unpublish first
- Q: Where does phone mode start? → A: Below 768 px. Tablets in either orientation get the full builder
- Q: Is a clip's sound kept? → A: No. Videos are silent everywhere. The audio track is dropped when the clip is processed, and no surface offers a way to turn sound on
- Q: Work while the connection is down? → A: The browser keeps a local copy of the working page and offers to restore it if the saved draft is older
- Q: How does the helper see the page? → A: It reads it on demand — outline, whole page, named blocks, media list, photos by id — and re-reads after a change to verify its work. Nothing is pushed (FR-082)
- Q: Can the helper look at photos? → A: Yes, by id, up to twelve per request (FR-082)
- Q: Can the helper set focal points, trim, or enhance? → A: No. Page edits only (FR-093)
- Q: Does the helper see the rendered page? → A: No. Data and photos only (FR-093)
- Q: Is there a special "generation" step for a first draft? → A: No. The helper edits the page the same way a person does — one operation at a time, autosaved — whether the page is empty or full. There are no modes, no begin/end markers
- Q: When does an AI change apply without asking? → A: Always, unless it is destructive — removing a section, overwriting text the volunteer wrote, replacing a photo the volunteer placed, dropping a gallery photo — in which case a card asks first
- Q: How is an AI change undone? → A: Everything the helper did in one response is one undo step; the volunteer's own edits stay one per action
- Q: The model fails part-way through a response? → A: What landed stays, saved. The helper says how far it got and offers undo and retry
- Q: Where does the interview live? → A: In a loadable skill — a written playbook the helper opens when asked to build a profile. A small catalogue of skills (build a profile, write a bio, pick a theme, tidy the order) replaces prompt rules; the content of "what a good profile is" is researched and written as a planning task

### Session 2026-09-12 (F23 — media delivery)

- Q: Who serves a photo or clip to a browser? → A: The application itself, under every storage mode. The shelter's cloud organisation forbids granting a bucket to "everyone" (a domain-restricted-sharing policy), so a browser cannot read a bucket directly. Every media URL a page carries is a same-origin path under `/media/`; the storage bucket keeps its name and layout but the application is its only reader. Uploads are unchanged. Originals are still never served (FR-075)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build and publish a profile by hand (Priority: P1)

A volunteer signs in, starts a new cat, uploads photos and a video from their phone, and
assembles a page: a hero with the cat's name, a bio, a gallery, a clip. They drag the
sections into the order they want, pick a colour theme, preview it, and publish. They share
the resulting link.

**Why this priority**: This is the product. Without it there is nothing to generate, nothing
to edit, and nothing for the carousel to show. It is also the only story that must work for
the shelter to get value on day one.

**Independent Test**: Sign in, create a cat, upload media, add each block type, reorder, pick
a theme, publish, and open the public link in a fresh browser with no session. Delivers a
shareable adoption page with no AI involved at all.

**Acceptance Scenarios**:

1. **Given** a signed-in volunteer on an empty new profile, **When** they upload three photos
   and add a hero, a bio, and a gallery block, **Then** the canvas shows those three sections
   stacked in the order added and the draft is saved without pressing anything.
2. **Given** a draft with four blocks, **When** the volunteer drags the third block above the
   second, **Then** the page reorders immediately and the new order survives a page reload.
3. **Given** a draft with four blocks, **When** the volunteer focuses a block with the keyboard
   and activates its "move up" control, **Then** the block moves up one position and focus
   stays on that block's control.
4. **Given** a complete draft, **When** the volunteer presses Publish, **Then** a public URL is
   produced, opening it in a session-less browser shows the profile, and the page contains
   nothing the volunteer did not enter.
5. **Given** a draft with no cat name, or with a photo whose description could not be
   generated, **When** the volunteer presses Publish, **Then** it is refused and the message
   names exactly what is missing.
6. **Given** a two-minute video uploaded from a phone, **When** the volunteer trims it to the
   ten seconds worth showing, **Then** the published page plays only that section, the full
   original is still held, and the trim can be changed or removed later.
7. **Given** a published profile, **When** the volunteer tries to delete a photo it uses,
   **Then** the deletion is refused and the message names that profile.
8. **Given** a published profile, **When** the volunteer edits the draft and does not
   republish, **Then** the public page still shows the previously published version.
9. **Given** a published profile, **When** the volunteer unpublishes it, **Then** new visitors
   to that URL no longer see the profile.

---

### User Story 2 - Generate a first draft with the AI helper (Priority: P2)

A volunteer starts a new cat and uploads photos and videos. Only then does the AI helper
appear. It asks a short series of questions — the cat's name, rough age, temperament, the
story worth telling — and from the answers plus the photos it builds a complete first draft:
blocks chosen and ordered, bio written, theme picked, images placed. The volunteer then
adjusts by hand.

**Why this priority**: This is what makes a ten-minute profile possible and is the founding
idea's headline moment. It depends on Story 1 existing, and Story 1 is useful without it.

**Independent Test**: Upload photos, complete the interview, and confirm a populated,
publishable draft appears in the canvas that a human could publish unchanged.

**Acceptance Scenarios**:

1. **Given** a brand-new profile with no media uploaded, **When** the volunteer looks for the
   AI helper, **Then** it is not available and the reason is stated in plain words.
2. **Given** at least one uploaded photo, **When** the volunteer asks the helper to build the
   page, **Then** it loads its build-profile skill and begins an interview of between five and
   ten questions.
3. **Given** an interview in progress, **When** the volunteer chooses to stop early, **Then**
   the helper builds a draft from the answers given so far without complaint.
4. **Given** a completed interview, **When** the helper builds the page, **Then** blocks appear
   on the canvas as they are produced rather than after a wait, the first within eight seconds,
   and everything the helper did in that response is a single undoable step.
5. **Given** the helper is still working, **When** the volunteer tries to publish, **Then**
   it is refused until the helper finishes.
6. **Given** a response that fails part-way through, **When** it stops, **Then** the sections
   already added remain, saved, the helper says how many it added before stopping, and one
   undo removes them.
7. **Given** a brand-new profile with uploaded media, **When** the volunteer chooses to skip
   the interview, **Then** they get an empty canvas to build by hand and the helper remains
   available in the side panel.
8. **Given** uploaded videos, **When** the helper builds the draft, **Then** the video files
   themselves were never sent to the drafting model.

---

### User Story 3 - Edit an existing page by talking to the helper (Priority: P3)

The volunteer asks the helper in plain language to change something — warm up the background,
shorten the bio, move the video above the gallery, add a section about the cat's favourite
box. The helper says what it is about to do, the volunteer confirms, and it happens. Anything
the volunteer dislikes is undone in one step.

**Why this priority**: Turns the helper from a one-shot generator into the assistant the
founding idea describes. Story 2 delivers value without it.

**Independent Test**: With a populated draft, issue several edit requests of different kinds
and confirm each is described first, applied on confirmation, visible as a change, and
reversible.

**Acceptance Scenarios**:

1. **Given** a populated draft, **When** the volunteer asks for an additive change — a new
   section, a warmer theme, a different order — **Then** it applies at once and the volunteer
   is shown what changed, with one undo for the whole response.
2. **Given** a populated draft, **When** the volunteer asks for something destructive —
   remove a section, rewrite a paragraph they wrote, swap a photo they placed — **Then** the
   helper states in plain language what will be lost and waits for confirmation before
   touching it.
3. **Given** a stated destructive intent, **When** the volunteer declines or asks for
   something different, **Then** the document is untouched.
4. **Given** several applied AI and manual changes in one sitting, **When** the volunteer
   undoes repeatedly, **Then** each step reverses in order back to the state at which the
   builder was opened, and redo replays them.
5. **Given** an AI edit that would delete a section or overwrite text the volunteer wrote,
   **When** the helper proposes it, **Then** the destructive nature is stated explicitly
   before confirmation is asked.
6. **Given** a model response that does not conform to the allowed edit operations, **When**
   the system receives it, **Then** the document is unchanged, the helper explains what was
   refused in plain words, and offers to try again.
7. **Given** text inside a cat's bio or a filename that reads like an instruction, **When**
   the helper is made aware of the page, **Then** that text does not change what the helper is
   able to do.

---

### User Story 4 - Visitors watch the carousel (Priority: P4)

A visitor opens the carousel page and every published cat glides past in a looping, cinematic
sequence, each linking through to its full profile. At an adoption event the same carousel
runs fullscreen on a laptop plugged into a TV, unattended, all day.

**Why this priority**: A second public surface that multiplies the value of profiles that
already exist. Nothing else depends on it.

**Independent Test**: Publish several profiles, open the carousel, and confirm every published
cat appears, advances automatically, is navigable by keyboard, and can be paused. Run kiosk
mode on a screen for a full session.

**Acceptance Scenarios**:

1. **Given** several published profiles, **When** a visitor opens the carousel, **Then** every
   published profile appears and the sequence loops without an end.
2. **Given** a cat with several photos and a trimmed video, **When** their turn comes,
   **Then** they get eight seconds of one photo moving cinematically — or their clip playing
   silently — with their name and one line legible throughout, and a different photo or the
   clip the next time the loop reaches them.
3. **Given** a cat with a single photo and no video, **When** their turn comes, **Then** their
   eight seconds are filled from that one photo rather than skipped or left blank.
4. **Given** a profile is published or unpublished, **When** the carousel is next loaded,
   **Then** it appears or disappears without anyone editing the carousel.
5. **Given** the carousel is auto-advancing, **When** the visitor uses arrow keys or on-screen
   controls, **Then** they move between cats manually and auto-advance pauses.
6. **Given** a visitor whose system requests reduced motion, **When** they open the carousel,
   **Then** it does not auto-advance, the cinematic effects are suppressed, and it remains
   fully usable by keyboard and pointer.
7. **Given** a cat on screen, **When** the visitor selects it, **Then** they arrive at that
   cat's full published profile.
8. **Given** kiosk mode running on an event display, **When** it has run for eight hours
   unattended, **Then** it is still advancing and has not degraded or crashed.
9. **Given** no profiles are published, **When** anyone opens the carousel, **Then** they see
   a calm, deliberate empty state rather than a broken or blank page.

---

### User Story 5 - Enhance a volunteer's snapshot (Priority: P5)

A phone photo taken in a dim shelter room is lifted with one click — brightness range
stretched, a little contrast and colour, a touch of sharpening — so it sits well on the page.
The adjustment is deterministic: the same photo always gives the same result, and nothing in
the picture is invented or re-drawn. The volunteer can always see it is enhanced and can
always go back to the original.

**Why this priority**: Raises the visual bar, but every other story ships without it and a
profile made only of untouched photos is still a good profile. Generative enhancement — a
clean backdrop, background replacement, extending edges — was considered for v1 and deferred
(Out of Scope), because its quality cannot be tested and it risks changing the cat.

**Independent Test**: Upload a dim photo, enhance it, confirm the result is visibly marked as
enhanced and looks better, and revert it to the original.

**Acceptance Scenarios**:

1. **Given** an uploaded photo, **When** the volunteer requests enhancement, **Then** a single
   fixed adjustment is applied and they see the original and the result side by side before
   accepting.
2. **Given** an enhanced photo, **When** the volunteer views it in the builder, **Then** it is
   plainly marked as enhanced and the original is still available.
3. **Given** an enhanced photo, **When** the volunteer reverts it, **Then** the original image
   is restored in the block they enhanced.
4. **Given** the same photo used in both the hero and a gallery, **When** the volunteer
   enhances it in the hero, **Then** the gallery block still shows the original.
5. **Given** an enhanced photo, **When** anyone inspects its record, **Then** it names which
   adjustment recipe produced it and from which source image.
6. **Given** the same photo enhanced twice, **When** the results are compared, **Then** they
   are identical — the adjustment is deterministic and involves no model.

---

### Edge Cases

**Media**

- A photo over 25MB or a video over 200MB is rejected server-side with a plain message naming
  the file and the limit. A file whose extension lies about its type is rejected on its actual
  content, not its name.
- Location metadata is stripped from every photo before it can be published.
- A media file that fails to upload leaves the draft untouched and can be retried.
- A block referencing media that has since been deleted renders an explicit missing-media state
  rather than a broken image. Media a published profile uses cannot be deleted in the first
  place, so this state is reachable only from a draft.
- The alternative-text describer is down when a volunteer uploads: the upload still succeeds,
  the media is marked as needing a description, and the volunteer is asked to write one before
  they can publish.
- A volunteer trims a video after its description was written: the description and the poster
  frame are regenerated, so neither refers to footage that was cut.
- A volunteer trims a video down to nothing, or to a fraction of a second: the trim is refused
  with a stated minimum.
- A photo used in two blocks is enhanced in one of them: only that block changes, and the other
  keeps the original.
- A photo arrives as HEIC despite the picker's filter (dragged from a desktop, say): it is
  refused with the accepted formats named. Nothing is added.
- A video is uploaded sideways from a phone: it is shown the right way up everywhere; rotation
  is applied before metadata is stripped.
- Video processing fails part-way: the upload is rejected as a whole and nothing is added. If
  only the poster frame fails, the video is kept and a deliberate placeholder stands in for the
  poster.
- The connection drops while editing: the browser keeps working from its local copy; when the
  profile is reopened, if that copy is newer than the saved draft, the volunteer is offered it.

**The document**

- A stored profile that fails validation is surfaced as an error and is never partially
  rendered or silently repaired.
- An older stored profile is migrated on load through a tested migration path.
- Two volunteers editing the same cat at once: the later save wins and the earlier volunteer's
  changes are lost silently. This is an accepted risk (see Accepted Risks).
- Publishing a cat whose name collides with an existing one produces a distinct URL, because
  the address carries a short id as well as the name.
- Renaming a cat does not break a URL that has already been shared.
- A profile with no blocks cannot be published; the volunteer is told what is missing.

**The AI helper**

- The model is unreachable, times out, or returns something that does not conform: the
  document is untouched, the failure is explained in plain language, and a retry is offered.
  Nothing is partially applied and nothing is retried silently.
- A truncated model response is reported as truncated, never presented as complete.
- The volunteer asks the helper to publish, unpublish, share, or delete: the helper declines
  and explains that these are the volunteer's actions alone.
- The helper is asked for something outside its declared edit operations: it says what it
  cannot do instead of approximating.

**Presentation**

- A published profile is opened while its images and video are still loading: it stays readable
  and navigable throughout.
- A published profile is opened at phone width: it works.
- A volunteer tunes a gradient into a combination that makes text hard to read: they are warned
  before publishing.
- A video whose poster frame could not be extracted shows a deliberate placeholder rather than
  a black box.
- A volunteer publishes over a contrast warning: the page goes live as designed, and the
  failure is theirs by decision rather than by defect. See Constitution Waivers, item 3.
- A visitor opens the link to a cat who has since been unpublished or deleted: they get a
  standard not-found page.
- A cat in the carousel has only one photo and no video: their eight seconds are filled from
  that single photo rather than left blank or skipped.

**Access**

- Wrong credentials are refused without revealing which half was wrong. Repeated attempts are
  not limited in v1; see Constitution Waivers, item 4.
- A signed-out volunteer who opens a builder URL is sent to sign in and returned afterwards.
- The public profile page and the carousel require no sign-in and expose nothing that is not
  published.

## Requirements *(mandatory)*

### Access

- **FR-001**: The system MUST require sign-in for every builder surface and every action that
  changes a profile, and MUST require no sign-in for a published profile page or the carousel.
- **FR-002**: The system MUST accept exactly one username and password pair, supplied as
  configuration rather than stored per-user, and MUST verify the password without comparing it
  in a way that leaks timing.
- **FR-003**: The system MUST NOT distinguish, in what it tells the visitor, between an unknown
  username and a wrong password.
- **FR-004**: *Withdrawn.* Sign-in attempts are not rate-limited in v1. See Constitution
  Waivers, item 4.
- **FR-005**: The system MUST keep a signed-in volunteer signed in across page reloads and MUST
  offer a way to sign out.

### Media

- **FR-006**: Volunteers MUST be able to upload photos and videos from a phone or a computer,
  including several at once.
- **FR-007**: The system MUST reject an upload larger than 25MB for a photo or 200MB for a
  video, and MUST state the reason in plain language.
- **FR-008**: The system MUST validate every upload server-side for actual file type, size, and
  image dimensions, and MUST reject anything that fails, explicitly. Accepted types are JPEG,
  PNG and WebP for photos and MP4 and MOV for video. A photo narrower than 1200 px on its long
  edge MUST warn that it may look soft but MUST NOT be refused.
- **FR-009**: The system MUST strip location metadata from photos before they can be published.
- **FR-010**: The system MUST store uploaded media outside the source repository, durably, and
  MUST serve it to public visitors without exposing any credential.
- **FR-011**: The system MUST generate a one-or-two-sentence description of every uploaded
  photo and video on upload, for use as alternative text, without asking the volunteer. The
  description MUST be visible on that media's detail view in the builder and MUST be
  editable by the volunteer at any time; reviewing or editing it MUST NOT be required.
- **FR-012**: The system MUST NOT publish a photo or video that has no alternative text.
- **FR-013**: The system MUST show the volunteer which media are attached to a profile and let
  them remove media they no longer want.
- **FR-073**: When automatic alternative text cannot be produced — the describing model is
  unreachable, times out, or returns nothing usable — the system MUST say so in plain language
  and MUST let the volunteer write the description by hand.
- **FR-074**: The system MUST refuse to publish while any photo or video in the profile still
  has no alternative text, and MUST name which media are missing it.
- **FR-075**: The system MUST NOT serve an original uploaded file to a public visitor. It MUST
  deliver a version sized for the surface requesting it, and MUST retain the original for
  enhancement, trimming, and reverting. *(Amended 2026-09-12, F23: every delivered version is
  served by the application itself under a same-origin `/media/` path, in every storage mode —
  no media URL points at a storage bucket, because the shelter's cloud organisation forbids
  public buckets. A video is served with byte-range support so a browser can seek in it.)*
- **FR-076**: The system MUST refuse to delete a media file that a published profile still
  uses, and MUST name the profile that uses it.
- **FR-077**: The system MUST extract a poster frame from every video once it has a clip of
  publishable length — immediately for a video of fifteen seconds or less, otherwise as soon
  as it is trimmed — and MUST regenerate it if the trim changes.
- **FR-078**: Volunteers MUST be able to trim an uploaded video to a chosen start and end
  point. The trimmed version is what publishes; the full original MUST be retained, and the
  trim MUST remain adjustable and removable. A clip on a profile MUST be fifteen seconds or
  shorter: a video longer than that MUST be trimmed before the profile can publish, and a
  trim longer than fifteen seconds MUST be refused with that number.
- **FR-079**: When a video is trimmed, its alternative text and poster frame MUST be
  regenerated from the trimmed version, so that neither describes footage a visitor cannot
  see. No model MUST ever receive more than the trimmed clip — never the original — and
  therefore never more than fifteen seconds of video.

### The profile document

- **FR-014**: A profile MUST be a single document with a version stamp, holding the cat's name,
  optional age, optional sex, an optional one-line tagline of at most 80 characters, an ordered
  list of blocks, and a theme. Wherever a surface shows the cat's name with one short line —
  the hero and the carousel — that line is the tagline, or the first sentence of the bio when
  the tagline is empty.
- **FR-015**: The cat's name, age, and sex MUST NOT be required to save a draft, but MUST be
  required to publish (Checkpoint 2, F1), because a carousel or hero shown at scale needs to
  say who this cat is; the public address, the page title, and the carousel slide are all
  built from the name specifically.
- **FR-016**: The system MUST support exactly these block types in v1: hero (cat name and one
  full-bleed photo), rich text bio, single photo, photo gallery, video, "a day in her life"
  (three photos each with a short caption, presented as a pinned scroll scene), "what she
  needs" (one to three short titled cards), and quote (one photo with a short line and an
  optional attribution). No other block types. Every profile MUST hold exactly one hero
  block, fixed as the first block in the stack (Checkpoint 2, F1): it MUST NOT be removed,
  duplicated, or moved, and a document with no hero, or with one anywhere but first, is
  invalid — the hero's photo MUST also be set to publish.
- **FR-017**: Blocks MUST form a single vertical stack of full-width sections. Side-by-side
  columns and free positioning are out of scope.
- **FR-018**: The system MUST validate every profile document against its schema when loading
  and before saving, and MUST surface a failure as an error rather than rendering it partially
  or repairing it silently.
- **FR-019**: The system MUST migrate a document written by an earlier version of the schema
  when loading it.
- **FR-020**: The system MUST NOT render volunteer-written or model-written text as markup.

### The builder

- **FR-021**: Volunteers MUST be able to add, edit, duplicate, and remove blocks. A profile
  holds exactly one hero, fixed at the top of the stack (Checkpoint 2, F1): it MUST NOT be
  duplicated, removed, or reordered away from the first position, whether from the builder's
  own controls or the AI helper's edits.
- **FR-022**: Volunteers MUST be able to reorder blocks by dragging, and MUST equally be able
  to reorder them using controls reachable and operable from the keyboard alone.
- **FR-023**: The system MUST autosave the draft after every change, and at least once every
  five seconds while changes are pending, without the volunteer pressing anything.
- **FR-024**: The system MUST restore a volunteer's work when they reopen a profile after a
  crash, a closed tab, or a lost connection, losing no more than the last five seconds of it.
- **FR-025**: The system MUST offer undo and redo covering every change to the page document
  made since the builder was opened, both manual edits and AI edits. History need not survive
  a reload. Edits to a media record — focal point, description, trim, enhancement — save
  immediately, are outside undo, and each MUST offer its own way back (reset, re-edit, clear,
  revert).
- **FR-026**: The system MUST offer a preview that shows the draft exactly as a visitor would
  see it.
- **FR-027**: An error anywhere in the builder MUST leave the current draft recoverable and MUST
  tell the volunteer in plain language what failed and what to do next.
- **FR-028**: The system MUST list all profiles with enough information to find one — name,
  a thumbnail, and whether it is draft, live, or archived.
- **FR-091**: On a screen narrower than 768 px, the builder MUST offer the same capabilities
  as the full builder, laid out in one column: Facts and Theme collapsed to one line each at
  the top, the blocks with their editors in place and up/down reordering, Add section as a
  sheet, Media and CATalyst as bottom drawers (full, peek and half states for CATalyst), and
  Preview as a page. Nothing on the phone is read-only. *(Rewritten 2026-09-13, F44/F45 —
  design `docs/design/2026-09-13-phone-builder-design.md`. Until then the phone
  was a read-only preview with the facts, the media library and the helper, and the helper
  alone added, edited, reordered and removed blocks and tuned the theme; the Clarifications
  entries that describe that mode stay as a dated log.)*

### Theme and colour

- **FR-029**: The system MUST offer a set of curated themes covering background, gradient, text
  colour, and accent, each of which meets contrast requirements as shipped.
- **FR-030**: Volunteers MUST be able to adjust a chosen theme's gradient within bounds that the
  document schema enforces. Free-form styling is out of scope.
- **FR-031**: The system MUST warn the volunteer before publishing if their adjustments have
  made text fail contrast requirements. The warning MUST name what fails and MUST offer to
  restore a passing combination, but the volunteer MAY publish anyway. See Constitution
  Waivers, item 3.

### The AI helper — first draft

- **FR-032**: The system MUST NOT offer the AI helper on a new profile until at least one photo
  has been uploaded, and MUST say why it is unavailable.
- **FR-033**: When asked to build a profile, the helper MUST follow a written playbook (a
  "skill") that interviews the volunteer — five to ten questions, one at a time, adapted to
  the photos — before building. Skills are checked-in project text, editable without a code
  change, and MUST NOT be sourced from volunteer content.
- **FR-034**: Volunteers MUST be able to end the interview early and have the helper propose a
  draft built from the answers given so far; it builds only after a clear yes. *(amended
  2026-09-12: however the interview ends — early on the volunteer's own words, or once the
  helper judges it has enough — the helper MUST propose first: a short plain-text message
  naming the sections it will add, in order, the tagline direction, and the theme it will
  pick, ending "Want me to build this now?" It MUST NOT build without a clear yes; "not yet"
  or a new detail continues the conversation instead. There is no "Build it now" button — the
  volunteer's own words, in conversation, are the typed shortcut.)*
- **FR-035**: Volunteers MUST be able to skip the helper entirely and build by hand, with the
  helper remaining available afterwards.
- **FR-036**: A first page built by the helper MUST populate blocks, written text, placed
  images, and a theme. There is no separate generation step: the helper builds it with the
  same operations it uses for any edit, and everything it does in one response counts as one
  undoable step.
- **FR-037**: The system MUST NOT send uploaded video files to the drafting model. The
  alternative-text describer is the sole exception and receives them only to describe them.
- **FR-080**: A first draft MUST assemble visibly on the canvas as it is produced, rather than
  behind a wait. The first block MUST appear within eight seconds of the volunteer finishing the
  interview.

**Amendment 2026-09-13 (F57 § F52):** Eight seconds, not five — the first-block latency remains a target at the model's unchanged default thinking. F52's ten local builds (same cat, same photos and interview answers, `gemini-3.8-flash`) delivered first change in 4.6–7.4 s (median 5.8 s), with 3 of 10 passing ≤ 5 s and all 10 passing ≤ 8 s. The cost is the model's own reasoning before its first tool call (~5 s), which neither `thinkingLevel` nor `thinkingBudget` parameter changes on Gemini 3.8 Flash; variants tested in F52 §5.

- **FR-081**: While the helper is working, the builder MUST say so and MUST refuse to publish
  until it finishes. A response that fails part-way MUST leave what it already applied in
  place and saved, MUST say how far it got, and MUST be removable with the single undo of
  FR-036.

### The AI helper — editing

- **FR-038**: The helper MUST apply additive and neutral changes — adding a section, filling
  an empty field, changing the theme, reordering — as soon as it makes them, without asking,
  and MUST show what it did. For a destructive change (FR-043) it MUST state in plain
  language what will be lost and MUST wait for the volunteer's confirmation before altering
  the document.
- **FR-039**: Every AI change MUST be expressed as one of the document's declared operations —
  set a field, add a block, remove a block, reorder blocks, change the theme, replace an image.
  The helper MUST NOT write raw document data, markup, or styles.
- **FR-040**: Every AI change MUST be validated against the document schema before it is
  applied; a change that fails validation MUST leave the document untouched and MUST tell the
  volunteer what was refused.
- **FR-041**: Every AI change MUST be reversible in a single undo that restores the exact prior
  document.
- **FR-042**: The system MUST show the volunteer what an applied change actually altered.
- **FR-043**: A destructive change — removing a section, replacing text the volunteer wrote,
  replacing an uploaded photo — MUST be named as destructive before confirmation is requested.
- **FR-044**: The helper MUST NOT publish, unpublish, archive, restore, share, or delete a
  profile under any circumstance.
- **FR-045**: Page content given to the helper as context MUST be treated as data. Text inside
  a bio, a cat's name, or a filename MUST NOT be able to widen what the helper can do.
- **FR-046**: A single non-conforming change MUST be refused and change nothing. A model
  call that fails or times out MUST be explained in plain language, naming what was applied
  before it stopped (or that nothing was), and MUST offer a retry and an undo of that
  response. The system MUST NOT retry silently.
- **FR-047**: A truncated model response MUST be reported as truncated.
- **FR-048**: *Withdrawn.* Model-backed endpoints are not rate-limited in v1. See Constitution
  Waivers, item 4.
- **FR-049**: No model credential may be reachable from the browser or present in what is
  served to it.
- **FR-082**: Nothing about the page is sent to the model unasked. The helper reads what it
  needs through read operations — the page's outline, the whole page as text, named blocks,
  the list of every photo and clip the cat has (whether or not it is on the page) with its
  description, and photos by id — and re-reads to check its own work after a change. Photos
  are bounded to twelve per request, always downscaled rather than sent at their uploaded
  size; text reads are bounded by the size of the document itself. This bound is the only
  ceiling on the cost of a single request, since neither rate limiting nor cost accounting
  exists in v1.
- **FR-093**: The helper's reach is exactly: the read operations of FR-082, loading a skill
  (FR-033), and the six page edit operations (FR-039). It has no mode, no separate generation
  step, and no begin or end marker. It MUST NOT be given any way to change a
  media record — focal point, description, trim, enhancement — nor any view of the rendered
  page; it reasons from what it reads.

### Photo enhancement

- **FR-050**: Volunteers MUST be able to request enhancement of an uploaded photo. In v1 this is
  a single deterministic adjustment — brightness range, light contrast and colour, gentle
  sharpening — with no options and no model.
- **FR-051**: Enhancement MUST NOT invent, remove, or re-draw anything in the photo. The same
  input MUST always produce the same output.
- **FR-052**: An enhanced photo MUST be visibly distinguishable from the original in the
  builder, MUST be shown beside the original before it is accepted, and the original MUST be
  retained.
- **FR-053**: Enhancing a photo MUST produce a new media asset linked to its original, and MUST
  replace the photo only in the block the volunteer was working in. Other blocks using the same
  original MUST be left untouched. Reverting restores the original in that block.
- **FR-054**: Every enhanced image MUST record which adjustment recipe (by name and version)
  produced it and from which source image.

### Publishing

- **FR-055**: Draft and published versions MUST be separate. Editing a draft MUST NOT change
  what a visitor sees.
- **FR-056**: Publishing MUST be an explicit action taken by the volunteer.
- **FR-057**: Publishing MUST produce a stable public address combining a readable form of the
  cat's name with a short identifier, and that address MUST NOT change when the cat is renamed.
- **FR-058**: The system MUST be able to unpublish a profile, and unpublishing MUST take effect
  for new visitors immediately.
- **FR-059**: A published page MUST contain only what the volunteer put in the profile — no
  internal identifiers, no draft content, no contact details the volunteer did not enter.
- **FR-060**: The system MUST refuse to publish a profile that has no blocks, that has no cat
  name, that has no age, that has no definite sex, that contains media without alternative
  text, that contains a video whose clip is longer than fifteen seconds or not yet trimmed to
  that length, that contains media still being processed, or that contains an empty section —
  a hero, photo, video or quote with no media, a bio with no text, a gallery with no photos, a
  day scene with no photo or no caption, a needs card with no text — and MUST say exactly what
  is missing, naming the section (Checkpoint 2, F1: age, sex, and the hero's photo join the
  name as required to publish).
- **FR-083**: A request for the address of a profile that has been unpublished, archived, or
  deleted MUST return a standard not-found response. A request whose readable part does not
  match the current name but whose short identifier does MUST be redirected to the current
  address.
- **FR-092**: Deleting a profile MUST be offered only while it is a draft. A live or archived
  profile MUST be unpublished first.
- **FR-086**: Volunteers MUST be able to archive a live profile in one action. An archived
  profile's public address MUST return not-found, it MUST leave the carousel and the public
  index, and it MUST remain in the builder's list, marked archived, with its draft still
  editable. Archiving MUST NOT delete anything.
- **FR-087**: Volunteers MUST be able to restore an archived profile to live in one action,
  and the restored page MUST be exactly the page that was live when it was archived. Media
  used by an archived profile is protected from deletion exactly as media used by a live one
  (FR-076).
- **FR-090**: There MUST be a public page listing every live profile — name, one photo, and a
  link to each — that reflects publishing, archiving and unpublishing without anyone editing
  it. It MUST contain nothing the profile page itself would not show.

### The carousel

- **FR-061**: The carousel MUST include every published profile automatically, with no
  selection step, and MUST reflect publishing and unpublishing without anyone editing it.
- **FR-062**: The carousel MUST advance automatically and loop indefinitely.
- **FR-084**: Each live cat MUST get a turn of eight seconds by default. A turn shows one of
  the cat's photos with cinematic motion, or the cat's trimmed clip played without sound and
  cut at the end of the turn. On each successive loop the cat shows its next photo or the
  clip, so over time every photo and the clip are seen; a cat with a single photo shows it
  every turn. The cat's name and one short line drawn from the profile MUST be
  legible throughout, at a distance appropriate to an event display.
- **FR-063**: The carousel MUST always be pausable and manually navigable, by pointer and by
  keyboard.
- **FR-064**: Selecting a cat in the carousel MUST lead to that cat's published profile.
- **FR-065**: The system MUST offer a fullscreen kiosk presentation intended to run unattended
  on an event display, without builder controls.
- **FR-066**: Kiosk mode MUST run for at least eight continuous hours without stalling, crashing,
  or losing frame rate, and MUST pick up newly published profiles without a human restarting it.
- **FR-067**: When no profiles are published, the carousel MUST show a designed empty state that
  says no cats are currently listed, rather than a blank, broken, or endlessly loading page.
- **FR-088**: Each cat's carousel sequence MUST show a scannable QR code that resolves to that
  cat's published page. It MUST be rendered with high error correction and stay crisp on a
  1080p display.
- **FR-089**: The hold time per cat MUST default to eight seconds and MUST be adjustable by a
  `hold` parameter on the carousel and kiosk URLs, clamped to a stated range. No settings
  screen exists.

### Presentation and accessibility

- **FR-068**: Every user-facing surface MUST meet WCAG 2.1 Level AA — semantic structure, full
  keyboard operability, visible focus, labelled controls, sufficient contrast, and meaningful
  alternative text for every photo and video.
- **FR-069**: The system MUST honour a reduced-motion preference. Under it the carousel MUST
  NOT auto-advance, cinematic effects MUST be suppressed, video MUST NOT play by itself on any
  surface, and everything MUST remain usable.
- **FR-085**: A video on a published profile MUST play automatically, silently, and loop, and
  MUST offer a visible control to pause it. Videos are silent on every surface: the audio
  track is removed when the clip is processed, and nothing offers a way to turn sound on.
  FR-069 overrides the automatic playback.
- **FR-070**: Every published profile MUST work at phone width and MUST remain readable and
  navigable while images and video are still loading.
- **FR-071**: Motion MUST NOT block interaction on any surface.
- **FR-072**: All styling MUST derive from one shared set of design tokens. Volunteer-chosen
  colours are constrained document data, not free-form styling.

### Key Entities

- **Profile**: One cat. Carries a schema version, the cat's name, optional age, optional sex,
  optional tagline, an ordered list of blocks, a theme, and its publication state — draft,
  live, or archived. Exists as a draft and, once published, as a separate published version
  that archiving sets aside and restoring brings back.
- **Block**: One section of the page. Has a type (hero, rich text, photo, gallery, video, day
  in her life, what she needs, quote), a position in the stack, and type-specific content. Every block referencing media points at
  media assets rather than embedding them.
- **Media asset**: One uploaded photo or video. Carries its type, size, dimensions or duration,
  its focal point, its alternative text and whether that text was written by a model or by a
  volunteer, the sized versions delivered to visitors, and — for a video — its poster frame
  and any trim. An
  enhanced photo is a separate asset carrying a link to its original and the name and version
  of the adjustment recipe that produced it.
- **Theme**: The colour treatment of a profile. A curated preset plus bounded adjustments,
  constrained by the document schema.
- **Helper session**: One conversation between a volunteer and the AI helper. Its only states
  are locked (no photo yet) and working (a response is streaming). Each response's edits form
  one entry in the sitting's undo history. Not retained after the builder is closed.
- **Product name**: The AI helper's product name is CATalyst, shown to volunteers as "CATalyst
  AI Assistant" the first time a surface names it and "CATalyst" after that. This specification
  keeps saying "the helper" throughout for the generic role — every FR wording is unchanged.
- **Edit operation**: A single declared change to a profile — set a field, add a block, remove
  a block, reorder blocks, change the theme, replace an image. The only vocabulary in which the
  AI helper may express a change, and the unit of undo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A volunteer who has never seen the application publishes a complete cat profile —
  name, bio, and at least one photo — in under ten minutes, unaided and with no written
  instructions, in at least four of five trials with different people. In each trial the
  shelter accepts the published page as ready to share without further editing.
- **SC-002**: In at least eight of ten trials, an AI-generated first draft is publishable after
  fewer than five manual corrections.
- **SC-003**: The carousel sustains at least 30 frames per second with twenty published profiles
  loaded, on both the public page and the kiosk display.
- **SC-004**: A published profile page reaches its largest contentful paint within 2.5 seconds
  on a mid-tier mobile connection.
- **SC-005**: Every user-facing surface passes automated accessibility checks with zero
  violations and is fully operable using only a keyboard. Contrast produced by a volunteer's
  own gradient tuning is excluded from this count, since FR-031 lets them publish over the
  warning; everything the system itself ships must pass.
- **SC-006**: Every AI change, of every declared operation type, is reversed by a single undo
  that restores the document exactly.
- **SC-007**: After a browser crash or closed tab, reopening a profile loses no more than the
  last five seconds of work.
- **SC-008**: A kiosk display runs eight hours unattended without stalling, crashing, or needing
  a restart.
- **SC-009**: Every rejected upload and every refused AI change produces a message that names
  the reason in plain language, with zero silent failures.
- **SC-010**: 100% of published photos and videos carry alternative text.
- **SC-011**: No credential for any external service is present in anything served to a browser.
- **SC-012**: A profile that a volunteer has not republished never shows draft content to a
  visitor, in 100% of cases.
- **SC-013**: The first change to the page — the hero's facts and photo, or a new section —
  appears on the canvas within eight seconds of the volunteer finishing the interview, in at
  least nine of ten attempts.
- **SC-014**: No public visitor ever receives an original uploaded file; every image delivered
  to a profile page or the carousel is a version sized for that surface, in 100% of cases.
- **SC-015**: 100% of published media carry alternative text, whether written by a model or by
  a volunteer, and every case where automatic generation failed was surfaced to the volunteer
  rather than passed over.
- **SC-016**: No attempt to delete media in use by a published profile succeeds, and every
  refusal names the profile responsible, in 100% of cases.

## Out of Scope for v1

- Multiple organisations, multiple user accounts, or any role distinction.
- Any adoption workflow: applications, enquiries, contact forms, calls to action, or an
  adoption status. Archiving (FR-086) is a manual action with no adoption meaning attached;
  a volunteer archives, unpublishes or deletes by hand.
- Search, filtering, sorting, or tagging of profiles.
- Side-by-side layout columns and free block positioning.
- Video hosted elsewhere and embedded by link.
- Hand-picked or named carousel collections, carousel ordering, or a carousel settings screen.
- Any language other than English.
- Custom domains for published profiles.
- Generative photo enhancement — placing the cat on a clean backdrop, replacing or removing the
  background, extending edges to fit a frame (Nano Banana). Deferred; the enhancement slot in
  the design is where it plugs in later.
- A "first time here" set-up flow, invite codes, or password recovery in the app.
- A warning when two volunteers have the same cat open.
- An "updated N days ago" line or a footer on public pages.
- Analytics, visitor counts, or social sharing metadata beyond what a link preview needs.
- Model cost reporting and rate limiting of any kind (see Constitution Waivers).
- Editing video beyond choosing a start and end point — no cropping, no joining clips, no
  captions, no audio editing.
- Reviewing alternative text as a required step. It is visible and editable (FR-011) but
  nobody is asked to read it; a volunteer must write it only when automatic generation failed.
- Undo history that survives a page reload.

## Assumptions

Reasonable defaults chosen where the clarification session did not decide. Each is a candidate
for correction during planning.

- **Rich text scope**: the bio block supports paragraphs, bold, italic, and links only. No
  headings, lists, tables, or embedded media.
- **Deleting a profile** also deletes its media from the store. Deletion asks for confirmation,
  is offered on drafts only (FR-092), and is not undoable.
- **The kiosk surface is public** and needs no sign-in, so an event laptop can be set up once
  and left alone.
- **Sessions last thirty days** and renew on use, so a shared shelter laptop stays signed in
  between visits.
- **The interview is conversational**, not a fixed questionnaire or a mode; on an empty page
  the helper asks about the cat before building, adapting to the photos and earlier answers,
  and builds at once when asked to.
- **Enhancement is per-photo and on request.** Nothing is enhanced automatically on upload
  except the generation of alternative text. Photos below 1200 px on the long edge warn but are
  accepted (FR-008).
- **A gallery block** holds a small number of photos — under a dozen — since profiles are
  hand-made and short.
- **The carousel loads all published profiles at once**, which twenty to fifty profiles allows.
  Each cat's photos and video clip are fetched as their turn approaches rather than all at
  the start.
- **Video trimming happens after upload**, on the server, from the whole uploaded file. A
  volunteer uploads a long video and cuts it down afterwards rather than choosing a range
  first.
- **A trimmed clip is at most fifteen seconds** (FR-078); the carousel shows the first eight
  of them (FR-084).
- **Volunteers work on a modern browser** on a phone or a laptop, on shelter wifi. Screens under 768 px get
  the phone mode of FR-091; tablets in either orientation and laptops get the full builder.
- **Media is served publicly** by URL. Media belonging to an unpublished profile is not linked
  from anywhere, but is not access-controlled. *(Amended 2026-09-12, F23: "by URL" means a
  URL on the application's own origin under `/media/`; the application serves the bytes, the
  bucket behind it is never public.)*

### Design handoff adoption (2026-09-10)

A design handoff (`references/design/`) arrived after this spec was written. Every conflict
was decided in the planning session recorded under Clarifications → Session 2026-09-10, and
the requirements above now carry those decisions. Three items from the handoff were adopted
without changing any requirement:

- **Focal point.** Every photo carries a focal point (a horizontal and vertical percentage,
  default centre) from which every crop on every surface is derived. The builder offers a
  picker for it.
- **Themes.** The curated themes in FR-029 are exactly four — Paper, Card, Night, Sand — and
  the bounded tuning in FR-030 is two sliders, warmth and contrast, each held between 0 and 1
  by the schema. The gradient is computed from those three values; the document never stores
  a colour.
- **Tokens and voice.** The handoff's colours, type, spacing, motion timings, and copy voice
  are the single design-token set FR-072 requires, and its strings are used wherever the
  surface exists in this spec.

The ledger of every handoff item and its fate is `research.md` §2.

### Technical constraints already decided

These are settled and are recorded here so they are not re-opened, but they are architecture
rather than requirements. They belong to `/speckit-plan` and to Architecture Decision Records,
and the requirements above are deliberately written without them.

- Profile documents are stored as JSON files in the same object store as the media. There is no
  database.
- Media is stored in Google Cloud Storage. *(Amended 2026-09-12, F23: and delivered by the
  application, never by the bucket — the organisation's `iam.allowedPolicyMemberDomains`
  policy forbids `allUsers` on a bucket. ADR-007 and ADR-015 carry the mechanism.)*
- The application runs on Google Cloud Run.
- The drafting and page-editing model is Gemini; alternative text is generated by the cheapest
  Gemini model that accepts video input. Every exact model identifier is configuration fixed in
  an ADR. Photo enhancement uses no model in v1 (see Out of Scope).
- Authentication is a single username and password from environment configuration, with the
  password verified using HMAC.
- Resizing and delivery of images to visitors is handled by the framework's built-in image
  optimisation rather than by hand-built derivative generation. FR-075 states the outcome
  required; this names the chosen mechanism.
- Video poster extraction and trimming are server-side media operations. Neither the framework
  image optimisation nor the models cover them, so they need a deliberate choice at
  `/speckit-plan`.

## Constitution Waivers

Recorded per Governance → Waivers. Each MUST be repeated in the description of any change that
relies on it.

1. **Cost accounting waived.** The constitution requires every model call to record token usage
   and cost so a session's spend can be reported exactly. v1 records nothing: no logging, no
   pre-flight estimate, no counter. *Rejected alternative*: silent server-side logging, which is
   cheap, but was declined. *Consequence*: spend on Gemini is invisible until it
   appears on a cloud bill.
2. **Carousel frame-rate budget lowered.** The constitution's default is at least 55 frames per
   second with twenty profiles loaded. This feature lowers the floor to 30 on every surface, to
   buy cinematic motion — Ken Burns zooms, depth layers, 3D card transitions. *Rejected
   alternatives*: automatic degradation on weaker devices; cinematic on the kiosk only; a 45fps
   floor; separate budgets per surface. *Consequence*: motion will read as noticeably less
   smooth on a mid-range phone, by decision rather than by defect.
3. **Contrast failure may be published.** Principle IX and FR-068 require WCAG 2.1 AA on every
   surface. FR-031 warns a volunteer whose gradient tuning fails contrast but lets them publish
   anyway. *Rejected alternatives*: refusing to publish until it passes; constraining the tuning
   bounds so failure is unreachable; silently correcting the text colour on publish.
   *Consequence*: a published adoption page can be hard to read for a visitor with low vision,
   and the shelter has no way to know it happened after the warning is dismissed. Only volunteer
   gradient tuning can cause this; everything the system ships passes as built.
4. **No rate limiting anywhere.** The Engineering Standards require model endpoints to be
   rate-limited, and sign-in limiting is the ordinary protection for a password. v1 has neither.
   *Rejected alternatives*: limiting sign-in only while leaving AI calls free; setting limits
   high enough that no real volunteer would meet them. *Consequence*: two exposures, and they
   compound with waiver 1. The single shared shelter password can be guessed at without limit,
   and a stuck retry loop against Gemini can run unbounded — with no cost logging
   in v1, nobody would find out until the cloud bill arrived. FR-082's cap on what each call
   sends is the only remaining ceiling on the cost of a single request.

## Accepted Risks

- **Last write wins on concurrent edits.** One shared login means two volunteers can open the
  same cat at once, and the second save silently discards the first. Chosen deliberately over a
  version check or a soft lock. The exposure is bounded by a small team and roughly fifty
  profiles; it is unbounded in the damage a single collision can do.
  The most likely form of this is not two people at all: it is one volunteer with the same cat
  open in two browser tabs, where the tab that saves last silently overwrites the other. Adding
  detection for that case was considered and declined.
- **Alternative text is usually never read by a volunteer.** A model's description of a real
  animal can go public without anyone reading it. It is visible on the media tile (FR-011) so
  a volunteer *can* read and fix it, but nothing asks them to. Chosen to keep uploads
  frictionless. When generation fails (FR-073) the volunteer writes the text and therefore
  sees it.

## Brainstorm Log

### Session 2026-09-09 — edge cases and undefined surfaces

Run through `/speckit-superspec-brainstorm` against the spec as first written. Fourteen
decisions, driven by ten gaps found on a full read plus one feature added by the shelter
mid-session.

**Contradictions the spec contained.** Three places said two incompatible things:

- Alternative text was a hard publishing gate (FR-012) generated only by a model (FR-011), so a
  describer outage would have blocked all publishing with no way around it. Resolved by
  FR-073/FR-074: the volunteer writes it by hand when generation fails, and the gate stays
  absolute.
- FR-031 warned about failing contrast while FR-068 and SC-005 demanded WCAG AA with zero
  violations. Resolved in favour of the volunteer, recorded as Waiver 3 rather than left as an
  inconsistency.
- 25MB uploads (FR-007) were served directly to visitors (FR-010) under a 2.5-second load
  budget (SC-004) that they cannot meet. Resolved by FR-075.

**Surfaces the spec described without defining.** Seven carousel requirements never said what a
slide contains, and the video block had an edge case about a poster image but no source for one.
Now FR-084 (an eight-second per-cat montage of photos plus the trimmed clip, played silently)
and FR-077/FR-085 (extracted poster, muted looping playback, suppressed under reduced motion).

**Holes that could damage live data.** Deleting media that a published page still used would
have broken that page — now refused by FR-076. Enhancing a photo used in two blocks would have
changed both, and made per-block smart cropping impossible — FR-053 now creates a new asset and
touches only the block being edited.

**Added mid-session.** Video trimming (FR-078/FR-079), so a volunteer can cut a long phone video
down to the interesting few seconds. The trim keeps the original and stays adjustable, matching
how photo enhancement already works. Its knock-on effect — that alternative text and the poster
frame describe footage that may have been cut — is handled by regenerating both.

**Numbers the requirements were missing.** Sessions last thirty days. A name is required to
publish. A dead profile URL returns a standard not-found. AI edit requests carry at most six
downscaled photos (FR-082; later raised to twelve on demand, see Session 2026-09-10). Generation now has a five-second bound on time-to-first-visible-block
(FR-080, SC-013) instead of an unbounded wait inside a ten-minute success criterion.

**Deliberately left alone.** Rate limiting was removed entirely rather than kept — raised as a
concern, reaffirmed by the shelter, recorded as Waiver 4 with both exposures written out. The
two-tab case of last-write-wins was left as an accepted risk rather than detected.

**Still open for `/speckit-plan`.** Two things this session created rather than resolved. The
frame-rate floor is now harder to hold: decoding video inside a cinematic montage is the most
likely place 30fps breaks, and SC-003 should be measured early rather than at the end. And
server-side video trimming and poster extraction are a real piece of infrastructure that neither
the framework's image optimisation nor any of the three models provides.
