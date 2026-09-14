import { z } from "zod";

/**
 * A URL that is safe to render as an `href`: it must parse as an absolute URL whose
 * protocol is `http:` or `https:`. `zod`'s built-in `.url()` check accepts any scheme
 * (`javascript:`, `data:`, `mailto:`, …), so this parses with the platform `URL` class and
 * checks the protocol explicitly. Relative strings do not parse as absolute URLs and are
 * rejected too.
 */
export const HttpUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "Links must start with http:// or https://.");

/** A string known to parse as an `http:` or `https:` URL. */
export type HttpUrl = z.infer<typeof HttpUrlSchema>;

/**
 * One run of text inside a paragraph, with the marks the bio editor supports. `bold` and
 * `italic`, when present, are always `true` — there is no explicit "off" value; a run
 * without the key is not bold (or not italic).
 */
const RunSchema = z.strictObject({
  text: z.string().max(2000),
  bold: z.literal(true).optional(),
  italic: z.literal(true).optional(),
  href: HttpUrlSchema.optional(),
});

/** One run of text inside a {@link Paragraph}. */
export type Run = z.infer<typeof RunSchema>;

const ParagraphSchema = z.strictObject({
  runs: z.array(RunSchema).max(200),
});

/** One paragraph of a {@link RichText} document. */
export type Paragraph = z.infer<typeof ParagraphSchema>;

/**
 * The bio's rich text shape (data-model.md → RichText, ADR-013): paragraphs of runs, each
 * run plain text with optional bold, italic and link marks. This is the only shape the
 * document ever stores for rich text — it is rendered by React elements directly
 * (`<p>`, `<strong>`, `<em>`, `<a>`), never through an HTML string. Every level is strict:
 * a key the schema does not know is rejected, never carried into the document.
 */
export const RichTextSchema = z.strictObject({
  paragraphs: z.array(ParagraphSchema).max(40),
});

/** The bio's rich text document: paragraphs of runs. See {@link RichTextSchema}. */
export type RichText = z.infer<typeof RichTextSchema>;

const TiptapMarkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }),
  z.object({ type: z.literal("italic") }),
  z.object({ type: z.literal("link"), attrs: z.looseObject({ href: HttpUrlSchema }) }),
]);

const TiptapTextNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(TiptapMarkSchema).optional(),
});

const TiptapParagraphNodeSchema = z.object({
  type: z.literal("paragraph"),
  content: z.array(TiptapTextNodeSchema).optional(),
});

/**
 * The subset of Tiptap's JSON output this app configures the editor to produce (ADR-013):
 * a `doc` of `paragraph` nodes, each holding `text` nodes with `bold`, `italic` and `link`
 * marks only. Any other node type (`heading`, `image`, `hardBreak`, …) or mark type is
 * outside the configured extension set and fails to parse.
 */
const TiptapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(TiptapParagraphNodeSchema).max(40).optional(),
});

/** Tiptap's document JSON, restricted to the node and mark types this app configures. */
export type TiptapDoc = z.infer<typeof TiptapDocSchema>;
type TiptapTextNode = z.infer<typeof TiptapTextNodeSchema>;
type TiptapMark = z.infer<typeof TiptapMarkSchema>;

function runFromTiptapText(node: TiptapTextNode): Run {
  const run: Run = { text: node.text };
  for (const mark of node.marks ?? []) {
    applyMark(run, mark);
  }
  return run;
}

function applyMark(run: Run, mark: TiptapMark): void {
  if (mark.type === "bold") {
    run.bold = true;
  } else if (mark.type === "italic") {
    run.italic = true;
  } else {
    run.href = mark.attrs.href;
  }
}

/**
 * Parses Tiptap's document JSON (`unknown`, since it crosses the editor/core boundary) into
 * the document's own {@link RichText} shape. A node or mark type outside the configured
 * extension set (`heading`, `image`, an `underline` mark, …) or an `href` that is not
 * `http:`/`https:` throws a `ZodError` — this function never coerces untrusted input into a
 * document. An empty text run is dropped; a paragraph left with no runs becomes
 * `{ runs: [] }`, and a doc with no paragraphs becomes `{ paragraphs: [] }`.
 */
export function fromTiptap(json: unknown): RichText {
  const doc = TiptapDocSchema.parse(json);
  const paragraphs = (doc.content ?? []).map((paragraph) => ({
    runs: (paragraph.content ?? []).filter((node) => node.text.length > 0).map(runFromTiptapText),
  }));
  return RichTextSchema.parse({ paragraphs });
}

function textNodeToTiptap(run: Run): TiptapTextNode {
  const marks: TiptapMark[] = [];
  if (run.bold) marks.push({ type: "bold" });
  if (run.italic) marks.push({ type: "italic" });
  if (run.href) marks.push({ type: "link", attrs: { href: run.href } });
  return marks.length > 0
    ? { type: "text", text: run.text, marks }
    : { type: "text", text: run.text };
}

/**
 * Converts a {@link RichText} document into the Tiptap JSON shape the editor loads. Follows
 * Tiptap's own convention for "nothing here": an empty paragraph is emitted with no
 * `content` key (not `content: []`), and a document with no paragraphs is emitted with no
 * `content` key on the `doc` node either. This makes {@link fromTiptap} and `toTiptap` exact
 * inverses of each other on every shape either one produces.
 */
export function toTiptap(rt: RichText): TiptapDoc {
  if (rt.paragraphs.length === 0) {
    return { type: "doc" };
  }
  return {
    type: "doc",
    content: rt.paragraphs.map((paragraph) => {
      if (paragraph.runs.length === 0) {
        return { type: "paragraph" };
      }
      return { type: "paragraph", content: paragraph.runs.map(textNodeToTiptap) };
    }),
  };
}

/**
 * The document's text with all formatting stripped: runs are joined with nothing (so bold
 * and italic runs read as continuous prose) and paragraphs are joined with a blank line
 * (`"\n\n"`).
 */
export function plainText(rt: RichText): string {
  return rt.paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
    .join("\n\n");
}

const SENTENCE_END = /[.!?](?=\s|$)/;

/**
 * The first sentence of the document, used where only a one-line summary fits (the hero
 * tagline falls back to this). Returns the first paragraph's text up to and including its
 * first `.`, `!` or `?` that is followed by whitespace or the end of the text — a decimal or
 * an abbreviation like "3.5kg" does not count, since no space follows the period. If the
 * first paragraph has no such terminator, the whole paragraph is returned. The result is
 * always trimmed. An empty document returns `""`.
 */
export function firstSentence(rt: RichText): string {
  const first = rt.paragraphs[0];
  if (!first) return "";
  const text = first.runs.map((run) => run.text).join("");
  const match = SENTENCE_END.exec(text);
  if (!match) return text.trim();
  return text.slice(0, match.index + 1).trim();
}
