import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateTokensCss } from "../../../scripts/lib/tokens-css";

// Spec 002: the fundraiser display's token group (display-layout.md), kept apart from the
// system-wide generator tests so neither file outgrows the lint's line limit.

const tokensPath = new URL("../../../references/design/TOKENS.json", import.meta.url).pathname;
const tokensJson = readFileSync(tokensPath, "utf8");

function readTokens(): unknown {
  return JSON.parse(tokensJson);
}

const css = generateTokensCss(readTokens());

// Every value the fundraiser display's layout contract tabulates (display-layout.md), by the
// name the stylesheet will read it under. `size` entries are unit strings emitted untouched.
const fundraiserSizes: Record<string, string> = {
  safeInsetBlock: "5.9cqh",
  safeInsetInline: "5cqw",
  textFloor: "max(10px, 2.4cqmin)",
  logoHeight: "15cqh",
  labelSize: "2.4cqh",
  headlineSize: "12cqh",
  headlineLineHeight: "0.95",
  headlineMaxWidth: "50cqw",
  amountSize: "27cqh",
  amountLineHeight: "0.8",
  goalSize: "4.4cqh",
  editRowMinHeight: "max(44px, 5cqh)",
  fullscreenButtonMinHeight: "44px",
  headlineHitMin: "44px",
  fieldHitMin: "24px",
  // The Full screen control (T013): its padding and gaps, the width the sentence wraps to,
  // and the focus outline the contract fixes at 2px blue-light, offset 2px.
  fullscreenButtonPadInline: "1.6cqh",
  fullscreenButtonGap: "1cqh",
  fullscreenNoteMaxWidth: "32cqw",
  focusOutlineWidth: "2px",
  focusOutlineOffset: "2px",
  fieldUnderlineThickness: "0.7cqh",
  // Editing in place (T017): the refusal sentence's size in each arrangement, and the stage's own
  // height and width as lengths, for the limits that hold the arrangement a session opened in.
  refusalSize: "2.6cqh",
  refusalSizeStack: "min(3.4cqw, 2cqh)",
  editRowHeight:
    "max(44px, calc(max(var(--fundraiser-refusal-size), var(--fundraiser-text-floor)) * 1.3 * 4))",
  editRowHeightStack:
    "max(44px, calc(max(var(--fundraiser-refusal-size-stack), var(--fundraiser-text-floor)) * 1.3 * 5))",
  stageHeight: "100cqh",
  stageWidth: "100cqw",
  thermometerWidth: "18cqh",
  thermometerBottom: "93cqh",
  thermometerTop: "max(14cqh, calc(var(--fundraiser-safe-inset-block) + 44px + 3.5cqh))",
  thermometerRight: "max(12cqw, 17cqh, calc(22cqh + 2cqw))",
  pawSize: "3.8cqh",
  pawLabelSize: "2.4cqh",
  tagSize: "2.4cqh",
  logoHeightStack: "14cqw",
  logoHeightStackCap: "8cqh",
  logoTopStack: "7cqw",
  headlineSizeStack: "13cqw",
  headlineSizeStackCap: "7cqh",
  amountSizeStack: "28cqw",
  amountSizeStackCap: "14cqh",
  goalSizeStack: "4.6cqw",
  goalSizeStackCap: "2.6cqh",
  editRowMinHeightStack: "44px",
  thermometerWidthStack: "22cqw",
  thermometerFloorStack: "35cqh",
  // The thermometer's drawing (T011): proportions of its own width, in percent, and the
  // small gaps and tag sizes the mockup (night-refine.html) used, per fit step of the tag.
  thermometerTubeRatio: "50%",
  thermometerTubeOutline: "0.45cqh",
  thermometerNeckRatio: "45%",
  thermometerNeckHeight: "22.2%",
  thermometerNeckBottom: "83.3%",
  thermometerBulbLift: "-50%",
  pawGap: "2.1cqh",
  pawLabelGap: "1.2cqh",
  tagGap: "0.3em",
  tagLeaderLength: "0.8em",
  tagLeaderGap: "0.3em",
  tagPadBlock: "0.2em",
  tagPadInline: "0.45em",
  tagSizeLarge: "2.8cqh",
  tagSizeMid: "2.6cqh",
  tagSizeStack: "min(2.8cqh, 6cqw)",
  tagSizeMidStack: "min(2.6cqh, 4.5cqw)",
  tagSizeSmallStack: "min(2.4cqh, 3.9cqw)",
  hairline: "1px",
  // The page and stage (T012): how far the paws reach left of the thermometer, the two text
  // column widths, the gaps, the stack's hint size, and one size per fit step of the headline
  // and the amount raised (`min(<height based>, <width based>)`, so the widest text of a step
  // fits its column at every shape; starting values, tuned at Checkpoint 2).
  thermometerReach: "20cqh",
  leftWidth:
    "calc(100cqw - var(--fundraiser-safe-inset-inline) - var(--fundraiser-thermometer-right) - var(--fundraiser-thermometer-width) - var(--fundraiser-thermometer-reach))",
  stackTextWidth: "calc(100cqw - 2 * var(--fundraiser-safe-inset-inline))",
  gapTight: "1.4cqh",
  gapCopy: "3cqh",
  gapStack: "1.6cqh",
  hintSizeStack: "min(2.4cqh, 3cqw)",
  headlineFit0: "min(var(--fundraiser-headline-size), 6.3cqw)",
  headlineFit1: "min(8cqh, 5.5cqw)",
  headlineFit2: "min(6cqh, 3.7cqw)",
  amountFit0: "min(var(--fundraiser-amount-size), 17.5cqw)",
  amountFit1: "min(24cqh, 13.5cqw)",
  amountFit2: "min(21cqh, 11.5cqw)",
  amountFit3: "min(18.5cqh, 10cqw)",
  amountFit4: "min(16.5cqh, 8.2cqw)",
  headlineStackFit0:
    "min(var(--fundraiser-headline-size-stack), var(--fundraiser-headline-size-stack-cap))",
  headlineStackFit1: "min(9.5cqw, 5.2cqh)",
  headlineStackFit2: "min(6.6cqw, 4cqh)",
  amountStackFit0:
    "min(var(--fundraiser-amount-size-stack), var(--fundraiser-amount-size-stack-cap))",
  amountStackFit1: "min(25cqw, 12.5cqh)",
  amountStackFit2: "min(22cqw, 11cqh)",
  amountStackFit3: "min(19.5cqw, 9.5cqh)",
  amountStackFit4: "min(16cqw, 8cqh)",
};

function kebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

describe("generateTokensCss fundraiser group", () => {
  const fundraiser = (JSON.parse(tokensJson) as { fundraiser: Record<string, unknown> }).fundraiser;

  it("names the night-ground colours as --color-fundraiser- tokens, alphas verbatim", () => {
    expect(css).toContain("--color-fundraiser-glow: rgba(11,111,180,.32);");
    expect(css).toContain("--color-fundraiser-tube-outline: rgba(255,255,255,.6);");
    expect(css).toContain("--color-fundraiser-tube-fill: rgba(255,255,255,.06);");
    expect(css).toContain("--color-fundraiser-body: rgba(255,255,255,.85);");
    expect(css).toContain("--color-fundraiser-paw-unlit: rgba(143,208,255,.5);");
    expect(css).toContain("--color-fundraiser-paw-unlit-label: rgba(143,208,255,.7);");
    expect(css).toContain("--color-fundraiser-refusal: #F0A27C;");
  });

  it("carries the gradients and the two glows, built from existing tokens", () => {
    expect(css).toContain(
      "--fundraiser-gradient-fill: linear-gradient(to top, var(--color-blue), var(--color-blue-light));",
    );
    expect(css).toContain(
      "--fundraiser-gradient-glow: radial-gradient(70% 90% at 30% 50%, var(--color-fundraiser-glow) 0%, rgba(11,111,180,0) 62%);",
    );
    expect(css).toContain("--fundraiser-shadow-highlight: 0 0 1.6cqh rgba(143,208,255,.55);");
    expect(css).toContain("--fundraiser-shadow-paw-lit: 0 0 1.2cqh rgba(143,208,255,.6);");
  });

  it("emits every size of the layout contract as a --fundraiser- property, unit strings untouched", () => {
    expect(Object.keys(fundraiser["size"] as object).sort()).toEqual(
      Object.keys(fundraiserSizes).sort(),
    );
    for (const [key, value] of Object.entries(fundraiserSizes)) {
      expect(css, key).toContain(`  --fundraiser-${kebabCase(key)}: ${value};`);
    }
    expect(css).toContain("--fundraiser-safe-inset-block: 5.9cqh;");
    expect(css).toContain("--fundraiser-thermometer-floor-stack: 35cqh;");
  });

  it("emits the tracking", () => {
    expect(css).toContain("--fundraiser-tracking-label: 0.2em;");
    expect(css).toContain("--fundraiser-tracking-paw-label: 0.12em;");
    expect(css).toContain("--fundraiser-tracking-tag: 0.1em;");
    expect(css).toContain("--fundraiser-tracking-tag-label: 0.04em;");
  });

  it("emits every key of the group exactly once, and nothing the group does not name", () => {
    const groups = ["color", "gradient", "shadow", "size", "tracking"] as const;
    const prefix = {
      color: "--color-fundraiser",
      gradient: "--fundraiser-gradient",
      shadow: "--fundraiser-shadow",
      size: "--fundraiser",
      tracking: "--fundraiser-tracking",
    };
    let expected = 0;
    for (const group of groups) {
      for (const key of Object.keys(fundraiser[group] as object)) {
        expected += 1;
        expect(
          css.match(new RegExp(`^  ${prefix[group]}-${kebabCase(key)}: `, "gm")),
          key,
        ).toHaveLength(1);
      }
    }
    expect(css.match(/^ {2}--(color-)?fundraiser-[a-z0-9-]+: /gm)).toHaveLength(expected);
  });

  it("puts every fundraiser token after the resets", () => {
    expect(css.indexOf("--fundraiser-logo-height:")).toBeGreaterThan(
      css.indexOf("--container-*: initial;"),
    );
    expect(css.indexOf("--color-fundraiser-glow:")).toBeGreaterThan(
      css.indexOf("--color-*: initial;"),
    );
  });

  it("throws, rather than emitting a partial stylesheet, when the group is malformed", () => {
    const base = readTokens() as { fundraiser: Record<string, unknown> };
    const without = (key: string): unknown => {
      const copy = { ...base, fundraiser: { ...base.fundraiser } };
      delete copy.fundraiser[key];
      return copy;
    };
    expect(() => generateTokensCss(without("color"))).toThrow();
    expect(() => generateTokensCss(without("size"))).toThrow();
    const noGroup: Record<string, unknown> = { ...base };
    delete noGroup["fundraiser"];
    expect(() => generateTokensCss(noGroup)).toThrow();
    const numeric = {
      ...base,
      fundraiser: {
        ...base.fundraiser,
        size: { ...(base.fundraiser["size"] as object), logoHeight: 15 },
      },
    };
    expect(() => generateTokensCss(numeric)).toThrow();
  });
});
