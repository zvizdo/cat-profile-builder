import { describe, expect, it } from "vitest";
import { type Theme } from "@/core/profile/schema";
import {
  contrastRatio,
  hexToHsl,
  hslToHex,
  isLightOnDark,
  passesContrast,
  PRESETS,
  resolveTheme,
  restoreToPassing,
  worstContrast,
} from "@/core/profile/theme";

const PRESET_NAMES = ["paper", "card", "night", "sand"] as const;
const CORNERS = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
] as const;
const HEX = /^#[0-9A-F]{6}$/;

function theme(preset: Theme["preset"], warmth = 0.5, contrast = 0.5): Theme {
  return { preset, warmth, contrast };
}

describe("PRESETS", () => {
  it("holds the four presets with the TOKENS.json hexes, A the section surface and B the ground", () => {
    expect(PRESETS).toEqual({
      paper: { backgroundA: "#F6F4F0", backgroundB: "#E9E6E1", ink: "#231F20", accent: "#0B6FB4" },
      card: { backgroundA: "#FFFFFF", backgroundB: "#F6F4F0", ink: "#231F20", accent: "#0B6FB4" },
      night: { backgroundA: "#141A21", backgroundB: "#0A0E12", ink: "#E8EEF4", accent: "#8FD0FF" },
      sand: { backgroundA: "#EFE6D8", backgroundB: "#E3D6C2", ink: "#231F20", accent: "#0A3D63" },
    });
  });
});

describe("hexToHsl / hslToHex", () => {
  it.each([
    ["#FF0000", 0],
    ["#80FF00", 90],
    ["#00FF80", 150],
    ["#0000FF", 240],
    ["#8000FF", 270],
    ["#FF0080", 330],
  ])("round-trips %s (hue about %i°) exactly", (hex, hue) => {
    const hsl = hexToHsl(hex);
    expect(hsl.h).toBeCloseTo(hue, 0);
    expect(hslToHex(hsl)).toBe(hex);
  });

  it("round-trips every preset colour exactly", () => {
    for (const preset of Object.values(PRESETS)) {
      for (const hex of Object.values(preset)) {
        expect(hslToHex(hexToHsl(hex))).toBe(hex);
      }
    }
  });

  it("gives a grey hue 0 and saturation 0", () => {
    expect(hexToHsl("#808080")).toEqual({ h: 0, s: 0, l: 128 / 255 });
    expect(hexToHsl("#ffffff").l).toBe(1);
  });
});

describe("contrastRatio", () => {
  it("computes the WCAG 2.1 ratio for ink on paper (14.84:1; TOKENS.json rounds it to 15.0)", () => {
    expect(contrastRatio("#231F20", "#F6F4F0")).toBeCloseTo(14.84, 2);
    expect(Math.abs(contrastRatio("#231F20", "#F6F4F0") - 15.0)).toBeLessThan(0.2);
  });

  it("computes the ratio for meta on paper (4.88:1; TOKENS.json says 4.9)", () => {
    expect(contrastRatio("#6F6A63", "#F6F4F0")).toBeCloseTo(4.88, 2);
    expect(Math.abs(contrastRatio("#6F6A63", "#F6F4F0") - 4.9)).toBeLessThan(0.05);
  });

  it("is symmetric and 21:1 for black on white, 1:1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#0B6FB4", "#0B6FB4")).toBe(1);
  });

  it("accepts lowercase hex", () => {
    expect(contrastRatio("#231f20", "#f6f4f0")).toBeCloseTo(14.84, 2);
  });
});

describe("resolveTheme", () => {
  it.each(PRESET_NAMES)("returns exactly the %s preset at warmth 0.5 / contrast 0.5", (name) => {
    expect(resolveTheme(theme(name))).toEqual(PRESETS[name]);
  });

  it("returns only the four hex fields, uppercase", () => {
    const resolved = resolveTheme(theme("sand", 0.9, 0.2));
    expect(Object.keys(resolved).sort()).toEqual(["accent", "backgroundA", "backgroundB", "ink"]);
    for (const value of Object.values(resolved)) {
      expect(value).toMatch(HEX);
    }
  });

  it("is deterministic", () => {
    expect(resolveTheme(theme("night", 0.3, 0.8))).toEqual(resolveTheme(theme("night", 0.3, 0.8)));
  });

  it("clamps warmth and contrast into 0..1", () => {
    expect(resolveTheme(theme("paper", -3, 9))).toEqual(resolveTheme(theme("paper", 0, 1)));
    expect(resolveTheme(theme("night", 1.5, -0.5))).toEqual(resolveTheme(theme("night", 1, 0)));
  });

  it("leaves the accent untouched at every corner", () => {
    for (const name of PRESET_NAMES) {
      for (const [warmth, contrast] of CORNERS) {
        expect(resolveTheme(theme(name, warmth, contrast)).accent).toBe(PRESETS[name].accent);
      }
    }
  });

  it("warmth moves the backgrounds, not the ink; contrast moves the ink, not the backgrounds", () => {
    const warm = resolveTheme(theme("sand", 1, 0.5));
    expect(warm.ink).toBe(PRESETS.sand.ink);
    expect(warm.backgroundA).not.toBe(PRESETS.sand.backgroundA);
    expect(warm.backgroundB).not.toBe(PRESETS.sand.backgroundB);
    const sharp = resolveTheme(theme("sand", 0.5, 1));
    expect(sharp.ink).not.toBe(PRESETS.sand.ink);
    expect(sharp.backgroundA).toBe(PRESETS.sand.backgroundA);
    expect(sharp.backgroundB).toBe(PRESETS.sand.backgroundB);
  });

  it("higher contrast widens the ink/background gap and lower contrast narrows it", () => {
    for (const name of PRESET_NAMES) {
      const base = worstContrast(theme(name));
      expect(worstContrast(theme(name, 0.5, 1))).toBeGreaterThan(base);
      expect(worstContrast(theme(name, 0.5, 0))).toBeLessThan(base);
    }
  });
});

describe("resolveTheme slider behaviour", () => {
  it("warmth 1 pulls a background hue toward 40° without passing it", () => {
    // Paper's deep background sits at 37.5°; +12° would overshoot, so it lands on amber.
    expect(resolveTheme(theme("paper", 1)).backgroundB).toBe("#EAE7E0");
    // Night's backgrounds are blue (about 210°) and drift a full 12° toward amber.
    expect(resolveTheme(theme("night", 1)).backgroundB).toBe("#091013");
    expect(resolveTheme(theme("night", 0)).backgroundB).toBe("#0B0D11");
  });

  it("leaves a hue already at 40° in place while still shifting saturation", () => {
    // Paper's page ground is exactly 40°: warmth 0 cannot move it away, only desaturate.
    expect(resolveTheme(theme("paper", 0)).backgroundA).toBe("#F6F5F0");
    expect(resolveTheme(theme("paper", 1)).backgroundA).toBe("#F6F4F0");
  });

  it("handles a grey (zero saturation) background without a hue", () => {
    expect(resolveTheme(theme("card", 0)).backgroundA).toBe("#FFFFFF");
    expect(resolveTheme(theme("card", 1)).backgroundA).toBe("#FFFFFF");
  });

  it("clamps the ink's lightness at pure white on Night at full contrast", () => {
    expect(resolveTheme(theme("night", 0.5, 1)).ink).toBe("#FFFFFF");
  });

  it("halves the ink's lightness gap at contrast 0", () => {
    expect(resolveTheme(theme("paper", 0.5, 0)).ink).toBe("#8E7F83");
    expect(resolveTheme(theme("night", 0.5, 0)).ink).toBe("#5581AE");
  });
});

describe("worstContrast", () => {
  it("is the lower of the ink's ratios against the two backgrounds", () => {
    const t = theme("paper");
    const resolved = resolveTheme(t);
    const a = contrastRatio(resolved.ink, resolved.backgroundA);
    const b = contrastRatio(resolved.ink, resolved.backgroundB);
    expect(worstContrast(t)).toBe(Math.min(a, b));
    expect(b).toBeLessThan(a);
  });

  it.each(PRESET_NAMES)("%s passes 4.5:1 at the defaults", (name) => {
    expect(worstContrast(theme(name))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PRESET_NAMES)("%s passes 4.5:1 at full contrast and at either end of warmth", (name) => {
    expect(worstContrast(theme(name, 0.5, 1))).toBeGreaterThanOrEqual(4.5);
    expect(worstContrast(theme(name, 0, 0.5))).toBeGreaterThanOrEqual(4.5);
    expect(worstContrast(theme(name, 1, 0.5))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PRESET_NAMES)("%s fails 4.5:1 at contrast 0, by design (FR-031, Waiver 3)", (name) => {
    expect(worstContrast(theme(name, 0.5, 0))).toBeLessThan(4.5);
    expect(worstContrast(theme(name, 0, 0))).toBeLessThan(4.5);
    expect(worstContrast(theme(name, 1, 0))).toBeLessThan(4.5);
  });
});

describe("passesContrast", () => {
  it("is true for every preset at the defaults and false for every preset at contrast 0", () => {
    for (const name of PRESET_NAMES) {
      expect(passesContrast(theme(name))).toBe(true);
      expect(passesContrast(theme(name, 0.5, 0))).toBe(false);
    }
  });
});

describe("isLightOnDark", () => {
  it("is true only for a resolved theme whose ink is lighter than both backgrounds", () => {
    expect(isLightOnDark(resolveTheme(theme("night")))).toBe(true);
    for (const name of ["paper", "card", "sand"] as const) {
      expect(isLightOnDark(resolveTheme(theme(name)))).toBe(false);
    }
  });

  it("holds at every corner of the sliders: Night stays light on dark, the rest dark on light", () => {
    for (const name of PRESET_NAMES) {
      for (const [warmth, contrast] of CORNERS) {
        expect(isLightOnDark(resolveTheme(theme(name, warmth, contrast)))).toBe(name === "night");
      }
    }
  });

  it("is false when the ink is lighter than one background but not the other", () => {
    expect(
      isLightOnDark({
        backgroundA: "#000000",
        backgroundB: "#FFFFFF",
        ink: "#808080",
        accent: "#0B6FB4",
      }),
    ).toBe(false);
  });
});

describe("restoreToPassing", () => {
  it.each(PRESET_NAMES)("keeps the %s preset, resets both sliders and passes", (name) => {
    const restored = restoreToPassing(theme(name, 0.1, 0.9));
    expect(restored).toEqual({ preset: name, warmth: 0.5, contrast: 0.5 });
    expect(worstContrast(restored)).toBeGreaterThanOrEqual(4.5);
  });

  it("returns a new object", () => {
    const t = theme("card", 0, 0);
    const restored = restoreToPassing(t);
    expect(restored).not.toBe(t);
    expect(t.warmth).toBe(0);
  });
});
