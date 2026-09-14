import type { CarouselCat, CarouselPhoto } from "@/core/carousel/roster";

// The frame's label maths (CONTENT.md → Event carousel → Footer; comp 6a): pure, so the
// component only places words.

/** How many thumbnails the footer shows (comp: three). */
const UP_NEXT = 3;

/** `01 / 20`: the cat's one-based position and the roster's size, two digits at least. */
export function counterLabel(index: number, total: number): string {
  return `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
}

/** The hero photos of the next three cats after `index`, wrapping; fewer when fewer are live. */
export function upNext(roster: readonly CarouselCat[], index: number): CarouselPhoto[] {
  const count = Math.min(UP_NEXT, roster.length - 1);
  const photos: CarouselPhoto[] = [];
  for (let step = 1; step <= count; step++) {
    const hero = roster[(index + step) % roster.length]?.photos[0];
    if (hero !== undefined) photos.push(hero);
  }
  return photos;
}
