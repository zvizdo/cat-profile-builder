"use client";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { sectionStrings } from "@/core/profile/pronouns";
import { fromTiptap, toTiptap, type RichText, type TiptapDoc } from "@/core/profile/rich-text";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { BIO_EXTENSIONS } from "./bio-extensions";
import { BlockShell } from "./BlockShell";
import type { EditorFor } from "./editor-props";
import { LinkField } from "./LinkField";
import { DRAFT_PAUSE_MS } from "./use-draft-field";
import { useCatSex } from "../cat-sex";
import { useWorkingLock } from "../working-lock";

// The bio (hi-fi 3a; ADR-013; FR-020): the `Who she is` kicker (F41: `sectionStrings`, in
// the cat's own recorded pronoun — `Who he is` / `Who they are`), a small toolbar — Bold,
// Italic, Link — and the prose, edited in Tiptap and written to the document as
// `RichText` through `fromTiptap` on every change. The document never holds Tiptap
// JSON. Changes are sent when the typing pauses, so history holds one entry per pause
// rather than per keystroke; a change from outside (undo, the helper) reloads the editor.
//
// The label row's own actions (T038; CONTENT.md → Block actions: bio `rewrite` `shorten`
// `duplicate` `remove`) are the two the helper's `write-bio` skill answers — the only
// requests the six edit operations can satisfy become chips at all (contracts/
// helper-protocol.md → "Skills"). `re-trim`'s direct-editor precedent (VideoEditor, T025)
// doesn't apply here: there is no bio-only editor to open, just a request worth handing
// straight to the panel.

const PROSE =
  "min-h-80 max-w-prose font-text text-prose font-normal text-body outline-none " +
  "[&_p+p]:mt-16 [&_a]:text-blue [&_a]:underline";

const TOOL =
  "inline-flex min-h-44 items-center rounded-control px-12 font-label text-mono-label text-meta " +
  "uppercase transition-colors duration-hover ease-default hover:text-ink " +
  "aria-pressed:bg-paper-deep aria-pressed:text-ink focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-blue";

/** Serialised, so two documents with the same words compare equal. */
function key(content: RichText): string {
  return JSON.stringify(content);
}

// What the editor loads: the document's rich text, or — for a bio with no paragraphs at
// all — one empty paragraph, since ProseMirror needs a block to put the caret in.
function seed(content: RichText): TiptapDoc {
  const doc = toTiptap(content);
  return doc.content === undefined ? { type: "doc", content: [{ type: "paragraph" }] } : doc;
}

// The editor's changes, sent after a pause or on blur as one `set_field`. `lastSent` is
// what the document holds as far as this editor knows, so an outside change is told apart
// from the echo of its own. `editable` is F9's own lock: `editor.setEditable` toggles the
// live instance's `contenteditable` rather than tearing it down, so the caret and the
// undo stack Tiptap keeps for itself survive the helper's turn.
function useBioSync(content: RichText, send: (content: RichText) => void, editable: boolean) {
  const lastSent = useRef(key(content));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<RichText | null>(null);
  // The editor's handlers are bound once; the latest `send` is read through the ref.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const flush = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next === null || key(next) === lastSent.current) return;
    lastSent.current = key(next);
    sendRef.current(next);
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: BIO_EXTENSIONS,
    content: seed(content),
    // The role is Tiptap's own default, restated because `useEditor` re-applies these
    // attributes on every render without it.
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "Bio", class: PROSE },
    },
    onUpdate: ({ editor: current }) => {
      pending.current = fromTiptap(current.getJSON());
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DRAFT_PAUSE_MS);
    },
    onBlur: flush,
  });

  useEffect(() => {
    if (editor === null || key(content) === lastSent.current) return;
    lastSent.current = key(content);
    pending.current = null;
    editor.commands.setContent(seed(content), { emitUpdate: false });
  }, [editor, content]);

  // F9: the helper starting or ending a turn toggles the live instance in place. The
  // second argument keeps Tiptap's own `setEditable` from emitting its own `update` —
  // toggling editability is not an edit, and `onUpdate` above would otherwise read it as
  // one and send the document right back to itself.
  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  // Leaving the page mid-pause (the list link, a closed tab) still sends what was typed.
  useEffect(() => flush, []);

  return editor;
}

interface ToolButtonProps {
  label: string;
  pressed: boolean;
  expanded?: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ToolButton({ label, pressed, expanded, disabled, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`${TOOL} disabled:pointer-events-none disabled:opacity-50`}
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// Bold, Italic and Link, pressed when the selection carries the mark; Link opens the
// address field over the current link, if any. F9: every button here is disabled while
// the helper works, same as the editor beneath it.
function Toolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const [linking, setLinking] = useState(false);
  const marks = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const href: unknown = current.getAttributes("link").href;
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        link: current.isActive("link"),
        href: typeof href === "string" ? href : undefined,
      };
    },
  });
  const close = () => {
    setLinking(false);
    editor.commands.focus();
  };
  const bold = () => editor.chain().focus().toggleBold().run();
  const italic = () => editor.chain().focus().toggleItalic().run();
  return (
    <div className="flex flex-col gap-12">
      <div className="flex gap-4">
        <ToolButton label="Bold" pressed={marks.bold} disabled={disabled} onClick={bold} />
        <ToolButton label="Italic" pressed={marks.italic} disabled={disabled} onClick={italic} />
        <ToolButton
          label="Link"
          pressed={marks.link}
          expanded={linking}
          disabled={disabled}
          onClick={() => setLinking((open) => !open)}
        />
      </div>
      {linking ? (
        <LinkField
          current={marks.link ? marks.href : undefined}
          onAdd={(href) => {
            editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
            close();
          }}
          onRemove={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            close();
          }}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

/** CONTENT.md → Helper: the request each chip hands the panel; `write-bio` answers both
 * ("shorten the bio" is the skill table's own quoted trigger, contracts/helper-protocol.md
 * → "Skills"). */
const REWRITE_REQUEST = "Rewrite the bio.";
const SHORTEN_REQUEST = "Shorten the bio.";

/** The bio's editor: kicker, toolbar, prose; every change one `set_field content`. */
export function BioEditor(props: EditorFor<"bio">) {
  const { block, onApply, onAskHelper } = props;
  const working = useWorkingLock();
  const who = sectionStrings(useCatSex()).who;
  const editor = useBioSync(
    block.content,
    (content) =>
      onApply({
        op: "set_field",
        target: { kind: "block", blockId: block.id },
        path: "content",
        value: content,
      }),
    !working,
  );
  const actions = [
    { label: "rewrite", onClick: () => onAskHelper(REWRITE_REQUEST) },
    { label: "shorten", onClick: () => onAskHelper(SHORTEN_REQUEST) },
  ];
  return (
    <BlockShell
      block={block}
      labelId={props.labelId}
      actions={actions}
      onDuplicate={props.onDuplicate}
      onRemove={props.onRemove}
    >
      <div className="flex flex-col gap-12 px-8 py-4">
        <MonoLabel className="text-blue">{who}</MonoLabel>
        {editor === null ? null : <Toolbar editor={editor} disabled={working} />}
        <EditorContent editor={editor} />
      </div>
    </BlockShell>
  );
}
