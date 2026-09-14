// The focal point's arithmetic (hi-fi 7a; data-model.md → `focal`): whole percentages into
// the photo, 0–100 on each axis. Arrow keys nudge by 1 %, Shift by 10 %, never past an
// edge; a click lands the point under the pointer. Pure, so `FocalPicker` only draws.

/** Where every crop of a photo centres: percent across, percent down. */
export interface Focal {
  x: number;
  y: number;
}

/** The default point, and what `Reset to centre` returns to. */
export const CENTRE: Readonly<Focal> = { x: 50, y: 50 };

/** The box the photo is drawn in, as `getBoundingClientRect` reports it. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** What one arrow key does to an axis. */
const ARROWS: Readonly<Record<string, Readonly<{ axis: keyof Focal; sign: 1 | -1 }>>> = {
  ArrowLeft: { axis: "x", sign: -1 },
  ArrowRight: { axis: "x", sign: 1 },
  ArrowUp: { axis: "y", sign: -1 },
  ArrowDown: { axis: "y", sign: 1 },
};

/** `value` held to 0..100 and rounded to a whole percent. */
function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * `focal` moved by `key`: 1 % per arrow, 10 % with `shift`, clamped to 0..100 on the axis
 * the arrow names. `null` for any key that is not an arrow, so the caller can let it through.
 */
export function nudgeFocal(focal: Focal, key: string, shift: boolean): Focal | null {
  const arrow = ARROWS[key];
  if (arrow === undefined) return null;
  const step = shift ? 10 : 1;
  return { ...focal, [arrow.axis]: clampPercent(focal[arrow.axis] + arrow.sign * step) };
}

/**
 * The point under a pointer at `clientX`, `clientY` over `box`, as whole percentages,
 * clamped to the box's edges. A box with no size (not laid out yet) answers the centre.
 */
export function focalFromPoint(box: Box, clientX: number, clientY: number): Focal {
  if (box.width <= 0 || box.height <= 0) return { ...CENTRE };
  return {
    x: clampPercent(((clientX - box.left) / box.width) * 100),
    y: clampPercent(((clientY - box.top) / box.height) * 100),
  };
}

/** The point read aloud: `x 53%, y 41%`. */
export function readout(focal: Focal): string {
  return `x ${focal.x}%, y ${focal.y}%`;
}
