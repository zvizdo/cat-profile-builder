import { type Theme } from "./schema";

// Theme maths (data-model.md → Theme; FR-029, FR-030, FR-031). The document stores a preset
// and two slider values; this file turns them into colours and judges their contrast. It
// is pure and deterministic: the same theme always resolves to the same hexes.

/** The four colours a surface paints with, as uppercase `#RRGGBB` strings. */
export type ResolvedTheme = {
  backgroundA: string;
  backgroundB: string;
  ink: string;
  accent: string;
};

/**
 * The curated presets (FR-029), with the hexes from `references/design/TOKENS.json`.
 * `backgroundA` is the section surface and `backgroundB` the ground behind the sections,
 * on every preset: Paper (paper / paperDeep), Card (card / paper), Night (`#141A21` /
 * night — the sections lift off the darker ground, as the hi-fi draws them) and Sand
 * (`#EFE6D8` / `#E3D6C2`); ink and accent are ink / blue, ink / blue, `#E8EEF4` /
 * blueLight, ink / blueDeep. Each passes 4.5:1 for ink on both backgrounds as shipped.
 */
export const PRESETS: Readonly<Record<Theme["preset"], Readonly<ResolvedTheme>>> = {
  paper: { backgroundA: "#F6F4F0", backgroundB: "#E9E6E1", ink: "#231F20", accent: "#0B6FB4" },
  card: { backgroundA: "#FFFFFF", backgroundB: "#F6F4F0", ink: "#231F20", accent: "#0B6FB4" },
  night: { backgroundA: "#141A21", backgroundB: "#0A0E12", ink: "#E8EEF4", accent: "#8FD0FF" },
  sand: { backgroundA: "#EFE6D8", backgroundB: "#E3D6C2", ink: "#231F20", accent: "#0A3D63" },
};

/** The hue `warmth` pulls the backgrounds toward: amber. */
const AMBER_HUE = 40;
/** Largest hue rotation `warmth` applies, in degrees, each side of the preset. */
const MAX_HUE_SHIFT = 12;
/** Largest saturation change `warmth` applies, as a fraction, each side of the preset. */
const MAX_SATURATION_SHIFT = 0.04;
/**
 * The ink/background lightness gap at contrast 0 and 1, as multiples of the preset's. The
 * floor is low on purpose: FR-031 and Waiver 3 want a volunteer to be able to push the text
 * past AA and be warned, not to be stopped by the bounds.
 */
const CONTRAST_RANGE = { min: 0.5, max: 1.15 };
/** The AA threshold for body text (WCAG 2.1, 1.4.3). */
const AA_RATIO = 4.5;

type Rgb = { r: number; g: number; b: number };

/** A colour as hue in degrees (0..360), saturation and lightness as fractions (0..1). */
export type Hsl = { h: number; s: number; l: number };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (c: number): string => c.toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/**
 * `#RRGGBB` (either case) → HSL. A grey has hue 0 and saturation 0. Nothing is rounded, so
 * `hslToHex(hexToHsl(x))` is `x` for every 8-bit colour.
 */
export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  // Which channel is greatest decides the 120° sector; the other two decide the angle in it.
  const sector = max === rf ? (gf - bf) / d : max === gf ? (bf - rf) / d + 2 : (rf - gf) / d + 4;
  return { h: ((sector + 6) % 6) * 60, s, l };
}

/** HSL → uppercase `#RRGGBB`, each channel rounded to the nearest 8-bit value. */
export function hslToHex({ h, s, l }: Hsl): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return rgbToHex({ r: channel(0), g: channel(8), b: channel(4) });
}

/** The signed shortest rotation from `hue` to amber, in (-180, 180]. */
function rotationToAmber(hue: number): number {
  return ((AMBER_HUE - hue + 540) % 360) - 180;
}

/**
 * Applies `warmth` to one background: at 1 the hue turns up to 12° toward amber (stopping
 * on amber rather than passing it) and saturation rises 4 points; at 0 the hue turns 12°
 * away from amber and saturation falls 4 points; 0.5 is the preset. A hue already on
 * amber keeps its hue. A grey has hue 0 and no saturation, so above 0.5 it takes on a
 * faint tint — except pure white, which lightness 1 keeps white. Lightness never changes.
 */
function warmBackground(hex: string, warmth: number): string {
  const hsl = hexToHsl(hex);
  const amount = (warmth - 0.5) * 2;
  const toAmber = rotationToAmber(hsl.h);
  let rotation = Math.sign(toAmber) * amount * MAX_HUE_SHIFT;
  if (amount > 0 && Math.abs(rotation) > Math.abs(toAmber)) rotation = toAmber;
  return hslToHex({
    h: (hsl.h + rotation + 360) % 360,
    s: clamp01(hsl.s + amount * MAX_SATURATION_SHIFT),
    l: hsl.l,
  });
}

/**
 * Applies `contrast` to the ink: its lightness moves so that the gap to the mean lightness
 * of the two preset backgrounds is 0.5× the preset's at 0, exactly the preset's at 0.5 and
 * 1.15× at 1 — linear on each side of 0.5, so the default is the preset byte for byte —
 * clamped to the 0..1 lightness range (Night's ink reaches white). Hue and saturation
 * never change, so dark ink stays that ink, only deeper or softer.
 */
function contrastInk(preset: ResolvedTheme, contrast: number): string {
  const ink = hexToHsl(preset.ink);
  const meanBackground = (hexToHsl(preset.backgroundA).l + hexToHsl(preset.backgroundB).l) / 2;
  const factor =
    contrast < 0.5
      ? CONTRAST_RANGE.min + (1 - CONTRAST_RANGE.min) * contrast * 2
      : 1 + (CONTRAST_RANGE.max - 1) * (contrast - 0.5) * 2;
  const l = clamp01(meanBackground + (ink.l - meanBackground) * factor);
  return hslToHex({ ...ink, l });
}

/**
 * Turns a theme into the four colours a surface paints with, deterministically. At warmth
 * 0.5 and contrast 0.5 the result is the preset's hexes exactly; `warmth` moves only the
 * two backgrounds (hue toward or away from amber, ±12°, and saturation ±4 points) and
 * `contrast` moves only the ink (its lightness gap to the backgrounds, 0.5×–1.15×). The
 * accent is the preset's. Out-of-range slider values are clamped into 0..1 first. Every
 * preset passes 4.5:1 at the defaults, at full contrast and at either end of warmth; the
 * low end of contrast fails on every preset by design (FR-031, Waiver 3) — readiness warns
 * and `restoreToPassing` is the way back.
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  const preset = PRESETS[theme.preset];
  const warmth = clamp01(theme.warmth);
  const contrast = clamp01(theme.contrast);
  return {
    backgroundA: warmBackground(preset.backgroundA, warmth),
    backgroundB: warmBackground(preset.backgroundB, warmth),
    ink: contrastInk(preset, contrast),
    accent: preset.accent,
  };
}

/** WCAG 2.1 relative luminance of an sRGB colour, 0 (black) to 1 (white). */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linear = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * The WCAG 2.1 contrast ratio between two `#RRGGBB` colours (either case), from 1 (the same
 * colour) to 21 (black on white). Order does not matter. Not rounded: ink on paper is
 * 14.84, which `TOKENS.json` quotes as 15.0.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The lower of the resolved ink's contrast ratios against the two backgrounds — the number
 * the publish warning compares with 4.5 (FR-031). Text over photographs sits on the fixed
 * scrim and is not part of this.
 */
export function worstContrast(theme: Theme): number {
  const { ink, backgroundA, backgroundB } = resolveTheme(theme);
  return Math.min(contrastRatio(ink, backgroundA), contrastRatio(ink, backgroundB));
}

/**
 * True when the resolved ink is lighter than both backgrounds — light text on a dark
 * ground, as Night is. The builder's contrast note says "light labels swap in" on it. A
 * theme whose ink sits between its two backgrounds is neither, and reads as false.
 */
export function isLightOnDark({ ink, backgroundA, backgroundB }: ResolvedTheme): boolean {
  const inkLuminance = relativeLuminance(ink);
  return (
    inkLuminance > relativeLuminance(backgroundA) && inkLuminance > relativeLuminance(backgroundB)
  );
}

/** True when the theme's text passes AA (≥ 4.5:1) on both backgrounds. */
export function passesContrast(theme: Theme): boolean {
  return worstContrast(theme) >= AA_RATIO;
}

/**
 * FR-031's "restore a passing combination": the same preset with both sliders back at
 * their defaults, which every preset passes. Returns a new object; the input is untouched.
 */
export function restoreToPassing(theme: Theme): Theme {
  return { ...theme, warmth: 0.5, contrast: 0.5 };
}
