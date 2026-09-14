"use client";
import { capitalize, pronouns } from "@/core/profile/pronouns";
import { FIELD_LIMITS } from "@/core/profile/schema";
import { useCatSex } from "../cat-sex";
import { PhotoSlot, slotFace } from "../PhotoSlot";
import { BlockShell } from "./BlockShell";
import { DraftField } from "./DraftField";
import type { EditorFor } from "./editor-props";

// The quote (FR-016): one photo with the foster's line over its scrim and, under it, an
// attribution — shown on the slot as the public page will set them, typed in the two
// fields beneath. The line is `set_field text`, the name `set_field attribution`. F41: the
// attribution field's placeholder names the cat's own foster by pronoun (`Her foster` /
// `His foster` / `Their foster`), read from `useCatSex()`.

// The line as it publishes: display serif in white on the scrim over a photo; over the
// stripes it sits in ink, so an empty slot still reads as the section it will be.
function QuoteOverlay({
  text,
  attribution,
  onPhoto,
}: {
  text: string;
  attribution: string;
  onPhoto: boolean;
}) {
  if (text === "" && attribution === "") return null;
  const ground = onPhoto ? "bg-linear-to-b from-transparent from-40% to-night/80" : "";
  const ink = onPhoto ? "text-card" : "text-ink";
  return (
    <div
      className={`pointer-events-none absolute inset-0 flex flex-col justify-end gap-8 p-20 ${ground}`}
    >
      {text === "" ? null : (
        <p className={`max-w-prose font-display text-fact-value ${ink}`}>{text}</p>
      )}
      {attribution === "" ? null : (
        <p
          className={`font-label text-mono-label uppercase ${onPhoto ? "text-blue-whisper" : "text-meta"}`}
        >
          {attribution}
        </p>
      )}
    </div>
  );
}

/** The quote's editor. */
export function QuoteEditor(props: EditorFor<"quote">) {
  const { block, assets, onApply } = props;
  const fosterPlaceholder = `${capitalize(pronouns(useCatSex()).possessive)} foster`;
  const set = (path: "text" | "attribution", value: string) =>
    onApply({ op: "set_field", target: { kind: "block", blockId: block.id }, path, value });
  return (
    <BlockShell
      block={block}
      labelId={props.labelId}
      onDuplicate={props.onDuplicate}
      onRemove={props.onRemove}
    >
      <div className="flex flex-col gap-16">
        <PhotoSlot
          mediaId={block.mediaId}
          assets={assets}
          kind="photo"
          onPick={(mediaId) => onApply({ op: "replace_image", blockId: block.id, mediaId })}
        >
          <QuoteOverlay
            text={block.text}
            attribution={block.attribution ?? ""}
            onPhoto={slotFace(block.mediaId, assets).kind === "image"}
          />
        </PhotoSlot>
        <div className="grid gap-12 md:grid-cols-[2fr_1fr]">
          <DraftField
            label="Quote"
            value={block.text}
            maxLength={FIELD_LIMITS.quoteText}
            placeholder="One line from the foster"
            onCommit={(value) => set("text", value)}
          />
          <DraftField
            label="Attribution"
            value={block.attribution ?? ""}
            maxLength={FIELD_LIMITS.attribution}
            placeholder={fosterPlaceholder}
            onCommit={(value) => set("attribution", value)}
          />
        </div>
      </div>
    </BlockShell>
  );
}
