# Cat Profile Builder

## What this project is

A builder for cat adoption profiles. A volunteer adds a cat section by section — name, bio,
photos, videos — rearranges the blocks, picks background colors and gradients, and publishes a
profile page. An AI helper — CATalyst — sits alongside, aware of what is on the page, and can
draft a first version from a description and photos, then edit it on request. A second surface
plays selected profiles as an animated carousel. The bar for how it looks is high on purpose.

Everything binding about the code is in `.specify/memory/constitution.md`. Architecture
decisions (which libraries, why, what was rejected) are in `references/project/adr/`.

## Scope of this file

This file is about **how Claude works with me**: how to talk, when to ask, what to run.

Rules about **the code itself** — architecture, testing, coverage, typing, linting, errors,
dependencies, documentation — live in `.specify/memory/constitution.md`. That document is
binding — CI is meant to enforce it, but no CI exists yet (see Environment and commands below),
so enforcement is manual for now. Read it before writing code. Do not restate its rules here.

If the two ever conflict, the constitution wins for code rules and this file wins for
behavior.

**Keep this file under 200 lines** (constitution, Governance → Runtime guidance). It loads
on every session, so it holds only what's needed every time. Longer explainers, runbooks,
and decision records go in `references/project/` with a one-line pointer left here.

## How to talk to me

**Write everything in plain language.** Assume I follow about half of the technical detail
on first read. Short sentences. Concrete words. No jargon for its own sake.

- **Code, commands, file paths, and config values stay exact.** Never simplify those — a
  simplified command is a broken command. Only the prose around them gets plainer.
- **Define a technical term the first time you use it**, in plain words, in parentheses.
  Use the real term so I learn it. Don't re-define it after that.
- **Lead with the answer.** First sentence says what happened or what the answer is. The
  reasoning comes after. Never make me read three paragraphs to find the result.
- **After making changes, say what changed and why it matters** in plain terms. Not a
  file-by-file recap of the diff.
- **Flag the one thing that matters most** — the biggest tradeoff, risk, or judgment call —
  explicitly. Don't bury it in a list where everything looks equally important.
- **Keep it short by default.** No repeating my question back to me. No preamble. No
  summarizing what you're about to say before saying it.

## How to work

**Think before coding.** State your assumptions out loud. If there are two reasonable ways
to read my request, show me both — don't silently pick one. If you see a simpler approach,
say so. If something is genuinely unclear, name exactly what's confusing.

**When you hit an unknown mid-task:** finish everything that doesn't depend on the answer,
then ask one clear question about what's left. Don't stop everything to ask. Don't guess in
silence either.

**Ask before anything destructive or outward-facing.** Confirm with me first before:

- deleting files, dropping data, or overwriting something you haven't read
- `git push --force`, rewriting history, or any other irreversible git operation
- anything that leaves this machine — pushing, posting, or calling an external API that
  writes

Ordinary edits, reads, and searches need no confirmation.

**Prove it before you claim it.** "Tests pass" means you ran them and saw the output. If
something failed, say so and show the error. If you skipped a step, say which one.

**Don't touch review checkboxes.** Checklists under `specs/<feature>/checklists/` are mine to
tick. Never check, uncheck, or reword an item. A checked box means I reviewed that criterion
and accepted it — it never means the code got written.

## The workflow

Every feature goes through Spec Kit, in this order. In this install the commands use hyphens:

`/speckit-specify` → `/speckit-superspec-brainstorm` → `/speckit-plan` → `/speckit-tasks` →
`/speckit-superspec-execute` → `/speckit-superspec-review`

- No code before an approved spec. No implementation while a checklist under
  `specs/<feature>/checklists/` still has unchecked items.
- `/speckit-analyze` findings marked CRITICAL get fixed in the spec, plan, or tasks — never
  reinterpreted away.
- A feature is done when `/speckit-converge` says nothing is left unbuilt, not when every task
  is ticked.
- Hooks in `.specify/extensions.yml` are optional and will offer themselves at the right
  moment. Say yes unless there's a reason not to.

## Environment and commands

Next.js app with pnpm (Node 22). Commands, exactly as they run:

| What | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Dev server (local store, fake model) | `STORE=fs MODEL=fake pnpm dev` |
| Lint | `pnpm lint` (also guards against dead spacing classes, e.g. `py-10`, via `pnpm check:spacing`) |
| Format / check formatting | `pnpm format` / `pnpm format:check` |
| Type check | `pnpm typecheck` |
| Unit + component + contract tests with coverage | `pnpm test` (enforces the coverage thresholds) |
| Tests in watch mode | `pnpm test:watch` |
| End-to-end tests (builds first) | `pnpm build && pnpm test:e2e` |
| Production build / run it | `pnpm build` / `pnpm start` |

Every gate above runs in `.github/workflows/ci.yml` on every pull request and push to `main`.
Local environment variables go in `.env.local`; `.env.example` lists them with defaults.
`README.md` is the short run-it / gates / deploy guide; the deploy runbook (Terraform, secrets,
GitHub Actions setup) is `infra/terraform/README.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
