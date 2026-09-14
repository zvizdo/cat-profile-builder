import { describe, expect, it } from "vitest";
import type { CarouselCat } from "@/core/carousel/roster";
import { counterLabel, upNext } from "@/ui/carousel/labels";

// The carousel's two bits of label maths (CONTENT.md → Event carousel → Footer): the
// two-digit counter, and which cats' hero photos are up next.

const photo = (src: string) => ({ src, alt: "a cat", focal: { x: 50, y: 50 } });
const cat = (name: string, photos: number): CarouselCat => ({
  url: `http://x/cats/${name}`,
  name,
  line: "",
  photos: Array.from({ length: photos }, (_, i) => photo(`/${name}-${i}.jpg`)),
});

describe("counterLabel", () => {
  it("pads both sides to two digits, like the comp", () => {
    expect(counterLabel(0, 3)).toBe("01 / 03");
    expect(counterLabel(19, 20)).toBe("20 / 20");
    expect(counterLabel(0, 100)).toBe("01 / 100");
  });
});

describe("upNext", () => {
  const roster = [cat("A", 1), cat("B", 1), cat("C", 1), cat("D", 1), cat("E", 1)];

  it("is the next three cats' hero photos, wrapping past the end", () => {
    expect(upNext(roster, 3).map((p) => p.src)).toEqual(["/E-0.jpg", "/A-0.jpg", "/B-0.jpg"]);
  });

  it("is as many as exist when fewer than four cats are live, never the current cat", () => {
    expect(upNext(roster.slice(0, 2), 0).map((p) => p.src)).toEqual(["/B-0.jpg"]);
    expect(upNext(roster.slice(0, 1), 0)).toEqual([]);
  });
});
