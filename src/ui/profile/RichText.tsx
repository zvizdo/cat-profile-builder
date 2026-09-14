import type { ReactNode } from "react";
import type { Paragraph, RichText as RichTextDoc, Run } from "@/core/profile/rich-text";

// The bio's rich text as React elements (ADR-013; constitution VI): a `p` per paragraph,
// `strong`, `em` and `a` per mark. The text is only ever a React child, so `<b>` typed
// into a bio is shown as the characters `<b>`, never interpreted.

/** A run's text wrapped in its marks, innermost first: link, then bold, then italic. */
function runElement(run: Run, key: number): ReactNode {
  let node: ReactNode = run.text;
  if (run.italic) node = <em>{node}</em>;
  if (run.bold) node = <strong>{node}</strong>;
  if (run.href !== undefined) {
    node = (
      <a href={run.href} rel="noopener">
        {node}
      </a>
    );
  }
  return <span key={key}>{node}</span>;
}

function paragraphElement(paragraph: Paragraph, key: number): ReactNode {
  return <p key={key}>{paragraph.runs.map(runElement)}</p>;
}

/** The document's paragraphs as `p` elements with their inline marks. */
export function RichText({ content }: { content: RichTextDoc }) {
  return <>{content.paragraphs.map(paragraphElement)}</>;
}
