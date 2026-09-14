"use client";
import { FocalPicker } from "./FocalPicker";
import { TrimEditor } from "./TrimEditor";
import type { MediaLibraryState } from "./use-media-library";

// The editor open over the library, if any (T023): the focal point sheet for a photo, the
// trim modal for a clip. Which one, and for which record, is the library's state; the
// edits themselves go through `useMediaLibrary`, so a failure is the same toast either way.

export interface MediaEditorsProps {
  profileId: string;
  /** The cat's display name, drawn over the focal sheet's hero crop (F39). */
  catName: string;
  /** The library's records, which editor is open, and the three edits. */
  library: Pick<
    MediaLibraryState,
    "assets" | "editor" | "closeEditor" | "focal" | "trim" | "untrim"
  >;
}

/** Nothing, or the one editor open over the record it was opened from. */
export function MediaEditors({ profileId, catName, library }: MediaEditorsProps) {
  const { editor, closeEditor } = library;
  const asset = editor === null ? undefined : library.assets.find((a) => a.id === editor.mediaId);
  if (editor === null || asset === undefined) return null;
  if (editor.kind === "focal") {
    return (
      <FocalPicker
        asset={asset}
        catName={catName}
        onSave={(focal) => library.focal(asset.id, focal)}
        onClose={closeEditor}
      />
    );
  }
  return (
    <TrimEditor
      profileId={profileId}
      asset={asset}
      onTrim={(start, end) => library.trim(asset.id, start, end)}
      onClearTrim={() => library.untrim(asset.id)}
      onClose={closeEditor}
    />
  );
}
