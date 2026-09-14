import { describe, expect, it } from "vitest";
import { CENTRE, focalFromPoint, nudgeFocal, readout } from "@/ui/builder/focal-math";

// The focal point's arithmetic (FR-011's crop position; hi-fi 7a): arrow keys move it by
// 1 %, Shift by 10 %, never past either edge; a click lands it where the pointer is, in
// whole percent; Reset returns the centre. All of it pure, so the picker only draws.

describe("nudgeFocal", () => {
  it("moves 1 % per arrow, on the axis the arrow names", () => {
    expect(nudgeFocal({ x: 50, y: 50 }, "ArrowRight", false)).toEqual({ x: 51, y: 50 });
    expect(nudgeFocal({ x: 50, y: 50 }, "ArrowLeft", false)).toEqual({ x: 49, y: 50 });
    expect(nudgeFocal({ x: 50, y: 50 }, "ArrowDown", false)).toEqual({ x: 50, y: 51 });
    expect(nudgeFocal({ x: 50, y: 50 }, "ArrowUp", false)).toEqual({ x: 50, y: 49 });
  });

  it("moves 10 % with Shift held", () => {
    expect(nudgeFocal({ x: 50, y: 50 }, "ArrowRight", true)).toEqual({ x: 60, y: 50 });
    expect(nudgeFocal({ x: 50, y: 50 }, "ArrowUp", true)).toEqual({ x: 50, y: 40 });
  });

  it("clamps to 0..100 on both axes", () => {
    expect(nudgeFocal({ x: 99, y: 1 }, "ArrowRight", true)).toEqual({ x: 100, y: 1 });
    expect(nudgeFocal({ x: 99, y: 1 }, "ArrowUp", true)).toEqual({ x: 99, y: 0 });
    expect(nudgeFocal({ x: 0, y: 100 }, "ArrowLeft", false)).toEqual({ x: 0, y: 100 });
    expect(nudgeFocal({ x: 0, y: 100 }, "ArrowDown", false)).toEqual({ x: 0, y: 100 });
  });

  it("leaves the point alone for any other key", () => {
    expect(nudgeFocal({ x: 33, y: 66 }, "Enter", false)).toBeNull();
    expect(nudgeFocal({ x: 33, y: 66 }, "a", true)).toBeNull();
  });
});

describe("focalFromPoint", () => {
  it("turns a pointer position inside a box into whole percentages", () => {
    const box = { left: 100, top: 50, width: 400, height: 200 };
    expect(focalFromPoint(box, 300, 100)).toEqual({ x: 50, y: 25 });
    expect(focalFromPoint(box, 101, 199)).toEqual({ x: 0, y: 75 });
    expect(focalFromPoint(box, 213, 117)).toEqual({ x: 28, y: 34 });
  });

  it("clamps a pointer outside the box to its edges", () => {
    const box = { left: 100, top: 50, width: 400, height: 200 };
    expect(focalFromPoint(box, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(focalFromPoint(box, 900, 900)).toEqual({ x: 100, y: 100 });
  });

  it("answers the centre for a box with no size, never NaN", () => {
    expect(focalFromPoint({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual(CENTRE);
  });
});

describe("CENTRE and readout", () => {
  it("is the default focal point", () => {
    expect(CENTRE).toEqual({ x: 50, y: 50 });
  });

  it("reads the point as percentages on each axis", () => {
    expect(readout({ x: 53, y: 41 })).toBe("x 53%, y 41%");
  });
});
