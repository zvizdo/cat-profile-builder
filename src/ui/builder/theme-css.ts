import type { CSSProperties } from "react";
import type { Theme } from "@/core/profile/schema";
import { resolveTheme } from "@/core/profile/theme";

// Theme → CSS custom properties (ADR-008; FR-072). The document holds a preset and two
// sliders; core resolves them to four hexes; this puts those four on the `--profile-*`
// names a surface reads. The canvas sheet, the rail's swatches and the public page all
// paint from these variables — the only styling ever derived from the document.

/** The preset names as CONTENT.md and the hi-fi show them — the picker's and the phone's collapsed line's one table. */
export const PRESET_LABEL: Record<Theme["preset"], string> = {
  paper: "Paper",
  card: "Card",
  night: "Night",
  sand: "Sand",
};

/** The four custom properties a themed surface carries. */
export type ThemeVariable =
  "--profile-bg-a" | "--profile-bg-b" | "--profile-ink" | "--profile-accent";

/** An inline style holding the four `--profile-*` variables, and nothing else. */
export type ThemeStyle = CSSProperties & Record<ThemeVariable, string>;

/**
 * The inline style for a themed surface: `resolveTheme`'s four hexes on the four
 * `--profile-*` custom properties. Deterministic, like `resolveTheme`; the values are
 * data, which is why they travel inline (constitution IX) — every rule that reads them
 * lives in `globals.css`.
 */
export function themeStyle(theme: Theme): ThemeStyle {
  const resolved = resolveTheme(theme);
  return {
    "--profile-bg-a": resolved.backgroundA,
    "--profile-bg-b": resolved.backgroundB,
    "--profile-ink": resolved.ink,
    "--profile-accent": resolved.accent,
  };
}
