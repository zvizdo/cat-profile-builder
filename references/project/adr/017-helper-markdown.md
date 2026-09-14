# ADR-017: The helper's replies render Markdown

**Status**: accepted · **Date**: 2026-09-12

## Context

The helper's reply is a conversational message in `MessageList`, not part of the persisted
profile document — unlike the bio (ADR-013), it is never edited, never round-tripped through
an editor, and never stored. Until now it rendered as one plain-text block, so a reply that
listed several changes or asked several questions came out as a run-on paragraph. F31 asks
for a safe Markdown subset — paragraphs, bold, italic, lists, short headings, links — so a
longer reply reads the way the model actually structured it.

The volunteer's own message is untouched by this: `MessageList` renders it as literal text,
exactly as typed, same as before. Only the assistant's side parses Markdown.

**Constitution, Principle VI**, says plainly: "Model-generated text and user-supplied text
MUST NOT be rendered as HTML. `dangerouslySetInnerHTML` on either is prohibited." Read at its
widest, that forbids this feature outright. The narrower reading this ADR relies on is the one
the rule's own second sentence points at: the mechanism the constitution names as prohibited
is `dangerouslySetInnerHTML` — turning a string into markup by trusting it wholesale. Nothing
here does that. The renderer (`src/ui/helper/Markdown.tsx`) walks the model's text through a
parser and produces React elements one node at a time; a literal `<img onerror>` or
`<script>` in the reply is data the parser did not recognise as Markdown, so it comes out as
escaped text, never as an element, exactly as Principle VI's next bullet requires ("an
unparseable or non-conforming response MUST be rejected"). No HTML string is ever
constructed, parsed by the browser, or injected. This is the same distinction ADR-013 already
drew when it rejected Markdown for the bio for a different reason (a second grammar to
secure) — that document is written by the model *and stored*; this reply is spoken *and
discarded*, one more reason the two calls differ. Flagged here rather than decided
silently, since it is a judgment call on a binding document, not a footnote.

## Decision

- **`react-markdown` v10**, with no `rehype-raw` plugin. It parses Markdown into a tree and
  renders each node as a React element directly — never a raw HTML string, never
  `dangerouslySetInnerHTML`. A literal HTML tag in the source (`<img onerror>`, `<script>`)
  is not Markdown syntax, so it is left as an unrecognised "html" node and rendered as escaped
  text — the default behaviour, asked for with no extra configuration.
- **Two tags are overridden**, everything else left at the library's default:
  - `img` renders nothing. The system prompt already tells the model not to use images; this
    is the backstop for both Markdown image syntax and a raw `<img>` tag alike.
  - `a` always adds `target="_blank"` and `rel="noopener noreferrer"`, and `urlTransform`
    (backed by `isAllowedMarkdownUrl`, `src/core/helper/markdown.ts`) blocks every scheme but
    `http:`, `https:` and `mailto:`. A blocked scheme leaves `href` falsy, and the override
    then renders the link's text with no `<a>` at all — not a real anchor with an empty
    `href`, which would still be a focusable, same-origin link to nowhere (F31 review round
    1, finding 1: an earlier version of this renderer got exactly that wrong).
- **Heading and list styling lives in `globals.css`** (`markdown-reply` utility), not in
  component overrides: Tailwind's preflight already strips the browser defaults from
  headings and lists, so the utility puts back only the tokens this reply needs — 13px
  (inherited, `text-ui-dense`), 600 weight (the family's own heaviest, `DESIGN.md` §2), list
  indent — and never the profile's serif.
- **The system prompt names the allowed subset** (`src/core/helper/prompt.ts`): paragraphs,
  bold, italic, bulleted and numbered lists, short headings, and a link to a URL (http(s) or
  mailto only); no tables, images, raw HTML, or code blocks unless quoting text exactly. This
  is guidance for the model, not a security boundary — the renderer above is what actually
  holds if the model ignores it. (F31 review round 1, finding 2: the prompt line originally
  omitted links even though the renderer already fully supported them — the capability was
  tested and styled but unreachable by the real model until this line said so.)
- **The link-scheme allow-list is a core, framework-free function** (`isAllowedMarkdownUrl`),
  so it is provable at the core's 95%/95% coverage bar and reusable by the renderer without
  the renderer's own tests having to enumerate every scheme.

## Alternatives rejected

- **`marked` or `markdown-it`.** Both return an HTML *string*, which the calling code then
  has to inject — the one thing Principle VI names by its exact mechanism
  (`dangerouslySetInnerHTML`). Reaching for a sanitiser afterwards (`DOMPurify`) trades one
  dependency for two and still ends with a string being trusted, not a tree being walked.
- **A custom hand-rolled parser for just this subset.** ADR-013 already made this call for a
  smaller feature set (bold/italic/link only) and rejected it as "the kind of 'trivial' that
  is not." A parser covering headings and two list types besides is more surface, not less.
- **`remark-gfm`.** Adds tables, strikethrough, task lists and autolinked bare URLs. The brief
  explicitly excludes tables; the rest is unused by the system prompt's allowed subset. Left
  out under the dependency policy's "prefer nothing over something used for one feature" —
  adding it back is a one-line change if a later feature needs it.
- **`rehype-sanitize` on top of `react-markdown`.** Recommended by the library's own docs for
  defence in depth once `remarkPlugins`, `rehypePlugins` or `components` are customised. Not
  added here because the customisation is narrow enough to review by hand (two tag overrides,
  no `rehype-raw`), and a sanitiser schema is itself something to keep in sync with those
  overrides. Worth revisiting if the renderer grows more custom components.
