# ADR-002: Helper edit protocol (AI ↔ UI)

**Status**: accepted · **Date**: 2026-09-10

## Context

FR-038 (as amended 2026-09-10) says additive changes apply at once and destructive ones ask
first. FR-036/FR-080 say a first page assembles visibly on the canvas and each response is
one undoable step. FR-041 says undo restores the exact prior document. Autosave is last-write-wins from the
browser. The question is *where* an AI edit is applied — server or browser — and how the two
jobs — building a first page from nothing and editing an existing one — share one mechanism.

## Decision

**The helper is a second pair of hands, not a separate mode.** It reads the same in-memory
document the volunteer is editing, changes it with the same six operations the builder's
own controls use, and its work is autosaved like anyone else's. The browser validates,
applies, and undoes; the server only streams the model.

1. **Tools.** Each declared operation (`set_field`, `add_block`, `remove_block`,
   `reorder_blocks`, `set_theme`, `replace_image`) is an AI SDK tool **with no `execute`**.
   **Nothing about the page is pushed into the request.** Five **read** tools let the model
   pull exactly what it needs: `read_outline`, `read_page`, `read_blocks`, `list_media` are
   answered by the browser from the in-memory document (no card, no network);
   `view_photos` executes on the server and returns photos by id within a twelve-photo
   budget per request (FR-082). The prompt instructs the model to read the outline first
   and to re-read after every applied change, which is what lets it verify its own work and
   correct a wrong order in the same turn. There are no other tools — none that touch a
   media record (FR-093), and **no begin/end markers of any kind**.
2. **Apply, unless destructive.** A tool call streams to the browser as a tool part. The
   reducer, in core, validates the operation and the resulting document. If it validates and
   `describeOperation` says it is *not* destructive, it is applied at once, autosaved, and
   answered `{ status: "applied", summary }`. If it is **destructive** — removing a block,
   replacing non-empty text the volunteer wrote, replacing a placed photo, dropping a gallery
   id — a card states what will be lost and waits (FR-038/043); Apply proceeds as above,
   "Not this" answers `{ status: "declined" }`. A validation failure answers
   `{ status: "rejected", reason }` and the document is untouched (FR-040). On an empty page
   nothing is destructive, so a first build streams straight onto the canvas with no cards.
3. **One undo per response.** Every edit the helper applies within one response is recorded
   under a single history entry, opened at the first applied edit and closed when the stream
   ends. Undo removes the whole response in one step (FR-036/041); manual edits stay one per
   action. Undo/redo are disabled while a response is streaming so the two cannot interleave.
4. **Working state.** While a response streams the builder shows "Helper is working…" and
   refuses Publish (FR-081). That is a UI state; nothing is written to the document.
5. **Failure keeps what landed.** If the stream errors, aborts, or is cut short
   (`finishReason === "length"`), applied edits stay, saved, under their turn entry. The
   panel says how far it got — "I added 3 sections before I was cut off. Undo these, or ask
   me to continue." — and offers retry; a failure before any edit says "Nothing on your page
   changed." Nothing is retried on its own (FR-046/047).
6. **Skills instead of prompt rules.** Bigger jobs are written playbooks — Markdown files
   in `src/core/helper/skills/` with `name`/`description` front matter — that the model
   fetches with `load_skill({ name })` when a request matches. The system prompt stays short
   and lists the catalogue. `build-profile` holds the interview (five to ten questions, one
   per turn, stop on "Build it now", FR-033/034) and the build order; `write-bio`,
   `pick-theme`, `tidy-order` hold the craft. Skills are checked-in text, never volunteer
   content, so they are trusted instructions; the volunteer's page is still data (FR-045).
   There is no interview mode or counter: if the volunteer has already added blocks by hand,
   the skill tells the model to read them and continue from there.
7. **What changed.** When the turn ends the panel lists the applied edits with "Undo these",
   and touched blocks are briefly highlighted on the canvas (FR-042).
8. The tool answer is sent back with `addToolResult`, so the conversation remains coherent
   and the model can say what it did.
9. The server never writes the draft on the helper's behalf and never reads it for context;
   it loads media records only to serve `view_photos`.

Manual edits in the builder go through the **same** operations and the same `applyOperation`,
so undo, validation, and the "what changed" summary are one code path.

## Alternatives rejected

- **A generation mode with `begin_draft` / `end_draft` brackets** (this ADR's first version) —
  it applied edits freely inside the brackets, paused autosave, collapsed the run into one
  undo, and rolled back on failure. Rejected by the shelter: it made the helper's edits a
  different kind of thing from a person's, and every job it did has a simpler home — apply
  unless destructive, one undo per response, "working" as a UI state, autosave always on.
- **Confirming every AI edit** — a first build becomes a long click-through.
- **Confirming nothing** — symmetric with a human, but a misread request could remove a
  section the volunteer has to notice; naming destruction first costs one click.
- **An interview counter in the reducer** — a mechanism to enforce "ten questions" that the
  skill text and the "Build it now" button make unnecessary.
- **Rolling a failed response back automatically** — keeps the letter of the old FR-046,
  but throws away valid work seconds old; the shelter preferred keeping it under one undo.

- **Server applies, client re-fetches** — simpler streaming, but confirmation becomes an extra
  round-trip, undo needs server-side history, and it races the browser's autosave.
- **Model returns a whole new document** — violates Principle VIII (no raw document writes)
  and makes "what changed" a diff problem instead of a list of operations.
- **Structured-output JSON of a plan, then apply** — no streaming of the first block, so
  FR-080's five-second bound is harder to meet, and it needs a second parsing path beside the
  tool schemas.
