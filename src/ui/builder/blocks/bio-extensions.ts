import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import { HttpUrlSchema } from "@/core/profile/rich-text";

// The editor's whole vocabulary (ADR-013): Document, Paragraph, Text, Bold, Italic, Link
// and undo/redo — nothing else. Every other node and mark in the starter kit is switched
// off, so a pasted heading, list, image or underline has no node to land in and becomes
// text; `fromTiptap` then only ever meets the shapes it knows. A link is one the core
// accepts — `http:` or `https:` — checked here on paste and again before `setLink`.

export const BIO_EXTENSIONS = [
  StarterKit.configure({
    blockquote: false,
    bulletList: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    hardBreak: false,
    heading: false,
    horizontalRule: false,
    link: false,
    listItem: false,
    listKeymap: false,
    orderedList: false,
    strike: false,
    trailingNode: false,
    underline: false,
  }),
  Link.configure({
    autolink: false,
    linkOnPaste: false,
    openOnClick: false,
    isAllowedUri: (url) => HttpUrlSchema.safeParse(url).success,
    HTMLAttributes: { rel: "noopener" },
  }),
];
