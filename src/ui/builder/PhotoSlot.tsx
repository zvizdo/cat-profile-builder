"use client";
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { MediaKind } from "@/core/media/schema";
import { useTouch } from "./blocks/use-touch-band";
import { MediaPicker } from "./MediaPicker";
import { mediaWord, tileFace } from "./media-state";
import { Face, Stripes, stripesLabel, type SlotFace } from "./SlotFaces";
import { useWorkingLock } from "./working-lock";

// One media slot of a section (T025; DESIGN.md §4 Media; the spec's missing-media edge
// case). Three faces: striped `drop a photo` while empty; striped `photo missing — pick
// another` when the library no longer holds the id — never a broken image; else the record
// as the library tile shows it, on its focal point (`SlotFaces.tsx` draws them). Picking
// opens `MediaPicker`; what the choice does to the page is the caller's `replace_image`.
// F55 item 2: on touch (`useTouch`, under 1180px) nothing drops, so the empty face reads
// `Add a photo` / `Add a clip` and the whole slot is the button that opens the picker —
// named `Add a photo`, or `Add a photo for scene 2`, the way `Pick a photo` was.

export type { SlotFace } from "./SlotFaces";

/** What a parent can ask of a slot: open its picker (the hero's label-row action). */
export interface PhotoSlotHandle {
  open: () => void;
}

export interface PhotoSlotProps {
  mediaId: string | null;
  assets: readonly AssetView[];
  kind: MediaKind;
  onPick: (mediaId: string) => void;
  /** Names the slot in the pick button: `Pick a photo for scene 2`. */
  slotName?: string;
  aspect?: "square" | "video";
  /**
   * The slot's corner: `control` (4px, every ordinary slot) or `editorial` (0px, the
   * hero's full-bleed frame — F28 review #10, comp 3a). Defaults to `control`.
   */
  radius?: "control" | "editorial";
  /** Whether a filled slot carries its own `replace photo` chip (the hero's is on the label row). */
  replaceOnSlot?: boolean;
  /**
   * One line while empty, not two (F28 review #12): the mono label is the pick button
   * itself. Only the gallery's own pickable cell asks for this.
   */
  mergedPick?: boolean;
  /** Drawn over the face: the hero's scrim and name, the quote's line. */
  children?: ReactNode;
  /** Load the image eagerly: the hero is the canvas's first paint. */
  priority?: boolean;
  /**
   * Where focus goes once a pick has filled the slot and there is no chip to land on
   * (the hero and the video: their replace action sits on the label row).
   */
  onFilledFocus?: () => void;
  ref?: Ref<PhotoSlotHandle>;
}

/** Decides the face from the id and the live list; a lost id is `missing`, never an image. */
export function slotFace(mediaId: string | null, assets: readonly AssetView[]): SlotFace {
  if (mediaId === null) return { kind: "empty" };
  const asset = assets.find((candidate) => candidate.id === mediaId);
  return asset === undefined ? { kind: "missing" } : tileFace(asset);
}

function boxClasses(
  aspect: "square" | "video",
  striped: boolean,
  radius: "control" | "editorial",
): string {
  return [
    "group/slot relative w-full overflow-hidden",
    radius === "editorial" ? "rounded-editorial" : "rounded-control",
    aspect === "square" ? "aspect-square" : "aspect-video",
    striped ? "stripes grid place-content-center gap-8 p-16 text-meta" : "",
  ].join(" ");
}

/** `Pick a photo` (`Add a photo` on touch), or `… for scene 2` when the slot is one of several. */
function pickName(word: string, slotName: string | undefined, touch: boolean): string {
  const verb = touch ? "Add" : "Pick";
  return slotName === undefined ? `${verb} a ${word}` : `${verb} a ${word} for ${slotName}`;
}

// Everything the record itself decides — its face, the word its controls use, its alt
// text, whether it is an enhanced copy, and where focus goes after a pick lands —
// grouped so `PhotoSlot` stays under the lint line ceiling. `adds` (F55): the empty
// face on touch, which reads `Add a photo` and is the button; `missing` keeps its
// sentence and its button at every width.
function useSlotFace(
  { mediaId, assets, kind }: Pick<PhotoSlotProps, "mediaId" | "assets" | "kind">,
  onFilledFocus: (() => void) | undefined,
) {
  const face = slotFace(mediaId, assets);
  const { chip, markPicked } = useFocusAfterPick(face.kind === "image", onFilledFocus);
  const adds = useTouch() && face.kind === "empty";
  const word = mediaWord(kind);
  const asset = assets.find((candidate) => candidate.id === mediaId);
  const alt = asset?.alt?.text ?? "";
  const enhanced = asset?.enhancement !== undefined;
  return { face, chip, markPicked, word, alt, enhanced, adds };
}

// The picker's open state, also reachable from outside through `ref.open()`.
function usePicker(ref: Ref<PhotoSlotHandle> | undefined) {
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
  return { open, setOpen };
}

// After a pick has filled the slot the button it was made from is gone, so focus goes to
// the chip, or where the caller sends it. Nothing moves after a cancelled or refused pick.
function useFocusAfterPick(filled: boolean, onFilledFocus: (() => void) | undefined) {
  const chip = useRef<HTMLButtonElement>(null);
  const picked = useRef(false);
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    if (!filled) return;
    if (chip.current !== null) chip.current.focus();
    else onFilledFocus?.();
  });
  return { chip, markPicked: () => void (picked.current = true) };
}

/**
 * A slot: striped with its word and a `Pick a photo` button while it has nothing to show;
 * the image on its focal point, described by the record's alt text, with a `replace photo`
 * chip otherwise. `ref.open()` opens the picker from
 * outside. After a pick that fills the slot, focus lands on the chip — the pick button it
 * was on is gone — or where `onFilledFocus` sends it; a cancelled or refused pick leaves
 * focus on the opener.
 */
// F9: picking or replacing a photo is a profile edit like any other, so the chips and the
// pick button take the working lock.
export function PhotoSlot(props: PhotoSlotProps) {
  const { assets, kind, onPick, slotName, children, ref, onFilledFocus, mergedPick } = props;
  const { aspect = "video", radius = "control", replaceOnSlot = true, priority = false } = props;
  const { open, setOpen } = usePicker(ref);
  const { face, chip, markPicked, word, alt, enhanced, adds } = useSlotFace(props, onFilledFocus);
  const working = useWorkingLock();
  return (
    <div className={boxClasses(aspect, face.kind !== "image", radius)}>
      {face.kind === "image" ? (
        <Face
          face={face}
          alt={alt}
          priority={priority}
          replace={replaceOnSlot ? `replace ${word}` : null}
          onReplace={() => setOpen(true)}
          enhanced={enhanced}
          disabled={working}
          chipRef={chip}
        >
          {children}
        </Face>
      ) : (
        <Stripes
          label={stripesLabel(face, kind, adds)}
          small={aspect === "square"}
          pickName={pickName(word, slotName, adds)}
          word={word}
          onPick={() => setOpen(true)}
          disabled={working}
          merged={mergedPick}
          fill={adds}
        >
          {children}
        </Stripes>
      )}
      {open ? (
        <SlotPicker
          assets={assets}
          kind={kind}
          onCancel={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            markPicked();
            onPick(id);
          }}
        />
      ) : null}
    </div>
  );
}

interface SlotPickerProps extends Pick<PhotoSlotProps, "assets" | "kind" | "onPick"> {
  onCancel: () => void;
}

// The slot's picker: one choice at a time, and a confirm with nothing chosen is a cancel.
function SlotPicker({ assets, kind, onCancel, onPick }: SlotPickerProps) {
  return (
    <MediaPicker
      assets={assets}
      kind={kind}
      onCancel={onCancel}
      onPick={([id]) => (id === undefined ? onCancel() : onPick(id))}
    />
  );
}
