"use client";
import Image from "next/image";
import { useState } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { MediaKind } from "@/core/media/schema";
import { Modal } from "@/ui/shared/Modal";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { mediaWord, tileFace, tileName } from "./media-state";
import { Mark } from "./SlotFaces";
import { useSurface } from "./use-surface";

// The pick-from-library question (T025; CONTENT.md → Modals voice): the library's photos —
// or its clips, for a video slot — as a grid of toggle buttons named by their description,
// then `Use photo` (one) or `Add 3 photos` (several). Cancel and Escape leave the slot as
// it was. What the choice does to the page is the caller's operation, not this modal's.

export interface MediaPickerProps {
  assets: readonly AssetView[];
  kind: MediaKind;
  /** Several at once (the gallery's `add photos`), else exactly one. */
  multiple?: boolean;
  /** The title, when the default `Pick a photo` / `Pick a clip` does not fit. */
  title?: string;
  /** Ids not to offer: the photos a gallery already holds. */
  exclude?: readonly string[];
  onCancel: () => void;
  onPick: (mediaIds: string[]) => void;
}

const BODY: Record<MediaKind, string> = {
  photo: "Photos in this cat's library. Choose, then use.",
  video: "Clips in this cat's library. Choose, then use.",
};

const EMPTY: Record<MediaKind, string> = {
  photo: "No photos in the library yet. Add one from the rail.",
  video: "No clips in the library yet. Add one from the rail.",
};

/** When every photo the library holds is already on the page. */
const ALL_PLACED = "Every photo in the library is already in this gallery. Add more from the rail.";

function confirmLabel(kind: MediaKind, multiple: boolean, count: number): string {
  const word = mediaWord(kind);
  if (!multiple) return `Use ${word}`;
  if (count === 0) return `Add ${word}s`;
  return `Add ${count} ${word}${count === 1 ? "" : "s"}`;
}

// One choice: the record's face as the tile shows it — its image with its mark, so an
// enhanced copy is told from its original here too (FR-052) — pressed when chosen.
function Choice({
  asset,
  chosen,
  onToggle,
}: {
  asset: AssetView;
  chosen: boolean;
  onToggle: () => void;
}) {
  const face = tileFace(asset);
  return (
    <li>
      <button
        type="button"
        aria-pressed={chosen}
        aria-label={tileName(asset, face)}
        onClick={onToggle}
        className={`relative block aspect-square w-full min-w-44 overflow-hidden rounded-control transition-[outline-color] duration-hover ease-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${chosen ? "outline-2 -outline-offset-2 outline-blue" : ""}`}
      >
        {face.kind === "placeholder" ? (
          <span className="stripes grid size-full place-items-center p-8 text-meta">
            <MonoLabel className="text-center">{face.label}</MonoLabel>
          </span>
        ) : (
          <>
            <Image
              src={face.src}
              alt=""
              fill
              unoptimized
              className="object-cover"
              style={{ objectPosition: face.position }}
            />
            {face.mark === null ? null : <Mark mark={face.mark} />}
          </>
        )}
      </button>
    </li>
  );
}

/**
 * A modal over the library's records of `kind`. Each is a toggle button named by its
 * description; `Use photo` is disabled until one is chosen, and in `multiple` mode reads
 * `Add n photos`. An empty library says so instead of a grid. Escape is Cancel. On the
 * phone it is a bottom sheet (design 2026-09-13 §5): the same question, slid up from
 * the foot of the window.
 */
export function MediaPicker(props: MediaPickerProps) {
  const { assets, kind, multiple = false, title, exclude = [], onCancel, onPick } = props;
  const [chosen, setChosen] = useState<string[]>([]);
  const surface = useSurface();
  const choices = assets.filter((asset) => asset.kind === kind && !exclude.includes(asset.id));
  const toggle = (id: string) =>
    setChosen((list) =>
      list.includes(id) ? list.filter((other) => other !== id) : multiple ? [...list, id] : [id],
    );
  return (
    <Modal
      open
      title={title ?? `Pick a ${mediaWord(kind)}`}
      body={choices.length === 0 ? (exclude.length === 0 ? EMPTY[kind] : ALL_PLACED) : BODY[kind]}
      safeAction={{ label: "Cancel", onClick: onCancel }}
      dangerAction={{
        label: confirmLabel(kind, multiple, chosen.length),
        disabled: chosen.length === 0,
        onClick: () => onPick(chosen),
      }}
      placement={surface === "phone" ? "bottom" : "center"}
    >
      {choices.length === 0 ? null : (
        <ul className="grid grid-cols-3 gap-8">
          {choices.map((asset) => (
            <Choice
              key={asset.id}
              asset={asset}
              chosen={chosen.includes(asset.id)}
              onToggle={() => toggle(asset.id)}
            />
          ))}
        </ul>
      )}
    </Modal>
  );
}
