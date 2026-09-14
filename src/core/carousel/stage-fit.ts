// The stage's device-pixel-snapped fit (F64 in specs/001-cat-profile-builder/tasks.md,
// which carries the root-cause note). The comp's 1920×1080 frame is scaled to fit
// whatever screen shows it; the CSS-only fit (`scale: min(100vw/1920, 100svh/1080)`) has
// no reason to land on a whole device pixel, and on a phone it almost never does. The
// frame's `overflow: hidden` then clips the two media layers — animating `transform` on
// the compositor thread — along that fractional edge, and the browser re-samples the
// clipped edge every frame: a hairline that flickers in and out.
//
// The fix is to choose the largest scale that keeps the frame's width, height, and
// centring offset all whole device pixels. 1920 and 1080 are both exact multiples of 120
// (16 × 120 and 9 × 120), so restricting `scale · dpr` to multiples of `1/120` keeps
// `1920 · scale · dpr` and `1080 · scale · dpr` whole for every `dpr` — not just the ones
// that happen to be integers.

/** The comp's frame, in its own pixels (ADR-008/ADR-009). */
const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;

/**
 * `scale · dpr` is restricted to multiples of this step. Both frame dimensions are exact
 * multiples of it (1920 = 16 × 120, 1080 = 9 × 120), which is what keeps the frame's
 * device-pixel size whole for every choice of `n`.
 */
const STEP_DENOMINATOR = 120;
const WIDTH_STEPS = FRAME_WIDTH / STEP_DENOMINATOR; // 16
const HEIGHT_STEPS = FRAME_HEIGHT / STEP_DENOMINATOR; // 9

/** The smallest `n` ever returned, so a box far smaller than the frame still gets a fit. */
const MIN_STEPS = 1;

export interface StageFitInput {
  /** The `.page` box's width, in CSS pixels (its measured `getBoundingClientRect().width`). */
  width: number;
  /** The `.page` box's height, in CSS pixels. */
  height: number;
  /** `window.devicePixelRatio`. */
  dpr: number;
}

export interface StageFit {
  /** The stage's CSS `scale`, applied with `transform-origin: 0 0`. */
  scale: number;
  /** The stage's `left` offset from `.page`'s edge, in CSS pixels. */
  left: number;
  /** The stage's `top` offset from `.page`'s edge, in CSS pixels. */
  top: number;
}

/**
 * The largest device-pixel-exact fit of the 1920×1080 frame inside a `width` × `height`
 * box at the given device pixel ratio: `scale`, and the `left`/`top` offset that centres
 * it. Every one of `scale`, `left`, and `top`, multiplied by `dpr`, lands on a whole
 * device pixel — the necessary and sufficient condition the investigation isolated for a
 * clean, non-flickering clip edge.
 */
export function fitStage({ width, height, dpr }: StageFitInput): StageFit {
  // floor(min(W·dpr/16, H·dpr/9)) directly, not floor(min(W·dpr/1920, H·dpr/1080) · 120):
  // the two-step form rounds twice, and when the exact value is an integer the product can
  // land a hair under it (122.999999999999998) and drop a whole step. Dividing straight by
  // WIDTH_STEPS/HEIGHT_STEPS is exact whenever the result is an integer, so it never does.
  const widthSteps = (width * dpr) / WIDTH_STEPS;
  const heightSteps = (height * dpr) / HEIGHT_STEPS;
  const steps = Math.max(MIN_STEPS, Math.floor(Math.min(widthSteps, heightSteps)));
  const scale = steps / (STEP_DENOMINATOR * dpr);
  const frameWidthDevicePx = WIDTH_STEPS * steps;
  const frameHeightDevicePx = HEIGHT_STEPS * steps;
  const left = Math.floor((width * dpr - frameWidthDevicePx) / 2) / dpr;
  const top = Math.floor((height * dpr - frameHeightDevicePx) / 2) / dpr;
  return { scale, left, top };
}
