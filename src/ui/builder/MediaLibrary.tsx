"use client";
import { Fragment, useRef, useState, type ReactNode, type RefObject } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { ProfileDocument } from "@/core/profile/schema";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { displayName } from "./display-name";
import { LibraryQuestions } from "./LibraryQuestions";
import { MediaCard, type TileEditor } from "./MediaCard";
import { MediaEditors } from "./MediaEditors";
import { onPageLine } from "./media-state";
import { MediaTile, STRIPES_WORD } from "./MediaTile";
import { UploadButton, type UploadButtonProps } from "./UploadButton";
import type { TextAction } from "./use-enhance";
import type { MediaLibraryState } from "./use-media-library";
import { useWaysOut } from "./use-media-selection";
import type { PendingUpload } from "./use-upload-queue";

// The media rail (hi-fi 3a, CONTENT.md → Rail `Media · 7 items`): the count, a 3-up grid
// of square tiles ending in the add tile, the media card under the grid for the selected
// tile (F38: the grid is the map, the card is the desk), the two questions — remove this
// file, and we can't read that one — and the editor open over a tile (`MediaEditors`).
// State and every change live in `useMediaLibrary`, which the shell owns so the canvas's
// slots draw from the same records; the rail's toasts are the shell's to draw too
// (`LibraryToasts`), in its one stack. The page itself (`doc`) is read, never written:
// the card says which slots hold a record, and the focal sheet draws the cat's name (F39).

export interface MediaLibraryProps {
  profileId: string;
  /** The library's state and changes, from `useMediaLibrary`. */
  library: MediaLibraryState;
  /** The page as it stands, for the card's `On the page` line and the focal sheet's name (F39). */
  doc: ProfileDocument;
  /** The surface's own text actions on the selected record (`MediaCard`'s `actions`). */
  tileActions?: (asset: AssetView) => TextAction[];
  /** F44: false inside the phone's Media sheet, whose own header carries the count. */
  heading?: boolean;
  /** F44: false when the shell mounts `MediaEditors` itself — the phone keeps the focal
   * and trim editors reachable from the canvas while the sheet is closed. */
  editors?: boolean;
  /** Where the upload control sits: the `+` tile ending the grid (the rail), or a
   * full-width button before it (the phone's Media drawer, design 2026-09-13 §5). */
  upload?: "tile" | "first";
}

/** `Media · 7 items` (CONTENT.md → Rail): the library's heading, and the phone's sheet title. */
export function countLabel(count: number): string {
  return `Media · ${count} ${count === 1 ? "item" : "items"}`;
}

// The count, sticky at the top of the scrolling rail (F39; audit §3.5): while the grid
// or the card is in view it is the first line — a rail anchor without a new control.
// `-my-8` gives its own padding back, so the gap to the grid stays 16px; `-top-20` is
// the rail's own padding, so when it pins it sits flush with the rail's edge rather
// than 20px below it with tiles scrolling through the gap.
function LibraryHeading({ count }: { count: number }) {
  return (
    <h2 className="sticky -top-20 z-10 -my-8 bg-card py-8">
      <MonoLabel className="text-meta">{countLabel(count)}</MonoLabel>
    </h2>
  );
}

// A file on its way in: striped, with the phase word (DESIGN.md §4 Media).
function PendingTile({ upload }: { upload: PendingUpload }) {
  return (
    <li className="stripes grid aspect-square place-items-center rounded-control p-8 text-meta">
      <span className={STRIPES_WORD}>{upload.phase}</span>
    </li>
  );
}

interface LibraryGridProps {
  assets: AssetView[];
  pending: PendingUpload[];
  selected: string | null;
  /** The card's `On the page · …` line for a record (F39). */
  onPage: (mediaId: string) => string;
  onToggle: (mediaId: string) => void;
  onClose: () => void;
  onRemove: (asset: AssetView) => void;
  onDescribe: (mediaId: string, text: string) => Promise<boolean>;
  onEdit: (editor: TileEditor, mediaId: string) => void;
  tileActions: ((asset: AssetView) => TextAction[]) | undefined;
  /** The upload control: the add tile, last in the grid, or a row above it (`uploadFirst`). */
  children: ReactNode;
  uploadFirst: boolean;
}

// The 3-up grid (hi-fi 3a): every record, then the files on their way in, then the add
// tile. The card is one more row, the full width, ordered last so it sits under the
// grid whichever tile is selected — but placed in the document right after that tile,
// so Tab goes tile → card → next tile and `aria-expanded` expands what follows it.
function LibraryGrid(props: LibraryGridProps) {
  const { assets, pending, selected, onToggle, onClose, onRemove, onDescribe, onEdit } = props;
  return (
    <>
      {props.uploadFirst ? props.children : null}
      <ul className="grid grid-cols-3 gap-8">
        {assets.map((asset) => (
          <Fragment key={asset.id}>
            <MediaTile
              asset={asset}
              expanded={selected === asset.id}
              onToggle={() => onToggle(asset.id)}
              onRemove={() => onRemove(asset)}
            />
            {selected === asset.id ? (
              <li className="order-last col-span-3 min-w-0">
                <MediaCard
                  asset={asset}
                  assets={assets}
                  onPage={props.onPage(asset.id)}
                  onClose={onClose}
                  onRemove={() => onRemove(asset)}
                  onDescribe={(text) => onDescribe(asset.id, text)}
                  onEdit={(editor) => onEdit(editor, asset.id)}
                  actions={props.tileActions?.(asset)}
                />
              </li>
            ) : null}
          </Fragment>
        ))}
        {pending.map((upload) => (
          <PendingTile key={upload.key} upload={upload} />
        ))}
        {props.uploadFirst ? null : <li>{props.children}</li>}
      </ul>
    </>
  );
}

// The two answers the questions need, over the refs they hand focus to: a confirmed
// removal returns focus to the add tile; `Choose another` reopens the file picker.
function useAnswers(
  library: MediaLibraryState,
  inputRef: RefObject<HTMLInputElement | null>,
  addRef: RefObject<HTMLButtonElement | null>,
) {
  const [toRemove, setToRemove] = useState<AssetView | null>(null);
  return {
    toRemove,
    ask: setToRemove,
    keep: () => setToRemove(null),
    confirmRemove: (asset: AssetView) => {
      setToRemove(null);
      library.remove(asset.id, () => addRef.current?.focus());
    },
    chooseAnother: () => {
      library.closeUnsupported();
      inputRef.current?.click();
    },
  };
}

interface UploadControlProps extends Pick<UploadButtonProps, "inputRef" | "buttonRef" | "onFiles"> {
  upload: "tile" | "first";
}

/** The upload control in the shape its place asks for: the `+` tile, or the row above the grid. */
function UploadControl({ upload, ...rest }: UploadControlProps) {
  return <UploadButton {...rest} shape={upload === "first" ? "row" : "tile"} />;
}

/**
 * The rail: an `aside` named `Media` with the count as its heading, the grid of square
 * tiles in their states, the add tile, and — for the selected tile — the media card under
 * the grid. Files picked are screened and uploaded one at a time with the progress toast;
 * each finished record joins the grid and any warning is reported. Remove asks first and
 * shows a refusal in the server's words. `Focal point`, `Trim` and `Re-trim` on the card
 * bring up their editor over the rail. A selection has four ways out: the tile again,
 * Escape, the card's `Close`, or a pointer-down elsewhere on the screen.
 */
export function MediaLibrary(props: MediaLibraryProps) {
  const { profileId, library, doc, tileActions, heading = true, editors = true } = props;
  const { upload = "tile" } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const { closeSelected } = useWaysOut(sectionRef, library.expanded, library.close);
  const answers = useAnswers(library, inputRef, addRef);

  return (
    <aside ref={sectionRef} aria-label="Media" className="flex flex-col gap-16">
      {heading ? <LibraryHeading count={library.assets.length} /> : null}
      <LibraryGrid
        uploadFirst={upload === "first"}
        assets={library.assets}
        pending={library.pending}
        selected={library.expanded}
        onPage={(mediaId) => onPageLine(doc, mediaId)}
        onToggle={library.toggle}
        onClose={closeSelected}
        onRemove={answers.ask}
        onDescribe={library.describe}
        onEdit={library.openEditor}
        tileActions={tileActions}
      >
        <UploadControl
          inputRef={inputRef}
          buttonRef={addRef}
          onFiles={library.addFiles}
          upload={upload}
        />
      </LibraryGrid>
      <LibraryQuestions
        toRemove={answers.toRemove}
        unsupported={library.unsupported}
        onKeep={answers.keep}
        onRemove={answers.confirmRemove}
        onClose={library.closeUnsupported}
        onChooseAnother={answers.chooseAnother}
      />
      {editors ? (
        <MediaEditors profileId={profileId} catName={displayName(doc.name)} library={library} />
      ) : null}
    </aside>
  );
}
