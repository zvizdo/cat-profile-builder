"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { Textarea } from "@/ui/shared/Textarea";

// The description on a media tile (FR-011, FR-073): the model's sentence, editable at any
// time, saved on blur and on Enter. Once a volunteer has changed it the note underneath
// says so, because one shared login cannot claim more (DESIGN.md §7). When the describer
// failed, the field opens empty and focused under the one sentence that says what to do.

/** The sentence over an empty field when no description could be written (FR-073). */
export const NEEDS_DESCRIPTION = {
  photo:
    "We couldn't write a description for this one. Add a sentence about what's in the photo — it's needed to publish.",
  video:
    "We couldn't write a description for this one. Add a sentence about what's in the clip — it's needed to publish.",
} as const;

const SOURCE_NOTE = {
  model: "described automatically",
  volunteer: "written by a volunteer",
} as const;

export interface AltTextFieldProps {
  id: string;
  kind: "photo" | "video";
  text: string;
  /** Who wrote `text`; `null` when there is none yet. */
  source: "model" | "volunteer" | null;
  /** True when the describer failed and the volunteer is being asked (FR-073). */
  failed: boolean;
  /** F9: real `disabled` while the helper works — the media library's own description edit. */
  disabled?: boolean;
  /** Called with the trimmed text when it changed and is not empty; answers whether it landed. */
  onSave: (text: string) => Promise<boolean>;
}

// The draft, what has been sent, and the prop it came from. The record may change under
// the field (the describer answered, a trim re-described the clip, a save landed), so the
// draft follows the prop whenever it moves. A blur never resends what Enter just sent;
// Enter itself always sends changed words, so a failed save can be sent again by hand.
function useDraft(text: string, onSave: (text: string) => Promise<boolean>) {
  const [draft, setDraft] = useState(text);
  const [sent, setSent] = useState<string | null>(null);
  const [lastText, setLastText] = useState(text);
  if (text !== lastText) {
    setLastText(text);
    setDraft(text);
    setSent(null);
  }
  const save = async (deliberate: boolean) => {
    const next = draft.trim();
    if (next === "" || next === text || (!deliberate && next === sent)) return;
    setSent(next);
    await onSave(next);
  };
  return { draft, setDraft, save };
}

/**
 * A textarea named `Description`, with the notice above it when the description failed and
 * the mono note of who wrote it beneath. Saves the trimmed text on blur and on Enter when
 * it differs from the stored text and is not empty — a blur right after Enter does not send
 * the same words twice, while Enter always sends; Shift+Enter inserts a line. Takes
 * focus on mount only when `failed`, so the volunteer lands where the work is.
 */
export function AltTextField({
  id,
  kind,
  text,
  source,
  failed,
  disabled = false,
  onSave,
}: AltTextFieldProps) {
  const { draft, setDraft, save } = useDraft(text, onSave);
  const ref = useRef<HTMLTextAreaElement>(null);
  const noticeId = `${id}-notice`;

  useEffect(() => {
    if (failed) ref.current?.focus();
  }, [failed]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void save(true);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {failed ? (
        <p id={noticeId} className="edge-clay py-4 pl-12 text-ui-dense leading-relaxed text-body">
          {NEEDS_DESCRIPTION[kind]}
        </p>
      ) : null}
      <Textarea
        ref={ref}
        id={id}
        name={id}
        label="Description"
        hideLabel
        rows={3}
        value={draft}
        disabled={disabled}
        describedBy={failed ? noticeId : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save(false)}
        onKeyDown={onKeyDown}
      />
      {source === null ? null : (
        <MonoLabel variant="reading" className="text-meta">
          {SOURCE_NOTE[source]}
        </MonoLabel>
      )}
    </div>
  );
}
