import { describe, expect, it } from "vitest";
import { PRESETS, resolveTheme } from "@/core/profile/theme";
import { themeStyle } from "@/ui/builder/theme-css";

// Theme → CSS custom properties (ADR-008): the four hexes `resolveTheme` gives, on the
// four `--profile-*` names, and nothing else — the sheet, the swatches and the public page
// paint from these; no component computes a colour.

describe("themeStyle", () => {
  it("maps the resolved theme onto the four --profile-* custom properties", () => {
    expect(themeStyle({ preset: "night", warmth: 0.5, contrast: 0.5 })).toEqual({
      "--profile-bg-a": "#141A21",
      "--profile-bg-b": "#0A0E12",
      "--profile-ink": "#E8EEF4",
      "--profile-accent": "#8FD0FF",
    });
  });

  it("is resolveTheme's output for every preset and slider setting, key for key", () => {
    for (const preset of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      const theme = { preset, warmth: 0.9, contrast: 0.2 };
      const resolved = resolveTheme(theme);
      expect(themeStyle(theme)).toEqual({
        "--profile-bg-a": resolved.backgroundA,
        "--profile-bg-b": resolved.backgroundB,
        "--profile-ink": resolved.ink,
        "--profile-accent": resolved.accent,
      });
    }
  });
});
