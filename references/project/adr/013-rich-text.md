# ADR-013: Rich text model and editor

**Status**: accepted · **Date**: 2026-09-10

## Context

The bio block supports paragraphs, bold, italic, and links only (spec Assumption). FR-020
and Principle VI forbid rendering volunteer or model text as markup. The AI writes bios
through `set_field`, so the model must be able to produce the format too.

## Decision

- **The document stores its own JSON**, defined in the core schema:
  `RichText = { paragraphs: Array<{ runs: Array<{ text; bold?; italic?; href? }> }> }`,
  with `href` restricted to `http(s):` URLs. React renders it as `<p>`, `<strong>`, `<em>`,
  `<a rel="noopener">`. No HTML string exists anywhere in the pipeline.
- **Tiptap** (a ProseMirror-based editor) provides the editing surface, configured with
  exactly `Document`, `Paragraph`, `Text`, `Bold`, `Italic`, `Link`, `History` — nothing
  else. Two pure functions in core convert Tiptap's JSON to `RichText` and back; both are
  unit-tested and reject any node type outside the allowed set.
- The model is given the `RichText` Zod schema as the `set_field` value shape for the bio,
  so a generated bio is validated like any other operation.
- Captions (`day` scenes), card text (`needs`), and the `quote` line are **plain strings**,
  not rich text. Only the bio is rich.

## Alternatives rejected

- **Markdown** — a string that must be parsed and rendered; a second grammar to secure.
- **contentEditable by hand** — bold/italic/link with selection handling across browsers is
  the kind of "trivial" that is not.
- **Lexical** — comparable; Tiptap's plugin-per-mark shape maps more directly onto the
  four allowed features.
