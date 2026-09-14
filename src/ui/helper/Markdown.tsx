import ReactMarkdown, { type Components } from "react-markdown";
import { isAllowedMarkdownUrl } from "@/core/helper/markdown";

// The helper's reply, rendered as the safe Markdown subset `systemPrompt` (ADR-017) tells
// the model it may use: paragraphs, bold, italic, lists, short headings, links. Model text
// is untrusted input (constitution, Principle VI) — `react-markdown` turns it into React
// elements directly and never touches `dangerouslySetInnerHTML`, so a literal
// `<img onerror>` or `<script>` in a reply comes out as escaped text, not markup, with no
// `rehype-raw` plugin wired to change that. The two things react-markdown's own default
// output would still get wrong for a chat reply — an `<img>` tag rendering an actual image,
// and a link opening in the same tab with no `rel` — are the only tags overridden here;
// heading and list styling is `globals.css`'s `markdown-reply` utility (tokens only), since
// Tailwind's preflight already strips the browser defaults those tags would otherwise carry.

const COMPONENTS: Components = {
  // No images in a helper reply (systemPrompt's own instruction) — drop the tag rather
  // than render an <img>, whether the model wrote Markdown image syntax or a raw HTML tag.
  img: () => null,
  a({ href, children }) {
    // `urlTransform` returns "" for a disallowed scheme. A falsy `href` here must not
    // become `<a href="">` — that is a real, focusable, same-origin link to nowhere, styled
    // and clickable like a working one, invisible only to a screen reader's link list
    // (F31 review round 1, finding 1). Render the text plainly instead: no anchor at all.
    if (!href) return children;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

/** `url`, or `""` to drop the attribute — only `http:`, `https:` and `mailto:` links survive. */
function urlTransform(url: string): string {
  return isAllowedMarkdownUrl(url) ? url : "";
}

export interface MarkdownProps {
  /** The helper's reply text, verbatim from the model. */
  text: string;
}

/** The helper's reply body: `text` parsed as the safe Markdown subset and rendered as React. */
export function Markdown({ text }: MarkdownProps) {
  return (
    <div className="markdown-reply">
      <ReactMarkdown components={COMPONENTS} urlTransform={urlTransform}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
