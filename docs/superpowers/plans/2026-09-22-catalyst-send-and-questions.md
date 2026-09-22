# CATalyst Send Button and Personalised Questions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the CATalyst composer a visible Send button, make "Write a bio" look at the page and photos and ask one to three personalised questions when it lacks material, and make the "Build the page" interview's questions come from what CATalyst saw.

**Architecture:** The button is a UI-only change to `Composer` (a new `Send` icon drawn in the existing `Button variant="primary" size="icon"`). The question behaviour is instruction-only: two checked-in skill files (`write-bio.md`, `build-profile.md`) change; no tool, route, reducer or prompt code changes. A new scripted fake-model scenario, `bio-interview`, lets unit and e2e tests play the new bio flow end to end. A final manual run against the real model checks question quality.

**Tech Stack:** Next.js + React 19, TypeScript (strict), Tailwind tokens, Vitest + Testing Library, Playwright, Vercel AI SDK (`ai` v6, `MockLanguageModelV3` from `ai/test`), Gemini on Vertex.

**Spec:** `docs/superpowers/specs/2026-09-22-catalyst-send-and-questions-design.md`

## Global Constraints

- Read `.specify/memory/constitution.md` before writing code. It is binding: test-first (Principle II), coverage thresholds enforced by `pnpm test` (III), strict typing (IV), design tokens only, no ad-hoc inline styles or magic values (IX), WCAG 2.1 AA with a keyboard-path test for every interactive component (IX).
- The helper's tools stay exactly the twelve of FR-093. Nothing new is sent to the model unasked (FR-082). Do not touch `src/core/helper/tools.ts`, `src/core/helper/prompt.ts`, `src/app/api/_lib/chat.ts`, or `src/core/helper/reducer.ts`.
- Every button is ≥44px (DESIGN.md §4); icons are 20px, 1.5px stroke, `currentColor`, never filled, `aria-hidden` (`src/ui/shared/icons.tsx` header).
- The composer placeholder stays exactly `Ask for a change…`; the button's accessible name is exactly `Send`.
- Match the surrounding comment style: a short "why" header per file/test block, referencing the feature. Use `F65` as this feature's tag in new comments (the highest feature tag in the repo is F64).
- Commits: conventional-commit subject (`feat:`, `test:`, `docs:`), **no** `Co-Authored-By` or any AI-attribution trailer.
- Never tick checkboxes under `specs/<feature>/checklists/`.
- Commands, exactly: `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build && pnpm test:e2e`. Single test file: `pnpm vitest run <path>` (unit/component), `pnpm exec playwright test <path> -g "<title>"` (e2e, needs `pnpm build` first).

## Review Focus

1. **Double-send from Enter plus click, or click while busy.** A click on a disabled button must do nothing; Enter then an immediate click must not send twice (the box is cleared by the first send, so the second sees empty text). Pinned in Task 1 ("does not send when the button is clicked with an empty box" and "the button is disabled while locked or already working").
2. **Whitespace-only text.** The button must be disabled for `"   "`, not just `""`. Pinned in Task 1.
3. **Focus after a send from the button.** After Tab→Space on the button, focus must land back in the text box, not on `<body>` or the (now-disabled) button; a pointer press must never take focus off the box at all (on a phone, a tap that moved focus would close and then reopen the keyboard while the drawer drops to Peek). Pinned in Task 1 (keyboard-path test, and "a pointer press on Send never takes focus from the box").
4. **"Write a bio" on a page with no bio block.** The bio flow must add a bio section rather than fail to find one. Pinned in Task 3 (the scenario adds a bio block when the outline has none; the e2e uses a fresh cat with no bio).
5. **"Write a bio" on a page with no photos.** `view_photos` rejects an empty `ids` list (`min(1)`), so the scenario must skip it rather than call it with `[]`. Pinned in Task 3 ("skips view_photos when the cat has no photos").

---

### Task 1: Send button in the composer

**Files:**
- Modify: `src/ui/shared/icons.tsx` (append a `Send` icon)
- Modify: `src/ui/helper/Composer.tsx`
- Modify: `references/design/CONTENT.md` (the Helper table's `Input` row, line ~88)
- Test: `tests/component/helper/Composer.test.tsx`
- Test: `tests/component/builder/phone/catalyst-drawer.test.tsx`

**Interfaces:**
- Consumes: `Button` from `@/ui/shared/Button` (existing: `variant?: "primary" | …`, `size?: "default" | "dense" | "icon"`; `size="icon"` is the 44px square for one glyph, `src/ui/shared/Button.tsx:42-53`).
- Produces: `export const Send: Icon` in `@/ui/shared/icons`; the composer renders `<button aria-label="Send">`. Task 4's e2e clicks `getByRole("button", { name: "Send" })`.

- [ ] **Step 1: Write the failing Composer tests**

In `tests/component/helper/Composer.test.tsx`, change the header comment to:

```tsx
// T036 brief → "Tests first": Enter sends, Shift+Enter starts a new line. Built on the
// shared `Textarea`, so the only behaviour this file owns is the keyboard rule — and, since
// F65, the Send button beside the box, which sends exactly what Enter would.
```

Then add these tests inside `describe("Composer")`, after "is disabled while locked or already working":

```tsx
  it("sends the trimmed text when Send is clicked, clears the box, and keeps focus in it", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);
    const box = screen.getByPlaceholderText("Ask for a change…");
    await user.type(box, "  Warm it up  ");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Warm it up");
    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
  });

  // F65 review I6: on a phone a tap that moved focus to the button would close the keyboard,
  // and the refocus would reopen it just as the drawer drops to Peek. A pointer press never
  // takes focus off the box, so a tap-send behaves exactly like an Enter-send.
  it("a pointer press on Send never takes focus from the box", () => {
    render(<Composer disabled={false} onSend={vi.fn()} />);
    const send = screen.getByRole("button", { name: "Send" });
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    send.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });

  it("disables Send while the box is empty or only whitespace", async () => {
    const user = userEvent.setup();
    render(<Composer disabled={false} onSend={vi.fn()} />);
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await user.type(screen.getByPlaceholderText("Ask for a change…"), "   ");
    expect(send).toBeDisabled();
    await user.type(screen.getByPlaceholderText("Ask for a change…"), "hi");
    expect(send).toBeEnabled();
  });

  it("does not send when the button is clicked with an empty box", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("the button is disabled while locked or already working, even with text typed", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { rerender } = render(<Composer disabled={false} onSend={onSend} />);
    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Warm it up");
    rerender(<Composer disabled onSend={onSend} />);
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await user.click(send);
    expect(onSend).not.toHaveBeenCalled();
  });

  // Principle IX: every interactive component carries a test of its keyboard path.
  it("is reachable by Tab from the box and sends on Space and on Enter, focus back in the box", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);
    const box = screen.getByPlaceholderText("Ask for a change…");
    const send = screen.getByRole("button", { name: "Send" });

    await user.type(box, "First");
    await user.tab();
    expect(send).toHaveFocus();
    await user.keyboard(" ");
    expect(onSend).toHaveBeenLastCalledWith("First");
    expect(box).toHaveFocus();

    await user.type(box, "Second");
    await user.tab();
    expect(send).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenLastCalledWith("Second");
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(box).toHaveFocus();
  });
```

Note: the existing test "leaves focus alone when the turn ends with focus somewhere else" and the focus tests keep passing unchanged; the Send button is a second focusable control after the box.

- [ ] **Step 2: Write the failing phone-drawer test**

In `tests/component/builder/phone/catalyst-drawer.test.tsx`, inside `describe("the CATalyst drawer's state machine")`, right after the first test ("has no peek before a first send; …"), add:

```tsx
  // F65: the Send button is the drawer's other way to send — it drops Full to Peek exactly
  // as Enter does, with the working line on the bar.
  it("a send with the Send button from Full drops to Peek too", async () => {
    renderBuilder(addPhotoModel());
    const user = userEvent.setup();
    await user.click(within(bottom()).getByRole("button", { name: "CATalyst" }));
    const full = screen.getByRole("dialog", HELPER);
    await user.type(within(full).getByPlaceholderText("Ask for a change…"), "Add a photo.");
    await user.click(within(full).getByRole("button", { name: "Send" }));

    expect(screen.queryByRole("dialog", HELPER)).toBeNull();
    await waitFor(() => expect(peek()).toHaveTextContent("Applied — added photo section."));
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run tests/component/helper/Composer.test.tsx tests/component/builder/phone/catalyst-drawer.test.tsx`
Expected: FAIL — every new test fails with `Unable to find an accessible element with the role "button" and name "Send"`.

- [ ] **Step 4: Add the `Send` icon**

Append to `src/ui/shared/icons.tsx`:

```tsx
/** An arrow pointing up: send what is typed. */
export const Send: Icon = (p) => (
  <Svg {...p}>
    <path d="M10 16V4M5 9l5-5 5 5" />
  </Svg>
);
```

- [ ] **Step 5: Add the button to the Composer**

In `src/ui/helper/Composer.tsx`:

1. Replace the header comment so it reads:

```tsx
// CONTENT.md → Helper, Input: `Ask for a change…` · `Send`. Enter sends, Shift+Enter starts
// a new line — the one keyboard rule the brief names — built on the shared `Textarea` so the
// composer reads as the same field family as every other box in the tools (DESIGN.md §4).
// F65: a Send button sits beside the box (not over it, so the box can grow to its ceiling
// without text running under it) and sends exactly what Enter would. It is `Button`'s own
// primary in its 44px `icon` size, so the one filled control in the panel matches Publish.
// One line to start (hi-fi 3a: a ~44px field) in the panel's own 13px, growing as a
// request is typed — the shared field's `dense` size, so the two-line void the old box
// kept under an empty placeholder is gone.
```

2. Add imports:

```tsx
import { Button } from "@/ui/shared/Button";
import { Send } from "@/ui/shared/icons";
```

3. Replace `send` so a keyboard press on the button also returns focus to the box:

```tsx
  const send = () => {
    const text = value.trim();
    if (text === "") return;
    onSend(text);
    setValue("");
    // Space or Enter on the button leaves focus on it; the volunteer is mid-conversation,
    // so it goes back to the box (without scrolling — the same F34 rule as the effect above).
    // A pointer press never moved it (`onMouseDown` below), so this is a no-op for a click.
    field.current?.focus({ preventScroll: true });
  };
```

4. Replace the returned JSX with:

```tsx
  return (
    <div className="flex items-end gap-8">
      <div className="min-w-0 flex-1">
        <Textarea
          id="helper-composer"
          name="message"
          label="Ask for a change"
          hideLabel
          rows={1}
          dense
          ref={field}
          placeholder={PLACEHOLDER}
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <Button
        variant="primary"
        size="icon"
        aria-label="Send"
        disabled={disabled || value.trim() === ""}
        // A pointer press keeps focus in the box: on a phone, moving it would close the
        // keyboard and the refocus in `send` would reopen it as the drawer drops to Peek.
        onMouseDown={(event) => event.preventDefault()}
        onClick={send}
      >
        <Send />
      </Button>
    </div>
  );
```

Check `Button` passes `disabled` through and styles it (read `src/ui/shared/Button.tsx` to the end; if it has no disabled style, the button must still look disabled — add nothing to `Button` itself unless its own tests show a disabled look is missing, and then add `disabled:opacity-50 disabled:pointer-events-none` to `buttonClasses` with a `tests/component/shared/Button.test.tsx` case). `gap-8` and `items-end` are on the spacing scale (`gap-8` is already used in `HelperPanel.tsx`; `pnpm check:spacing` runs in `pnpm lint`).

Note on the focus effect: after an Enter-send the parent disables the composer for the turn; the existing `useEffect` on `disabled` still handles focus return when the turn ends. The new `focus()` in `send` only matters for a keyboard press on the button.

- [ ] **Step 6: Record the button's name in CONTENT.md**

In `references/design/CONTENT.md`, change the Helper table's `Input` row from:

```markdown
| Input | `Ask for a change…` · chips `Write a bio` `Pick a theme` `Tidy the order` |
```

to:

```markdown
| Input | `Ask for a change…` · button `Send` (F65: an arrow beside the box, the same as Enter) · chips `Write a bio` `Pick a theme` `Tidy the order` |
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run tests/component/helper/Composer.test.tsx tests/component/builder/phone/catalyst-drawer.test.tsx`
Expected: PASS, all tests including the existing Enter/Shift+Enter, focus and drawer tests.

- [ ] **Step 8: Run the helper, shared and phone component suites for regressions**

Run: `pnpm vitest run tests/component/helper tests/component/shared tests/component/builder/phone`
Expected: PASS. If a test counts buttons or asserts the Tab order from the composer to the first chip, update it to expect `Send` between them and say so in the commit message body.

- [ ] **Step 9: Lint, typecheck, commit**

Run: `pnpm lint && pnpm typecheck && pnpm format:check`
Expected: no errors.

```bash
git add src/ui/shared/icons.tsx src/ui/helper/Composer.tsx references/design/CONTENT.md tests/component/helper/Composer.test.tsx tests/component/builder/phone/catalyst-drawer.test.tsx
# plus any test or shared-component file changed in Steps 5 or 8
git commit -m "feat: add a Send button beside the CATalyst composer"
```

---

### Task 2: Skill text — `write-bio` asks when it lacks material, `build-profile` asks from what it saw

**Files:**
- Modify: `src/core/helper/skills/write-bio.md`
- Modify: `src/core/helper/skills/build-profile.md`
- Modify: `specs/001-cat-profile-builder/contracts/helper-protocol.md` (Skills section, lines ~52–72)
- Test: `tests/unit/core/helper/skills.test.ts`

**Interfaces:**
- Consumes: `getSkill(name)` from `@/core/helper/skills` (existing; returns `{ name, description, body } | { error }`; the body is the file after its front matter, `.trim()`med, with **no** whitespace normalisation — a pinned phrase must sit on one line in the Markdown source).
- Produces: skill bodies containing the exact phrases the tests below assert. Task 3's scenario loads `write-bio` by name.

- [ ] **Step 1: Write the failing skill-text tests**

Append to `tests/unit/core/helper/skills.test.ts`:

```ts
// F65 (docs/superpowers/specs/2026-09-22-catalyst-send-and-questions-design.md): a
// standalone bio request looks at the page and photos first and asks one to three
// questions only when it lacks material; the build interview's questions come from what
// the helper saw. The skill text is the whole implementation, so its key rules are pinned.
// Every pinned phrase sits on one line of the Markdown source: `getSkill` does not
// normalise whitespace, so a phrase broken across lines would not match.
describe("write-bio asks when it needs to (F65)", () => {
  function body(): string {
    const skill = getSkill("write-bio");
    if ("error" in skill) throw new Error(skill.error);
    return skill.body;
  }

  it("looks at the page and the photos before deciding anything, in as few steps as it can", () => {
    const text = body();
    expect(text).toContain("## Before you write: look, then ask only if you need to");
    for (const step of ["`read_page`", "`list_media`", "`view_photos`"]) {
      expect(text).toContain(step);
    }
    expect(text).toContain("in the same step");
  });

  it("states the 'enough' bar: two things she does and one fact about the home she'd suit", () => {
    const text = body();
    expect(text).toContain("at least two concrete things she does");
    expect(text).toContain("at least one fact about the home she'd suit");
    expect(text).toContain("write straight away");
  });

  it("asks one to three questions, one per message, each pointing to what it saw", () => {
    const text = body();
    expect(text).toContain("one to three questions");
    expect(text).toContain("one per message");
    expect(text).toContain("point to something specific you saw");
  });

  it("does not look again on an answer, and takes 'I don't know' as settled", () => {
    const text = body();
    expect(text).toContain("don't look again");
    expect(text).toContain("\"I don't know\" settles that gap");
  });

  it("never writes a photo guess as fact, and stops asking on 'just write it'", () => {
    const text = body();
    expect(text).toContain("is a guess, and you must never write a guess from a photo as fact");
    expect(text).toContain("just write it");
  });

  it("asks nothing for a rewrite or a shortening, or inside a build", () => {
    const text = body();
    expect(text).toContain("**A request to rewrite or shorten**");
    expect(text).toContain("**Inside `build-profile`.**");
    expect(text).toContain("The build's own interview has already happened");
  });
});

describe("build-profile asks from what it saw (F65)", () => {
  function body(): string {
    const skill = getSkill("build-profile");
    if ("error" in skill) throw new Error(skill.error);
    return skill.body;
  }

  it("builds its questions from what it noticed, the bank only as a fallback", () => {
    const text = body();
    expect(text).toContain("note to yourself");
    expect(text).toContain("only as a fallback");
    expect(text).toContain("point to something specific you saw");
    expect(text).toContain("Before any interview question");
    expect(text).not.toContain("Before any question from the bank below");
  });

  it("never assumes a photo guess into the page", () => {
    expect(body()).toContain("is a guess, and you must never write a guess from a photo as fact");
  });

  it("keeps the five-to-ten interview and the proposal gate", () => {
    const text = body();
    expect(text).toContain("Ask five to ten questions, **one at a time**");
    expect(text).toContain('"Want me to build this now?"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/unit/core/helper/skills.test.ts`
Expected: FAIL on every new F65 test except "keeps the five-to-ten interview and the proposal gate" (that one guards existing text and passes already).

- [ ] **Step 3: Add the look-then-ask section to `write-bio.md`**

In `src/core/helper/skills/write-bio.md`, insert this section immediately after the opening paragraph ("Use this whenever you're writing bio text … inside `build-profile`.") and before `## Voice`. Copy it exactly — the line breaks are chosen so every pinned phrase stays on one line:

```markdown
## Before you write: look, then ask only if you need to

This section is for a bio asked for on its own — the "Write a bio" chip, or the volunteer
typing a request to write one. Skip it entirely in two cases:

- **A request to rewrite or shorten** an existing bio. The material is already on the page;
  go straight to the writing.
- **Inside `build-profile`.** The build's own interview has already happened and the answers
  are in this conversation; go straight to the writing.

Otherwise:

1. **Look first, in as few steps as you can.** If you haven't read the outline in this
   request yet, do. Then call `read_page` and `list_media` in the same step — `read_page`
   gives you the facts and every section's words at once (the bio, captions, the day scenes,
   a quote, needs cards). Then `view_photos` on up to six of the most telling photos: the cat
   with people or other animals, doing something specific, in a place that says something
   about her. Skip near-duplicates.
2. **Decide whether you have enough.** You have enough when you know both:
   - at least two concrete things she does — a habit, a game, how she greets people, where she
     naps; and
   - at least one fact about the home she'd suit — how she is with other cats, dogs or kids,
     her energy, or a medical or care need.

   If you have both, write straight away. Don't ask anything.
3. **If you don't, ask one to three questions, one per message**, and wait for each answer
   before the next. Ask only about what's missing.
   Each question should point to something specific you saw, whenever there is something to
   point to — "I can see her curled up on a windowsill in two of the photos. Is that her
   favourite spot, and what does she watch out there?" beats "What does she like to do?"
   Stop asking as soon as you have enough. The moment the volunteer says anything like
   "just write it", stop and write with what you have.

   When the volunteer answers, don't look again — what you read and saw is already in this
   conversation. Ask the next question, or write. An answer of "I don't know" settles that gap
   — don't ask about it again; write around it.

**Photos show; they don't prove.** What a photo plainly shows — her coat, a dog in the frame,
a windowsill — you can use. What it only suggests — that she loves the window, that she gets
on with the dog — is a guess, and you must never write a guess from a photo as fact.
Ask it as a question, and write it only once the volunteer confirms it.
```

- [ ] **Step 4: Rewrite the interview section of `build-profile.md`**

In `src/core/helper/skills/build-profile.md`:

1. In `## 2. Name, age, and sex — always first`, change the opening words "Before any question from the bank below, ask for" to "Before any interview question, ask for". Leave the rest of that paragraph unchanged.

2. Replace the whole `## 3. The interview` section (from the heading through the last bank bullet, "Anything specific she needs in a home — …") with:

```markdown
## 3. The interview

Before the first question, make a short note to yourself — never a message to the volunteer —
of the specific things step 1 showed you: where she is in each photo, who or what is with her,
what she is doing, anything unusual. Your questions come from that note.

Ask five to ten questions, **one at a time**, and wait for the answer before the next one.
Never ask two things in one message. Stop on your own once you judge you have enough to build a
good page — you don't need all ten. Stop at once, mid-list if you must, the moment the volunteer
says anything like "build it" or "just build it from what you have": that sentence ends the
interview outright, not a suggestion to confirm. Either way, stop at ten questions even if you
don't have everything, and move on with what you learned.

Each question should point to something specific you saw, whenever there is something to
point to — "In the third photo she's sharing the sofa with a dog. How does she get on with him
day to day?" rather than "How is she around other animals?" Don't ask something a photo or the
page already answered.

**Photos show; they don't prove.** What a photo plainly shows you can use. What it only
suggests is a guess, and you must never write a guess from a photo as fact.
Ask it, and use it only once the volunteer confirms.

Use this bank only as a fallback, for topics the photos and the page say nothing about:

- What's the first thing people notice when they meet her?
- How is she around other cats or dogs?
- Good with kids, or does she do better in a quiet, adult household?
- Anything worth knowing about her litter box habits?
- What's her energy like — a couch cat, an explorer, somewhere in between?
- Any medical needs or care a new owner should plan for?
- A daily habit or routine that says something about her — a favorite window, a game she
  never gets tired of?
- Is there a photo or clip here that captures her best? (Skip if there's only one photo.)
- Anything specific she needs in a home — no other cats, a patient adopter, a quiet house?
```

Leave every other section of `build-profile.md` unchanged (the F52 tests in the same file, and `tests/contract/helper-protocol.reducer.test.ts:344-350`, guard them).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run tests/unit/core/helper/skills.test.ts tests/contract`
Expected: PASS — all F65 tests, the existing F52 and catalogue tests, and the contract tests that read skill bodies.

- [ ] **Step 6: Update the helper-protocol contract**

In `specs/001-cat-profile-builder/contracts/helper-protocol.md`, Skills table:

Replace the `build-profile` row's "What it contains" cell with:

```markdown
The whole walkthrough: read the outline and media, look at the photos, **interview** the volunteer — five to ten questions, one per turn, written from what the photos and page showed (each pointing to something seen where it can; a fixed bank only as a fallback), photo guesses asked rather than assumed, stop early on request (FR-033/034) — then choose sections and order, **propose** what it will build and wait for a clear yes (FR-034), write the bio (via `write-bio`), set a tagline, pick a theme (via `pick-theme`), then re-read and summarise
```

Replace the `write-bio` row's "What it contains" cell with:

```markdown
For a standalone "write a bio": look first (the outline, `read_page` and the media list in one step, up to six photos), write straight away if it knows two things she does and one fact about the home she'd suit, otherwise ask one to three questions, one per turn, each pointing to something it saw, without looking again on an answer; photo guesses are asked, never written as fact; no questions for a rewrite or shortening, or inside `build-profile`. Then the voice: plain, specific, behaviour over adjectives, one concrete detail per sentence, no emoji, no sad-story framing; length and paragraphing; how to open; what a visitor wants to know. Drawn from the design's voice rules and from research into effective adoption bios (a planning task)
```

The sentence "`build-profile` is the only place the interview exists: there is no counter or mode in the reducer." spans **two source lines** (about lines 67–68, broken after "exists:" or nearby) — find it by reading the paragraph under the table, not by a single-line find-and-replace. Replace that sentence with:

```markdown
`build-profile` holds the full interview; `write-bio` holds a short one of its own, for a bio asked for on its own (F65). Neither has a counter or mode in the reducer.
```

- [ ] **Step 7: Format check and commit**

Run: `pnpm format:check`
Expected: no errors (run `pnpm format` if the Markdown table needs reflowing, then re-check, and re-run Step 5 — Prettier must not have re-wrapped a pinned phrase).

```bash
git add src/core/helper/skills/write-bio.md src/core/helper/skills/build-profile.md specs/001-cat-profile-builder/contracts/helper-protocol.md tests/unit/core/helper/skills.test.ts
git commit -m "feat: CATalyst looks at the page and photos, then asks personalised questions"
```

---

### Task 3: `bio-interview` fake-model scenario

**Files:**
- Create: `src/adapters/fake/scenarios/bio-interview.ts`
- Modify: `src/adapters/fake/language-model.ts` (register it)
- Modify: `tests/unit/adapters/fake/language-model.test.ts` (its exact `SCENARIO_NAMES` list, lines 8–26)
- Test: `tests/unit/adapters/fake/scenarios.test.ts`

**Interfaces:**
- Consumes: from `./_shared` — `callPart`, `finishPart`, `hasResult`, `outlineBlockId`, `resultCount`, `resultText`, `scriptedStream`, `STOP`, `STREAM_START`, `textParts`, `TOOL_CALLS`, `userTurnCount` (all existing, signatures as in `src/adapters/fake/scenarios/_shared.ts`).
- Produces: `export function bioInterview(): LanguageModelV3`; `export const BIO_QUESTION: string`; `export const BIO_DONE: string`; `export const INTERVIEW_BIO: { paragraphs: { runs: { text: string }[] }[] }`; the registry name `"bio-interview"`. Task 4's e2e sets `x-fake-scenario: bio-interview` and asserts on `BIO_QUESTION`'s and `INTERVIEW_BIO`'s text (copied as literals).

The script, one step per `doStream` call, as a pure function of the prompt:

| When | Step |
|---|---|
| turn 1, no `load_skill` result | `load_skill { name: "write-bio" }` (server-executed; the SDK loops on) |
| turn 1, no `read_outline` result | `read_outline {}` (browser) |
| turn 1, no `list_media` result | `list_media {}` (browser) |
| turn 1, photos listed, no `view_photos` result | `view_photos { ids: <up to six photo ids> }` (server-executed) |
| turn 1, otherwise | text `BIO_QUESTION`, finish `stop` |
| turn 2+, no edit result yet | the outline has a bio → `set_field` its `content` to `INTERVIEW_BIO`; no bio → `add_block { type: "bio", content: INTERVIEW_BIO }` |
| turn 2+, edit answered, fewer than 2 `read_outline` results | `read_outline {}` (the re-read) |
| turn 2+, otherwise | text `BIO_DONE`, finish `stop` |

- [ ] **Step 1: Write the failing scenario tests**

In `tests/unit/adapters/fake/scenarios.test.ts`, add the import next to the other scenario imports (keep them alphabetical):

```ts
import {
  BIO_DONE,
  BIO_QUESTION,
  bioInterview,
  INTERVIEW_BIO,
} from "@/adapters/fake/scenarios/bio-interview";
```

Then add, after the `describe("buildProposal")` block:

```ts
// F65: a standalone "Write a bio" looks at the page and the photos, asks a question that
// points at what it saw, and only then writes — the flow `write-bio`'s new section scripts.
const OUTLINE_NO_BIO = "Name: Charlotte\n\nSections:\n1. blockaaaaaaa hero — none.\n";
const MEDIA_TWO_PHOTOS =
  'photoaaa photo 1600x1200 — "On the sill" (used by blockaaaaaaa)\n' +
  'photobbb photo 1600x1200 — "With the dog" (not used)\n';

function browserAnswers(outline: string, media: string) {
  return (toolName: string): JSONValue => {
    if (toolName === "read_outline") return outline;
    if (toolName === "list_media") return media;
    return { status: "applied", summary: "ok" };
  };
}

function toolInputs(messages: ModelMessage[], toolName: string): unknown[] {
  return messages
    .filter(isAssistant)
    .flatMap(toolCallsOf)
    .filter((call) => call.toolName === toolName)
    .map((call) => call.input);
}

describe("bioInterview", () => {
  it("loads write-bio, reads the outline and media, views the photos, then asks one question", async () => {
    const model = bioInterview();
    const answer = browserAnswers(OUTLINE_NO_BIO, MEDIA_TWO_PHOTOS);
    let messages: ModelMessage[] = [userText("Write a bio")];
    messages = await step(model, messages); // load_skill auto-executes, then read_outline
    expect(toolInputs(messages, "load_skill")).toEqual([{ name: "write-bio" }]);
    expect(lastToolNames(messages)).toEqual(["read_outline"]);

    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    expect(lastToolNames(messages)).toEqual(["list_media"]);

    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages); // view_photos auto-executes, then the question
    expect(toolInputs(messages, "view_photos")).toEqual([{ ids: ["photoaaa", "photobbb"] }]);
    expect(lastText(messages)).toBe(BIO_QUESTION);
    expect(lastToolNames(messages)).toEqual([]);
  });

  it("after the answer, adds a bio section when the page has none, re-reads, and says it's done", async () => {
    const model = bioInterview();
    const answer = browserAnswers(OUTLINE_NO_BIO, MEDIA_TWO_PHOTOS);
    let messages: ModelMessage[] = [userText("Write a bio")];
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);

    messages = [...messages, userText("Yes, the sill is hers. She chirps at pigeons.")];
    messages = await step(model, messages);
    expect(lastToolNames(messages)).toEqual(["add_block"]);
    expect(toolInputs(messages, "add_block")).toEqual([
      { op: "add_block", block: { type: "bio", content: INTERVIEW_BIO } },
    ]);

    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    expect(lastToolNames(messages)).toEqual(["read_outline"]);

    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    expect(lastText(messages)).toBe(BIO_DONE);
  });

  it("sets the existing bio's content when the page already has a bio block", async () => {
    const model = bioInterview();
    const answer = browserAnswers(OUTLINE_WITH_BIO, MEDIA_TWO_PHOTOS);
    let messages: ModelMessage[] = [userText("Write a bio")];
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);

    messages = [...messages, userText("She chirps at pigeons.")];
    messages = await step(model, messages);
    expect(toolInputs(messages, "set_field")).toEqual([
      {
        op: "set_field",
        target: { kind: "block", blockId: "blockaaaaaab" },
        path: "content",
        value: INTERVIEW_BIO,
      },
    ]);
  });

  it("skips view_photos when the cat has no photos, and still asks", async () => {
    const model = bioInterview();
    const answer = browserAnswers(OUTLINE_NO_BIO, "No photos or clips yet.");
    let messages: ModelMessage[] = [userText("Write a bio")];
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    expect(toolInputs(messages, "view_photos")).toEqual([]);
    expect(lastText(messages)).toBe(BIO_QUESTION);
  });
});
```

Then, in `tests/unit/adapters/fake/language-model.test.ts`, add `"bio-interview",` to the exact list in "lists the scenarios it knows", after `"image-proposals",`. That existing test is what proves the registration.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/unit/adapters/fake/scenarios.test.ts`
Expected: FAIL — `Failed to resolve import "@/adapters/fake/scenarios/bio-interview"`.

- [ ] **Step 3: Write the scenario**

Create `src/adapters/fake/scenarios/bio-interview.ts`:

```ts
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import {
  callPart,
  finishPart,
  hasResult,
  outlineBlockId,
  resultCount,
  resultText,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
  userTurnCount,
} from "./_shared";

// `bio-interview` (F65): a standalone "Write a bio" the way `write-bio`'s look-then-ask
// section scripts it. Turn 1 loads the skill, reads the outline and the media list, looks
// at up to six photos (skipped when there are none — `view_photos` refuses an empty list),
// and asks one question that points at what it saw. Turn 2 — the volunteer's answer —
// writes the bio: a `set_field` on the page's bio when it has one (neutral while that bio
// is empty, a card once it holds text), an `add_block` when it has none; then re-reads the
// outline and says it's done. Written like `text-proposals`: a pure function of the prompt.

/** The one question turn 1 asks — it names the photos, the way the skill tells a model to. */
export const BIO_QUESTION =
  "I can see her settled on a windowsill in the photos. Is that her favourite spot, and what does she do there?";

/** The bio turn 2 writes, one paragraph. */
export const INTERVIEW_BIO = {
  paragraphs: [
    {
      runs: [
        {
          text: "The windowsill is hers from the first light, and she chirps at every pigeon that lands outside.",
        },
      ],
    },
  ],
};

export const BIO_DONE = "That's the bio written.";

/** How many photos `view_photos` takes in one call (its input schema's `max(6)`). */
const VIEW_LIMIT = 6;

function callStep(id: string, toolName: string, input: unknown) {
  return scriptedStream([STREAM_START, callPart(id, toolName, input), finishPart(TOOL_CALLS)]);
}

function textStep(id: string, text: string) {
  return scriptedStream([STREAM_START, ...textParts(id, text), finishPart(STOP)]);
}

/** The photo ids on a `list_media`-shaped listing ("<id> photo WxH — …"), in order — the
 * same eight-character id pattern `image-proposals` and `phone-edits` match. */
function photoIds(listing: string): string[] {
  return [...listing.matchAll(/^([a-z2-7]{8}) photo /gm)].map((match) => match[1] ?? "");
}

function writeStep(outline: string) {
  const bioId = outlineBlockId(outline, "bio");
  if (bioId === undefined) {
    const op = { op: "add_block", block: { type: "bio", content: INTERVIEW_BIO } };
    return callStep("bio-add-1", "add_block", op);
  }
  const op = {
    op: "set_field",
    target: { kind: "block", blockId: bioId },
    path: "content",
    value: INTERVIEW_BIO,
  };
  return callStep("bio-set-1", "set_field", op);
}

/** Look, ask one question pointing at the photos, then — on the answer — write and re-read. */
export function bioInterview(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "bio-interview",
    doStream: async ({ prompt }) => {
      if (userTurnCount(prompt) === 1) {
        if (!hasResult(prompt, "load_skill")) {
          return { stream: callStep("skill-1", "load_skill", { name: "write-bio" }) };
        }
        if (!hasResult(prompt, "read_outline")) {
          return { stream: callStep("outline-1", "read_outline", {}) };
        }
        if (!hasResult(prompt, "list_media")) {
          return { stream: callStep("media-1", "list_media", {}) };
        }
        const ids = photoIds(resultText(prompt, "list_media")).slice(0, VIEW_LIMIT);
        if (ids.length > 0 && !hasResult(prompt, "view_photos")) {
          return { stream: callStep("view-1", "view_photos", { ids }) };
        }
        return { stream: textStep("question-1", BIO_QUESTION) };
      }
      const edited = hasResult(prompt, "set_field") || hasResult(prompt, "add_block");
      if (!edited) return { stream: writeStep(resultText(prompt, "read_outline")) };
      if (resultCount(prompt, "read_outline") < 2) {
        return { stream: callStep("outline-2", "read_outline", {}) };
      }
      return { stream: textStep("done", BIO_DONE) };
    },
  });
}
```

Note: `list_media`'s real output is wrapped in a data fence (`fence(...)` in `src/core/helper/reads.ts:70`), which joins the open marker, a notice, the body and the close marker with `\n` — so each id line starts at column 0 and the multiline `^` matches it.

- [ ] **Step 4: Register the scenario**

In `src/adapters/fake/language-model.ts`, add the import (alphabetical, after `badOperation`):

```ts
import { bioInterview } from "./scenarios/bio-interview";
```

and the entry in `SCENARIOS`, after `"text-proposals": textProposals,`:

```ts
  "bio-interview": bioInterview,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run tests/unit/adapters/fake/scenarios.test.ts tests/unit/adapters/fake/language-model.test.ts`
Expected: PASS, including the existing scenario tests and the scenario-name list.

- [ ] **Step 6: Full unit suite, lint, typecheck, commit**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS, coverage thresholds met. (The new scenario file is fully covered by Step 1's tests; if coverage reports an uncovered branch, add the missing case rather than lowering a threshold.)

```bash
git add src/adapters/fake/scenarios/bio-interview.ts src/adapters/fake/language-model.ts tests/unit/adapters/fake/language-model.test.ts tests/unit/adapters/fake/scenarios.test.ts
git commit -m "test: add the bio-interview fake-model scenario"
```

---

### Task 4: End-to-end — "Write a bio" asks, the answer goes by the Send button, the bio lands

**Files:**
- Modify: `tests/e2e/helper.spec.ts` (append one test)

**Interfaces:**
- Consumes: Task 1's `button "Send"`; Task 3's scenario name `bio-interview` and its texts (literals below must match `BIO_QUESTION` and `INTERVIEW_BIO` exactly); existing e2e helpers `signIn`, `newCat`, `upload`, `frame`, `runAxe`, `deleteCat` from `./_lib`.
- Produces: nothing.

- [ ] **Step 1: Write the e2e test**

Append to `tests/e2e/helper.spec.ts`:

```ts
// F65: a standalone "Write a bio" on a page with a photo and no bio looks first (the
// scenario reads the outline and media and views the photo), asks one question that points
// at the photos, and writes only once it is answered. The answer goes by the Send button,
// not Enter — the button's one end-to-end proof.
test("Write a bio asks a question about the photos first, and the answer sent with the Send button writes the bio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().setExtraHTTPHeaders({ "x-fake-scenario": "bio-interview" });
  await signIn(page);
  await newCat(page);
  await upload(page, ["cat-1.jpg"]);

  const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
  await helper.getByRole("button", { name: "Write a bio" }).click();
  await expect(
    helper.getByText(
      "I can see her settled on a windowsill in the photos. Is that her favourite spot, and what does she do there?",
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-block-type='bio']")).toHaveCount(0);

  const send = helper.getByRole("button", { name: "Send" });
  await expect(send).toBeDisabled();
  await helper.getByPlaceholder("Ask for a change…").fill("Yes, the sill is hers. She chirps at pigeons.");
  await expect(send).toBeEnabled();
  await send.click();

  await expect(helper.getByText("That's the bio written.")).toBeVisible({ timeout: 15_000 });
  await expect(frame(page, /^BIO/)).toContainText(
    "The windowsill is hers from the first light, and she chirps at every pigeon that lands outside.",
  );
  await runAxe(page);

  await deleteCat(page, "Unnamed cat");
});
```

Check the imports at the top of the file include `frame` and `deleteCat` (they already do: `import { buildCat, CAT_1, deleteCat, frame, newCat, pick, runAxe, signIn, upload } from "./_lib";`).

- [ ] **Step 2: Build and run the new e2e test**

Run: `pnpm build && pnpm exec playwright test tests/e2e/helper.spec.ts -g "Write a bio asks a question"`
Expected: PASS. If `frame(page, /^BIO/)` does not match a freshly added bio block's frame label, look at how `fillSections` in `tests/e2e/_lib/cat.ts` finds it and match that; if the bio text lives in an editor, assert on `frame(page, /^BIO/).getByRole("textbox", { name: "Bio" })` with `toContainText`.

- [ ] **Step 3: Run the whole e2e suite for regressions**

Run: `pnpm test:e2e`
Expected: PASS. The Send button adds one control to the helper panel and the phone drawer; if a phone test's `phoneFloors` (≥44px targets, no sideways scroll) or an axe run fails, fix the layout in `Composer.tsx`, not the test.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/helper.spec.ts
git commit -m "test: e2e for Write a bio asking first, answered with the Send button"
```

---

### Task 5: All gates, then the real-model check

**Files:**
- Create: `docs/superpowers/specs/2026-09-22-catalyst-send-and-questions-model-check.md` (the recorded replies)

**Interfaces:**
- Consumes: everything above.
- Produces: the check record the owner reviews before the work is called done.

- [ ] **Step 1: Run every gate**

Run, and keep the output:

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```

Expected: every command exits 0. Any failure is fixed before Step 2; report it with its output.

- [ ] **Step 2: Start the app against the real model**

Run: `STORE=fs MODEL=vertex pnpm dev`
This needs Google Cloud credentials (ADC, `gcloud auth application-default login`) and the `.env.local` Vertex settings. If the app cannot reach Vertex, stop here and ask the owner to run `! gcloud auth application-default login`; do not substitute the fake model.

- [ ] **Step 3: Run the four checks and record the replies verbatim**

In the builder at `http://localhost:3000/builder`, for each case create a cat, then record CATalyst's full replies (questions and final text) in the check file:

1. **Photos, little text:** a new cat with three photos uploaded (`tests/fixtures/cat-1.jpg`, `cat-2.jpg`, `cat-3.jpg`) and only the name filled. Click "Write a bio". Pass if: it asks one to three questions, one per message, and at least one names something visible in the photos; answering does not trigger a second look (no new photo reads); the written bio states nothing that was only a photo guess the volunteer didn't confirm. Record the seconds from the click to the first question.
2. **Well-filled page:** a cat with the name, age and sex filled, a quote about a daily habit, a needs card saying she prefers a home without dogs, a caption describing a game she plays, and photos. Click "Write a bio". Pass if: it writes the bio with no question first.
3. **Shorten:** on case 2's cat, after its bio exists, type "Shorten the bio" and click Send. Pass if: no question; a card proposes a shorter bio.
4. **Build the page:** a new cat with three photos and nothing else. Click "Build the page". Pass if: after name/age/sex, most interview questions point at something in the photos; after the yes, no further question appears (write-bio does not start a second interview), the hero fill lands within 8 s of the yes (FR-080), and the bio is written with no question.
5. **"Just write it":** a new cat with photos only. Click "Write a bio", and answer the first question with "just write it". Pass if: it writes the bio at once with no further question.
6. **Phone (optional, if time allows):** repeat case 1 at 390px wide in the CATalyst drawer, sending the answer with the Send button. Pass if: the questions stay short (the phone prompt line) and the drawer drops to Peek on send.

Write each case into `docs/superpowers/specs/2026-09-22-catalyst-send-and-questions-model-check.md` as: the setup, the replies verbatim, pass/fail against the criterion above.

- [ ] **Step 4: If a check fails, sharpen the skill text**

A failure is fixed in `src/core/helper/skills/write-bio.md` or `build-profile.md` wording only (the spec's "Risk to watch"), then Task 2's tests re-run (`pnpm vitest run tests/unit/core/helper/skills.test.ts`) and the failing case re-checked and re-recorded. Update a Task 2 test only if a pinned phrase itself had to change.

- [ ] **Step 5: Record the process waiver**

The constitution (Development Workflow → Waivers, `.specify/memory/constitution.md:309`) requires any deviation to be recorded in the change description. At the top of the check file, and later in the PR description, add:

```markdown
**Waiver — Spec Kit workflow.** This change used a Superpowers spec
(`docs/superpowers/specs/2026-09-22-catalyst-send-and-questions-design.md`) and plan
(`docs/superpowers/plans/2026-09-22-catalyst-send-and-questions.md`) instead of the Spec Kit
pipeline (`/speckit-specify` → … → `/speckit-converge`), at the project owner's explicit
request on 2026-09-22. Reason: a small, three-part change to existing helper behaviour.
Rejected alternative: the full Spec Kit pipeline, including `/speckit-converge` as the
definition of done; completion is instead the gates in Step 1 plus the real-model check.
```

- [ ] **Step 6: Commit the record**

```bash
git add docs/superpowers/specs/2026-09-22-catalyst-send-and-questions-model-check.md src/core/helper/skills/
git commit -m "docs: record the real-model check for CATalyst's personalised questions"
```
