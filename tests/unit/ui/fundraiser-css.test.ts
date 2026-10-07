import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Two rules of the fundraiser stylesheet that no browser test would notice breaking:
// `--color-clay` is 3.6:1 on the night ground and fails the 4.5:1 text rule
// (display-layout.md → Colour on the night ground), and every size comes from a token, so
// tuning at the five-shape check is one edit in TOKENS.json and never a hunt through CSS.

const cssPath = new URL("../../../src/ui/fundraiser/fundraiser.module.css", import.meta.url);
const source = readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

interface Declaration {
  property: string;
  value: string;
}

/** Every `property: value` pair in the sheet, whichever rule or at-rule it sits in. */
function declarations(): Declaration[] {
  return [...source.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map((match) => ({
    property: match[1] ?? "",
    value: (match[2] ?? "").trim(),
  }));
}

const TEXT_COLOUR_PROPERTIES = new Set([
  "color",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
  "text-decoration-color",
  "caret-color",
  "text-emphasis-color",
]);

describe("fundraiser.module.css", () => {
  it("has declarations to check, so the scan itself cannot pass by finding nothing", () => {
    expect(declarations().length).toBeGreaterThan(100);
    expect(declarations().some((d) => d.property === "color")).toBe(true);
  });

  it("never paints text with --color-clay, which fails 4.5:1 on the night ground", () => {
    const offenders = declarations().filter(
      (d) => TEXT_COLOUR_PROPERTIES.has(d.property) && d.value.includes("--color-clay"),
    );
    expect(offenders).toEqual([]);
  });

  it("names no literal length or time: every geometry number is a token", () => {
    // 0, unitless numbers and percentages are the arithmetic the contract spells out
    // (full box, half, centring); any other number with a unit has to be a token.
    const literal =
      /(?<![\w.-])-?\d*\.?\d+(px|cqh|cqw|cqmin|cqmax|cqi|cqb|rem|em|vh|vw|svh|dvh|ms|s)\b/;
    const offenders = declarations()
      .filter((d) => literal.test(d.value.replace(/var\(--[\w-]+\)/g, "")))
      .map((d) => `${d.property}: ${d.value}`);
    expect(offenders).toEqual([]);
  });

  it.each([
    ".fullscreenButton",
    ".thermometerButton",
    ".headlineButton",
    ".fieldControl",
    ".editRow .doneButton",
  ])(
    "draws a visible blue-light focus ring on %s (the shadow ring is too faint on night)",
    (selector) => {
      const escaped = selector.replace(/[.]/g, "\\.");
      const rule = new RegExp(`${escaped}:focus-visible\\s*\\{([^}]*)\\}`).exec(source);
      expect(rule, `no :focus-visible rule for ${selector}`).not.toBeNull();
      expect(rule?.[1]).toMatch(/outline:[^;]*var\(--color-blue-light\)/);
      expect(rule?.[1]).not.toMatch(/outline:\s*none/);
    },
  );

  it("paints the refusal sentence in the refusal tint", () => {
    const rule = /\.refusal\s*\{([^}]*)\}/.exec(source);
    expect(rule?.[1]).toContain("color: var(--color-fundraiser-refusal)");
  });

  it("gives the edit row a fixed height in both arrangements, so a refusal never moves the figures", () => {
    const side = /\.editRow\s*\{([^}]*)\}/.exec(source)?.[1] ?? "";
    expect(side).toContain("height: var(--fundraiser-edit-row-height);");
    const stack =
      /@container \(aspect-ratio < [\d.]+\) \{[\s\S]*?\.editRow\s*\{([^}]*)\}/.exec(source)?.[1] ??
      "";
    expect(stack).toContain("height: var(--fundraiser-edit-row-height-stack);");
    // A minimum-only row grew with its text: `height` must be declared on its own, not as min-height.
    expect(side.replace(/min-height[^;]*;/g, "")).toMatch(/(^|\s)height:/);
    expect(stack.replace(/min-height[^;]*;/g, "")).toMatch(/(^|\s)height:/);
  });

  it("selects text in a field with the tokenized selection colours (T026, F7)", () => {
    const rule = /\.fieldControl::selection\s*\{([^}]*)\}/.exec(source);
    expect(rule, "no ::selection rule for the field").not.toBeNull();
    expect(rule?.[1]).toContain("background: var(--color-fundraiser-selection)");
    expect(rule?.[1]).toContain("color: var(--color-fundraiser-selection-text)");
  });

  it("gives a one-line field a pointer hit area of the tokenized minimum, drawn without taking room (T026, F6)", () => {
    const rule = /\.field:not\(\.fieldWrap\)::after\s*\{([^}]*)\}/.exec(source);
    expect(rule, "no ::after hit area for the one-line field").not.toBeNull();
    expect(rule?.[1]).toContain("position: absolute");
    expect(rule?.[1]).toContain("min-height: var(--fundraiser-field-hit-min)");
  });
});
