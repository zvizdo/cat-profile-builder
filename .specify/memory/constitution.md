# Cat Profile Builder Constitution

## Core Principles

### I. Modular, Framework-Free Core

The rules that decide what a cat profile *is* MUST live in plain TypeScript modules that do
not import React or Next.js. Framework code is an edge, not a home.

- The core owns the profile document: its schema, its section and block types, the operations
  that add, remove, reorder, and restyle blocks, its validation, its migrations, and its
  serialization. All of it MUST be callable from a test with no DOM and no network.
- React components, Server Actions, and Route Handlers MUST remain thin adapters: read input,
  delegate to a core operation, render or return the result. A reordering rule, a gradient
  rule, or a prompt-assembly rule inside a component body is a defect.
- Every dependency that crosses a module boundary MUST be typed against an abstraction (an
  `interface` or `type`), not a concrete implementation. The model provider, the image
  enhancement provider, the media store, and the profile store are injected collaborators —
  never module-level singletons, never constructed inside the code that consumes them.
- Every unit MUST have exactly one reason to change. A module that cannot be described
  without the word "and" MUST be split.
- An `import` of `react`, `next/*`, or any UI library inside the core is a defect, and this
  MUST be enforced mechanically by an ESLint import restriction rather than by review memory.

Recommended ceilings — files ≤ 400 lines, components ≤ 200 lines, functions ≤ 50 lines,
cyclomatic complexity ≤ 10, ≤ 5 parameters per callable. Linters report these as warnings.
Reviewers MUST challenge every breach and either see it decomposed or see a written
justification.

**Rationale**: The builder's hard parts — block reordering, document migration, turning a
model's suggestion into a legal document edit — are pure logic wearing a UI costume. Kept in
the core they are cheap to test exhaustively and survive a redesign; scattered through
components they are testable only by clicking, and every visual change risks them. This
separation is also what makes the coverage bar in Principle III reachable honestly.

### II. Test-First Development (NON-NEGOTIABLE)

Red-Green-Refactor is mandatory for everything in the framework-free core, for every Server
Action and Route Handler, for schema validation and migrations, for the AI helper's edit
handlers, and for every pure function on either side of the boundary.

1. Write a test that expresses the desired behavior.
2. Run it. Observe it FAIL for the expected reason. A test that has never been seen to fail
   is not evidence of anything.
3. Write the minimum implementation that makes it pass.
4. Refactor with the test green.

Bug fixes MUST begin with a failing test that reproduces the bug. Implementation code MUST
NOT be committed ahead of its test. Tests MUST assert on behavior and public contracts, not
on private internals — a test that breaks under pure refactoring is a defective test.

Every guard in this document MUST have a test that asserts the *denial*, not only a test that
asserts the happy path: a rejected model output, a rejected upload, a rejected document that
fails schema validation, a rejected AI edit that falls outside the allowed operations.

Visual layout, styling, and animation are exempt from strict test-first ordering and are
instead covered by component and end-to-end tests. The logic those components delegate to is
not exempt.

**Rationale**: Coverage retrofitted after implementation measures which lines executed, not
whether behavior is correct. For the guards in particular, an untested denial branch is
indistinguishable from an absent one — and the guards are what stand between the AI helper
and a volunteer's afternoon of work.

### III. Verified Coverage

Two thresholds, both blocking, and neither MAY be lowered to make a build pass.

- **The framework-free core MUST sustain ≥ 95% line coverage AND ≥ 95% branch coverage.**
- **The application as a whole MUST sustain ≥ 80% line coverage AND ≥ 80% branch coverage.**

Additional rules:

- Coverage is measured by the configured test runner with V8 or Istanbul instrumentation and
  branch coverage enabled.
- Model calls, image enhancement calls, media storage, and profile persistence MUST sit
  behind an injected abstraction (Principle I) so that the core and every handler are
  testable with no network access and no provider key. Reaching the network directly from
  core code is a defect, not a candidate for coverage exclusion.
- Exclusions MUST be declared in a single explicit version-controlled list — generated code,
  type-only declarations, config files, and the app shell's static boilerplate. Ad-hoc inline
  coverage pragmas scattered through source are prohibited, and every exclusion MUST carry a
  comment stating why the code is untestable or not worth testing.
- **Which suites count as evidence is a separate question from which source is excluded, and
  MUST be declared once.** Both numbers above are measured over the unit, component, and
  contract suites only. End-to-end runs are required by Quality Gates but MUST NOT feed the
  coverage number: an untested branch MUST NOT report as covered because an unrelated
  Playwright click executed it once without asserting anything about it.

**Rationale**: A single number CI enforces is unambiguous; per-file negotiation over what
"enough" means is where coverage discipline dies. The split exists because the two halves of
this codebase fail differently — a wrong reorder rule silently corrupts a document, while a
wrong margin is visible to anyone who looks. Naming the network boundaries explicitly is what
keeps the number honest, since a growing exclusion list is how a 95% bar quietly becomes a
70% one.

### IV. Strict Static Typing

Type checking is a blocking gate.

- TypeScript MUST run with `strict: true`, plus `noUncheckedIndexedAccess` and
  `noImplicitOverride`. `tsc --noEmit` MUST report zero errors.
- The `any` type is prohibited in application code. Use `unknown` and narrow it.
- Data arriving from outside the program — form input, a stored profile document, a model
  response, an uploaded file's metadata, an environment variable — is `unknown` until a schema
  validates it. A type assertion (`as`) MUST NOT be used to launder untrusted data into a
  typed shape; that is what Principle VI's validation boundary is for.
- Escape hatches are permitted but never silent. Every `@ts-expect-error` or `eslint-disable`
  MUST be narrowly scoped to a specific rule or error code — never a blanket suppression —
  and MUST carry an adjacent comment explaining why it is necessary. Bare, uncommented
  suppressions MUST fail review.
- Suppressions are tracked as technical debt and reviewed at each constitution review.

**Rationale**: Strictness catches cheaply the class of defects tests miss. The rule against
`as` on untrusted data matters most at the model boundary, where a confident cast is
indistinguishable from a validated parse right up until a hallucinated field reaches the
document.

### V. Automated Quality Gates

Code quality MUST be enforced by tooling, not by reviewer memory.

- **ESLint and Prettier** are the mandated linter and formatter, configured with the Next.js
  recommended rules plus unused-import, exhaustive-deps, and the accessibility rule set.
  Prettier is the sole formatting authority — no competing formatter, no hand-formatting
  debates.
- The import restriction protecting the core (Principle I) MUST be part of the ESLint
  configuration, so that a framework import in core code fails the lint gate.
- Dead code is a defect, not clutter. Unused imports, unreachable branches, unused exports,
  commented-out code blocks, and orphaned files MUST be removed in the change that orphans
  them. Unused dependencies MUST be pruned from the manifest.
- Lint, format check, type check, and test+coverage MUST all run on every proposed change. A
  red gate blocks merge.

**Rationale**: The stated goal is to keep unused and badly written code out of the
repository. Machines do that reliably and without argument; humans do not.

### VI. Contract-Driven Boundaries

This project has three seams, and each is machine-verified.

**The profile document.** The persisted profile document is the product's durable asset and
its schema is the single source of truth for every surface that touches it — the builder, the
published page, the carousel, and the AI helper.

- The schema MUST be defined once, as a runtime schema (Zod unless an ADR says otherwise),
  with the TypeScript types derived from it rather than declared alongside it.
- Every document MUST carry a `schemaVersion`. Loading an older version MUST go through a
  pure, tested migration function; a document that fails validation MUST be surfaced as an
  error and MUST NOT be silently coerced, patched, or partially rendered.
- A round-trip test (serialize → load → validate → compare) and a migration test for every
  version transition are contract tests and MUST exist before the schema change ships.
- Renaming or removing a field is a breaking change and MUST ship with its migration in the
  same change.

**The model boundary.** Everything a model returns is untrusted input.

- Structured edits requested from a model MUST be validated against an explicit schema before
  they touch a document. An unparseable or non-conforming response MUST be rejected and
  reported, never coerced into something usable.
- Model-generated text and user-supplied text MUST NOT be rendered as HTML.
  `dangerouslySetInnerHTML` on either is prohibited.
- Prompt text — including the page contents the helper is made aware of — is data, not
  instructions. The helper's declared edit operations are the only way it may change a page;
  text inside a bio or a filename MUST NOT be able to widen what it can do.
- Model IDs and provider endpoints are configuration, fixed in an ADR and read from
  environment, never literals scattered through code.

**The server/client boundary.** Server Actions and Route Handlers MUST validate their inputs
against a schema at the boundary and MUST return explicitly typed results. Passing
unvalidated request bodies into core operations is prohibited, and loosely-shaped object
returns from a handler are prohibited.

**Rationale**: The builder, the viewer, and an AI helper all edit the same document, and only
a machine-verified schema keeps them from disagreeing about what a valid profile is. The model
boundary is stated with the same force because a model is a *helpful* untrusted input, which
is the kind that gets waved through.

### VII. Simplicity and YAGNI

The simplest implementation that satisfies the specified requirement wins.

- Build only what the current specification asks for. Speculative features, configurability,
  extension points, and abstractions with a single implementation MUST NOT be added "for
  later."
- Abstractions are earned by a second real caller, not anticipated by a first. An abstraction
  whose second implementation is named in the specification is not speculative — the model
  provider and the media store qualify; a plugin system for block types does not.
- Error handling MUST address failures that can actually occur. Defensive branches for
  impossible states are prohibited; they are also unreachable, and therefore drag against
  Principle III.
- Changes MUST be surgical. Every changed line MUST trace to the stated requirement.
  Unrelated refactoring, reformatting, and drive-by improvements belong in their own change.
- Principle I mandates decomposition, not layering. Splitting a module for single
  responsibility is required; adding a pass-through wrapper that only forwards calls is not.

**Rationale**: A block-based builder with an AI helper is the kind of project that invites a
generalized content-management engine nobody asked for. These constraints are held in
deliberate tension with Principle I: decompose for responsibility, never for anticipation.

### VIII. Guarded AI Editing (NON-NEGOTIABLE)

The profile document belongs to the volunteer. The AI helper proposes and applies bounded
edits; it never has free-form write access.

- Every AI edit MUST be expressed as one of the document's declared operations — set a field,
  add or remove a block, reorder blocks, change a background, replace an image. The helper
  MUST NOT write raw document JSON, raw HTML, or raw styles.
- Every AI edit MUST validate against the document schema (Principle VI) *before* it is
  applied. A rejected edit MUST leave the document untouched and MUST tell the user what was
  refused.
- Every AI edit MUST be undoable in one step, and undo MUST restore the exact prior document.
  A generation that replaces the whole page counts as one undoable step.
- The user MUST be able to see what changed. An edit that silently alters content the user
  did not ask about is a defect, not a helpful extra.
- Destructive AI edits — deleting a section, replacing existing user-written text, replacing
  an uploaded photo — MUST be confirmed by the user or trivially reversible. Never both
  irreversible and unconfirmed.
- The helper MUST NOT publish, unpublish, share, or delete a profile. Outward-facing actions
  are the user's alone.

**Rationale**: The founding idea has the AI generate an initial profile and then keep editing
it on request, which means the helper's write path is the one place where a single
misunderstood sentence can destroy work a volunteer cannot recover. Undo and validation are
not UX niceties here; they are the only thing standing between a bad suggestion and a lost
afternoon — which is why this is a principle rather than a workflow preference.

### IX. Craft, Motion, and Accessibility

Presentation quality is a requirement of this product, not a phase at the end of it. The
stated bar is a profile page that reads as deliberately designed.

- Styling MUST flow from a single set of design tokens — color, type scale, spacing, radius,
  shadow, motion duration and easing. Ad-hoc inline styles and duplicated magic values are
  prohibited. User-chosen backgrounds and gradients are document data constrained by the
  schema, not free-form CSS.
- Motion MUST be purposeful and MUST NOT block interaction. Animation MUST run on compositor-
  friendly properties (transform, opacity) wherever it can, and a carousel MUST hold its
  frame-rate budget with a realistic set of profiles loaded — a viewer that stutters through
  its own cats is not slow, it is unbuilt.
- The UI MUST meet WCAG 2.1 Level AA: semantic HTML, full keyboard operability, visible focus,
  labeled controls, sufficient contrast, and meaningful alternative text for every cat photo
  and video.
- `prefers-reduced-motion` MUST be honored. Under it, the carousel MUST stop auto-advancing
  and remain fully usable by keyboard and pointer. An auto-looping carousel MUST always be
  pausable and manually navigable.
- Every published profile MUST work at phone width and MUST remain readable and navigable
  with images or videos still loading.
- Accessibility linting runs as part of the ESLint gate, and every interactive component
  carries a test asserting its keyboard path (Quality Gates).

**Rationale**: "Beautiful like an Apple product page" is the founding requirement, and the
mechanisms that deliver it — tokens, restrained motion, real responsive layout — are the same
mechanisms that keep it consistent as features accumulate. Accessibility is bound into the
same principle deliberately: the auto-playing animated carousel is precisely the surface that
excludes keyboard, screen-reader, and motion-sensitive visitors, and adoption profiles exist
to be seen by everyone.

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Application | Latest stable Next.js, App Router, TypeScript | The entire product — builder, published profile pages, carousel viewer, and server endpoints. One app, no separate backend service. |
| Rendering | React Server Components by default; `"use client"` only where interactivity requires it | Fast published pages; client interactivity confined to the builder canvas, the AI helper panel, and the carousel. |
| Core logic | Plain TypeScript modules with no framework imports (Principle I) | Profile document schema, block operations, migrations, prompt assembly, validation. |
| Validation | Zod (unless superseded by an ADR), types derived from schemas | The single validation boundary for form input, stored documents, model output, and env vars. |
| Text and page-edit model | Gemini, model ID fixed in an ADR and read from configuration | Drafting bios, generating an initial profile from a description and photos, and applying requested edits as declared operations. |
| Image model | Nano Banana, model ID fixed in an ADR and read from configuration | Enhancing volunteer-supplied cat photos for the profile layout. |
| Quality tooling | TypeScript strict mode, ESLint, Prettier | Blocking type, lint, format, and accessibility gates (Principles IV and V). |
| Testing | Unit + component runner with branch coverage, plus an end-to-end runner; exact choices fixed in an ADR | The coverage thresholds of Principle III and the journey tests of Quality Gates. |
| Persistence, media storage, styling system, animation library, drag-and-drop library | Deliberately unfixed — constrained by property below, settled in an ADR before the code that depends on them | Keeps exploratory tooling choices out of the amendment process. |

Components constrained by property rather than by name MUST satisfy: reachable only through
the injected abstractions Principle I requires; testable without network access; and
replaceable as a contained change. The persistence layer MUST additionally support storing a
schema-versioned document and reading it back byte-faithfully, and the media store MUST keep
uploaded and generated media out of the repository.

One package manager, one lockfile, committed. Dependencies are declared in `package.json` and
pinned in that lockfile.

## Development Workflow

This project follows **specification-driven development** using the Spec Kit pipeline. In this
installation the commands are invoked with hyphens:

1. **Constitution** (`/speckit-constitution`): establish and maintain these principles
2. **Specification** (`/speckit-specify`): define requirements before any code is written
3. **Brainstorming** (`/speckit-superspec-brainstorm`): challenge assumptions, find edge cases
4. **Planning** (`/speckit-plan`): design the approach with a constitution compliance check
5. **Task decomposition** (`/speckit-tasks`, then `/speckit-superspec-tasks`): break the plan
   into executable, trackable tasks
6. **Execution** (`/speckit-superspec-execute`): implement with TDD discipline and checkpoints
7. **Review** (`/speckit-superspec-review`): verify the implementation against spec and
   constitution

### Workflow Rules

- No code is written before a spec is approved.
- Every spec goes through at least one brainstorm session.
- Implementation plans MUST pass a constitution compliance check.
- Phase checkpoints require explicit human approval and MUST NOT be skipped.
- Work proceeds on feature branches. Direct commits to the default branch are prohibited.
  TODO(VERSION_CONTROL): this working tree is not a git repository, so every rule here that
  references branches, pull requests, or commits is an obligation with no mechanism behind it.
  Initializing version control is a prerequisite of the first change that adds application code.
- Complexity ceilings from Principle I surface as warnings; the author MUST either decompose
  the code or record why the breach is warranted.
- **Waivers.** Any deviation from a rule in this document MUST be recorded in the change
  description, naming the principle waived, the reason, and the simpler alternative that was
  rejected. Silently disabling a gate — lowering a coverage threshold, deleting a lint rule,
  broad-suppressing a type error — is a constitutional violation in itself.
- Multi-step work states its success criteria before implementation begins, so completion is
  verifiable rather than asserted.
- Completion claims MUST be backed by observed command output. "Tests pass" without having
  run the tests is prohibited.

### Pre-implementation Gates

These are blocking and precede implementation work on a feature:

1. A feature MUST NOT enter implementation while any checklist under
   `specs/<feature>/checklists/` has unchecked items. Checklist markers are reviewer-owned: an
   agent MUST NOT check, uncheck, or reword them, and a checked box means the requirements
   criterion was reviewed and satisfied — never that implementation is done.
2. A CRITICAL finding from `/speckit-analyze` MUST be resolved by correcting the spec, plan,
   or tasks. Resolving it by reinterpreting, diluting, or silently ignoring the principle it
   violates is prohibited; changing the principle itself requires a separate amendment.
3. A feature MUST NOT be reported complete until `/speckit-converge` reports no remaining
   unbuilt work against its spec. "Complete" means converged with the specification, not
   "every task is marked done".

## Quality Gates

Every proposed change MUST pass all of the following, and each one is blocking.

TODO(CI_PIPELINE): no CI workflow exists yet, so nothing enforces these gates mechanically.
Standing one up is a prerequisite of the first change that adds application code. Until then
every gate is an obligation on whoever writes the code, which Principle V names as the weaker
arrangement.

### Testing Requirements

- **Unit tests**: REQUIRED — the framework-free core at ≥ 95% line and branch coverage,
  written test-first per Principle II.
- **Component tests**: REQUIRED — every interactive component (builder canvas, block editors,
  reorder affordance, background picker, AI helper panel, carousel controls), including an
  assertion of its keyboard path and its accessible labels.
- **Contract tests**: REQUIRED — document schema round-trip, every schema migration, every
  Server Action and Route Handler input boundary, and model-output validation including its
  rejection path.
- **End-to-end tests**: REQUIRED for the critical journeys — build a profile from scratch and
  publish it; generate an initial profile from a description and photos, then edit it through
  the AI helper and undo that edit; view a multi-cat carousel with keyboard navigation and
  with reduced motion enabled. End-to-end runs MUST NOT count toward the coverage numbers
  (Principle III).
- **TDD discipline**: REQUIRED — tasks marked `[TDD]` MUST follow RED-GREEN-REFACTOR. Visual
  layout and animation are exempt from test-first ordering, per Principle II.
- **App-wide coverage**: REQUIRED — ≥ 80% line and branch, measured over the unit, component,
  and contract suites.

### Review Requirements

- **Code review**: REQUIRED — the maintainer reviews every change against these principles,
  with attention to the rules CI cannot check: single responsibility, simplicity, and whether
  an abstraction has earned its place.
- **Spec compliance**: REQUIRED — every acceptance scenario in the feature spec passes, and
  `/speckit-converge` reports no unbuilt work.
- **Security review**: REQUIRED whenever a change touches uploads, model calls, publishing,
  secrets, or the server/client boundary. Scope: no provider key reachable from the browser,
  every boundary validated, no untrusted string rendered as HTML.
- **Accessibility review**: REQUIRED for any change to a user-facing surface — keyboard path,
  focus visibility, contrast, alternative text, and reduced-motion behavior.
- **Performance review**: REQUIRED for the builder and the carousel. Budgets are set per
  feature spec and MAY gate a milestone, because a surface that cannot render its own content
  is not slow, it is unbuilt. Absent a spec-set number, the defaults are: a published profile
  page reaching Largest Contentful Paint within 2.5 seconds on a mid-tier mobile connection,
  and a carousel sustaining at least 55 frames per second with twenty profiles loaded.

### Deployment Gates

- All tests pass, with observed output.
- All review items resolved.
- Constitution compliance verified, and any waiver recorded in the change description.
- Lint, format check, and `tsc --noEmit` clean; the production build succeeds.
- No secret, provider key, or private endpoint present in the client bundle.
- The published profile page renders correctly at phone width and passes the accessibility
  checks above.

## Engineering Standards

These are binding, and they sit under Governance's amendment procedure like any principle.

**Repository layout.** One Next.js application. The framework-free core lives in its own
directory tree, imports no framework, and is the only place document rules live. Server-only
code — provider keys, model calls, media writes — MUST be unreachable from client components,
enforced by module boundaries rather than by convention.

**AI and media guardrails.**

- Provider keys are server-side only. A model or image call from the browser is prohibited,
  and no key may appear in a client-readable variable or in the bundle.
- Every model and image call goes through an injected provider abstraction, so tests never
  reach a network and a provider swap is a contained change.
- Model output is untrusted input and is validated before use (Principle VI).
- Uploads MUST be validated server-side for file type, size, and dimensions, and rejected
  explicitly when they fail. Location metadata MUST be stripped from photos before publishing.
- Generated or enhanced images MUST record their provenance: which model produced them and
  from which source image. A volunteer MUST be able to tell an enhanced photo from the
  original and MUST be able to revert to the original.
- Model and image endpoints MUST be rate-limited.
- Responses MUST be bounded and honest. Truncation MUST be signalled explicitly; silently
  returning a truncated result as though it were complete is prohibited.
- **Cost accounting.** Every model call MUST record token usage and cost so that what a
  session cost can be reported exactly. Spend is observed, not enforced: no ceiling halts
  execution. Where an operation is expensive enough that someone would want to decline it,
  the control MUST be an estimate shown before the work starts, not a ceiling that stops it
  midway — a run halted partway has already spent the money and discarded the result.

**Publishing.** Publishing is an explicit human action, and it is reversible: a published
profile MUST be unpublishable, and unpublishing MUST take effect for new visitors
immediately. A published URL is public — the published page MUST contain only what the
volunteer put in the profile, never internal identifiers, draft content, or contact details
the volunteer did not enter.

**Error handling and failure semantics.** Define a base error type with meaningful typed
subclasses; errors MUST carry enough context to diagnose the failure without reproducing it.

- Empty catch blocks are prohibited, as is catching an error, logging it, and continuing as
  though nothing happened. Catch the narrowest error that can actually occur at that call
  site; otherwise let it propagate.
- Server failures MUST map to explicit HTTP status codes and one consistent error-body shape.
  Internal exception detail and provider error text MUST NOT leak to clients.
- A failure MUST NOT cost the user their work in progress. Any error path in the builder MUST
  leave the current document recoverable, and the user MUST be told what failed in plain
  language and what they can do next.

**Dependency policy.** Prefer the platform, then an existing dependency, then a new one — in
that order.

- Every new third-party dependency MUST carry a one-line justification in the change that
  introduces it.
- All dependencies MUST be pinned in the committed lockfile.
- A dependency added for a single trivial function MUST be rejected; write the function.
- A dependency MUST be removed from the manifest in the same change that removes its last use.

**Documentation and decision records.** Every exported function, type, and component MUST
carry a doc comment stating its purpose and contract — what it is for and what it guarantees,
not a restatement of its signature. Comments explain WHY, never WHAT; a comment describing
what the code plainly does MUST be deleted rather than maintained.

Significant architectural decisions MUST be captured as an Architecture Decision Record
stating the context, the decision, and the alternatives rejected with reasons. A decision
qualifies when reversing it later would be expensive — the profile document format, the
persistence backend, the media store, the styling system, the animation library, the
drag-and-drop library, the model providers and their model IDs, the image enhancement
pipeline, and the publishing model.

**Logging and secrets.** Server-side logging MUST be structured and emitted through the
configured logger; `console.log` is prohibited in application code. Prompts and model
responses MAY be logged for debugging only with secrets and personal data redacted at the
logging boundary, never at each call site. Credentials, API keys, and tokens MUST NEVER be
logged and MUST NEVER be committed; they are supplied by environment or a secret manager.

## Governance

This constitution is the highest governing document for all development activity in this
project. Where a tool default, a framework convention, or a habit conflicts with a rule here,
this document wins.

**Authority.** The project maintainer is the sole approver of amendments.

**Enforcement.** Gates are enforced mechanically wherever a machine can check them.
Compliance is the pipeline's job; judgment is reserved for what CI cannot check — single
responsibility, simplicity, whether an abstraction has earned its place, and whether a
profile page is actually beautiful.

**Implementation authority.** Implementation runs through the superspec bridge:
`/speckit-superspec-execute`, registered as the `before_implement` hook in
`.specify/extensions.yml`. Principle II applies unchanged whichever engine runs — the
bridge's test-driven workflow satisfies Red-Green-Refactor, it does not substitute for it.
The bridge's phase checkpoints are human approval points and MUST NOT be skipped.

While a feature's `specs/<feature>/progress.yml` records `execute` as `in_progress`, this
constitution MUST NOT be amended. To amend mid-implementation, pause the feature first, amend,
then resume. This exists so that principles cannot shift underneath work already being checked
against them.

**Amendment procedure.** Amendments MUST be made as a pull request that modifies this file,
states the rationale, and lists any dependent artifacts requiring updates: templates under
`.specify/templates/`, extension configuration in `.specify/extensions.yml` and
`.specify/extensions/`, workflow definitions under `.specify/workflows/`, CI configuration,
and `CLAUDE.md`. The `/speckit-constitution` command does not edit those artifacts — Spec Kit
templates and commands read this document at runtime — so any artifact that genuinely needs a
matching edit MUST be updated in the same pull request as the amendment. Amendments that
tighten a gate MUST include a migration path for code that does not yet comply. Until a
repository with a remote exists and a pull request is possible, the rationale and the
dependent-artifact check MUST still be written down — in the commit that amends this file, or
in `references/project/` if there is not yet a commit to carry them.

**Versioning policy.** This constitution follows semantic versioning:

- **MAJOR** — a principle is removed or redefined in a backward-incompatible way, or
  governance authority changes.
- **MINOR** — a principle or section is added, or existing guidance is materially expanded.
- **PATCH** — clarifications, wording, and typo fixes that do not change obligations.

**Compliance review.** Constitutional compliance is reviewed whenever a numeric threshold is
proposed for change, and at each milestone boundary. That review MUST include the current
inventory of type-suppression comments, coverage exclusions, open waivers, and unreviewed AI
edit paths; a growing inventory is the signal that a rule needs amendment rather than
continued exception.

**Runtime guidance.** `CLAUDE.md` provides day-to-day development guidance and MUST remain
consistent with this document. Where the two conflict, this constitution governs code rules
and MUST be treated as correct; `CLAUDE.md` governs how Claude communicates and works with
the maintainer, and wins on that.

`CLAUDE.md` MUST NOT exceed 200 lines, and CI MUST fail above that ceiling. The file is loaded
into agent context on every session, which makes it the most expensive documentation in the
repository per word; the cap exists to keep it a working instruction set rather than a
reference manual.

When the file approaches the ceiling, content MUST be moved out rather than compressed into
unreadability. Extended explanations, runbooks, deep-dive guides, and Architecture Decision
Records belong in `references/project/`, with `CLAUDE.md` retaining at most a one-line pointer
to each. `CLAUDE.md` MUST hold only what is needed on every session; anything needed
occasionally MUST be linked, not inlined. This ceiling governs `CLAUDE.md` alone — documents
under `references/project/` have no length limit.

**Version**: 1.0.0 | **Ratified**: 2026-09-09 | **Last Amended**: 2026-09-09
