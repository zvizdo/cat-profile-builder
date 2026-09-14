// The element ids a gallery photo's Move buttons carry, stable across reorders, so the
// editor can hand focus back to the button that was pressed once the list has moved
// (`GalleryEditor`'s `refocus`). One place for both the desktop row (`GalleryCell`) and
// the touch row (`GalleryCellTouch`, F55).

/** The element id of a photo's Move left / Move right button. */
export function moveId(blockId: string, mediaId: string, direction: "left" | "right"): string {
  return `${blockId}-${mediaId}-${direction}`;
}
