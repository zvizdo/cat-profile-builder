"use client";
import type { BlockInput } from "@/core/profile/operations";
import type { ProfileDocument } from "@/core/profile/schema";
import { AddSectionTiles } from "./AddSectionTiles";
import { MediaLibrary } from "./MediaLibrary";
import { ThemePicker, type ThemePickerProps } from "./ThemePicker";
import type { MediaLibraryState } from "./use-media-library";
import { useWorkingLock } from "./working-lock";

// The left rail (hi-fi 3a): `Add section`, `Theme`, and the media library, stacked on the
// card ground with the chrome hairline on its right.

export interface RailProps {
  profileId: string;
  /** The library's state, owned by the shell so the canvas sees the same records. */
  library: MediaLibraryState;
  /** The page as it stands, for the media card's `On the page` line (F39). */
  doc: ProfileDocument;
  onAdd: (block: BlockInput) => void;
  theme: ThemePickerProps["theme"];
  onTheme: ThemePickerProps["onChange"];
  onPreviewTheme: ThemePickerProps["onPreview"];
}

/**
 * The rail column: tiles, the theme picker, the library. Scrolls on its own. F9: a veil
 * over the column while the helper works — every control beneath it is disabled in its
 * own right; this is the one visual cue that ties the column together as one locked
 * surface. A veil rather than the ancestor `opacity` every disabled control uses for
 * itself, because that would also fade the rail's own words below their own contrast
 * floor (see `Canvas.tsx`'s `LOCK_VEIL`, the same idea over `card` instead of
 * `paper-deep`). `z-10` so it also veils the library's sticky heading, which is
 * stacked to pass over the tiles (F39).
 */
export function Rail(props: RailProps) {
  const { profileId, library, doc, onAdd, theme, onTheme, onPreviewTheme } = props;
  const working = useWorkingLock();
  return (
    <div className="relative flex flex-col gap-28 overflow-y-auto border-line-chrome bg-card px-16 py-20 md:w-rail md:shrink-0 md:border-r">
      <AddSectionTiles onAdd={onAdd} />
      <ThemePicker theme={theme} onChange={onTheme} onPreview={onPreviewTheme} />
      <MediaLibrary profileId={profileId} library={library} doc={doc} />
      {working ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 bg-card/60" />
      ) : null}
    </div>
  );
}
