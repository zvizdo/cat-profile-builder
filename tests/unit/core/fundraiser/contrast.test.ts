import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/core/profile/theme";

// The fundraiser display sits on the night ground, so its colours are the translucent whites
// and blues in TOKENS.json's `fundraiser.color` (display-layout.md, "Colour on the night
// ground"). `contrastRatio` takes `#RRGGBB` only, so each rgba colour is first composited
// over the ground it sits on and turned into the hex a screen would show.

type Tokens = {
  color: Record<string, { value: string }>;
  fundraiser: { color: Record<string, string> };
};

const tokens = JSON.parse(
  readFileSync(new URL("../../../../references/design/TOKENS.json", import.meta.url), "utf8"),
) as Tokens;

const NIGHT = tokens.color["night"]?.value ?? "";
const BLUE_LIGHT = tokens.color["blueLight"]?.value ?? "";
const CLAY = tokens.color["clay"]?.value ?? "";

function fundraiserColor(name: string): string {
  const value = tokens.fundraiser.color[name];
  if (value === undefined) throw new Error(`no fundraiser colour named ${name}`);
  return value;
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(rgb: number[]): string {
  return `#${rgb
    .map((c) => Math.round(c).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** Composites a `#RRGGBB` or `rgba(r,g,b,a)` colour over an opaque `#RRGGBB` ground. */
function over(colour: string, ground: string): string {
  const match = /^rgba\((\d+),(\d+),(\d+),(\.?\d*\.?\d+)\)$/.exec(colour);
  if (match === null) return colour.toUpperCase();
  const [r, g, b] = [match[1], match[2], match[3]].map(Number) as [number, number, number];
  const alpha = Number(match[4]);
  const under = channels(ground);
  return toHex([r, g, b].map((c, i) => c * alpha + (under[i] ?? 0) * (1 - alpha)));
}

// The glow's brightest point: its own colour at full strength over night. Text in the left
// group sits no brighter a ground than this.
const GLOW_PEAK = over(fundraiserColor("glow"), NIGHT);

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe("over (the test's compositing helper)", () => {
  it("returns a hex colour unchanged, and white at 50% over night as the mid grey it is", () => {
    expect(over("#F0A27C", NIGHT)).toBe("#F0A27C");
    expect(over("rgba(255,255,255,.5)", "#000000")).toBe("#808080");
  });

  it("reaches the glow's brightest point at the stated alpha", () => {
    // .32 of #0B6FB4 over #0A0E12
    expect(GLOW_PEAK).toBe("#0A2D46");
  });
});

describe("fundraiser colours on the night ground", () => {
  const textColours: Array<[string, string, number]> = [
    ["blue-light label and tag", BLUE_LIGHT, 11.7],
    ["body text, white at 85%", over(fundraiserColor("body"), NIGHT), 14],
    ["refusal tint", fundraiserColor("refusal"), 9.4],
  ];

  it.each(textColours)("%s reads at 4.5:1 or better on night", (_name, colour, quoted) => {
    const ratio = contrastRatio(colour, NIGHT);
    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    // The contract quotes each figure; a drift of more than a tenth means the token moved.
    expect(ratio).toBeGreaterThan(quoted - 0.15);
    expect(ratio).toBeLessThan(quoted + 0.15);
  });

  it("keeps the left group's text at 4.5:1 or better over the glow's brightest point", () => {
    for (const colour of [
      BLUE_LIGHT,
      over(fundraiserColor("body"), GLOW_PEAK),
      fundraiserColor("refusal"),
    ]) {
      expect(contrastRatio(colour, GLOW_PEAK), colour).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("keeps the unlit milestone label at 4.5:1 over the glow's brightest ground, where the phone stack puts it", () => {
    // The label is blue-light at an alpha, so it is composited over the ground behind it. In the
    // centred stack the glow sits behind the labels (about rgb(11,45,69)), which is a brighter
    // ground than night: at 60% this measured 4.08 to 4.18 in a browser. Margin of 0.3 kept.
    const label = over(fundraiserColor("pawUnlitLabel"), GLOW_PEAK);
    expect(contrastRatio(label, GLOW_PEAK)).toBeGreaterThanOrEqual(AA_TEXT + 0.3);
    // The same label on pure night (the side-by-side shapes) keeps reading, and only grows.
    const onNight = over(fundraiserColor("pawUnlitLabel"), NIGHT);
    expect(contrastRatio(onNight, NIGHT)).toBeGreaterThanOrEqual(AA_TEXT + 0.3);
  });

  it("keeps selected text in a field at 4.5:1 or better (the browser default measured 4.37)", () => {
    // Both name existing tokens (blue-light on night); the test reads what they point at.
    expect(fundraiserColor("selection")).toBe("var(--color-blue-light)");
    expect(fundraiserColor("selectionText")).toBe("var(--color-night)");
    const background = BLUE_LIGHT;
    const text = NIGHT;
    expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(AA_TEXT);
    // The selected run sits on the glow or night, so the selection must also stand out from them.
    expect(contrastRatio(background, NIGHT)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(background, GLOW_PEAK)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("keeps the unlit paw glyph at 3:1 or better (the non-text rule), 3.6 at 50%", () => {
    const ratio = contrastRatio(over(fundraiserColor("pawUnlit"), NIGHT), NIGHT);
    expect(ratio).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(ratio).toBeGreaterThan(3.45);
    expect(ratio).toBeLessThan(3.75);
  });

  it("keeps the tube outline above the 3:1 non-text rule", () => {
    expect(
      contrastRatio(over(fundraiserColor("tubeOutline"), NIGHT), NIGHT),
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("does not use --color-clay for any fundraiser colour: on night it measures 3.6, below the text floor", () => {
    expect(contrastRatio(CLAY, NIGHT)).toBeLessThan(AA_TEXT);
    expect(contrastRatio(CLAY, NIGHT)).toBeGreaterThan(3.4);
    for (const value of Object.values(tokens.fundraiser.color)) {
      expect(value.toUpperCase()).not.toBe(CLAY.toUpperCase());
    }
  });
});
