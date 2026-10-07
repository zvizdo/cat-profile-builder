import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { runGenTokens } from "../../../scripts/gen-tokens";
import { generateTokensCss } from "../../../scripts/lib/tokens-css";

const tokensPath = new URL("../../../references/design/TOKENS.json", import.meta.url).pathname;
const tokensJson = readFileSync(tokensPath, "utf8");

function readTokens(): unknown {
  return JSON.parse(tokensJson);
}

const tailwindIndex = createRequire(import.meta.url).resolve("tailwindcss/index.css");

// Compiles the generated theme with the real Tailwind engine and returns the CSS each
// candidate class produces, so "resolves" means what Tailwind means by it.
async function buildUtilities(css: string, candidates: string[]): Promise<string> {
  const compiler = await compile(`@import "tailwindcss";\n${css}`, {
    loadStylesheet: async (id, base) => ({
      path: id,
      base,
      content: readFileSync(tailwindIndex, "utf8"),
    }),
  });
  return compiler.build(candidates);
}

const css = generateTokensCss(readTokens());

describe("generateTokensCss", () => {
  it("is deterministic for the same input", () => {
    expect(generateTokensCss(readTokens())).toBe(css);
  });

  it("names every colour in TOKENS.json exactly once, after its key", () => {
    const values = new Set(tokensJson.match(/#[0-9A-F]{6}/g));
    // 13 system colours, the carousel comp's one own hex (its QR card sentence), and the
    // fundraiser display's refusal tint `#F0A27C` (spec 002, R11): a warm tint that reads on
    // the night ground, where `--color-clay` measures 3.6:1 and fails for text.
    expect(values.size).toBe(15);
    for (const value of values) {
      expect(css.split(value)).toHaveLength(2);
    }
    expect(css).toContain("--color-blue: #0B6FB4;");
    expect(css).toContain("--color-paper-deep: #E9E6E1;");
    expect(css).toContain("--color-night: #0A0E12;");
  });

  it("carries the hairlines, radii, shadows, focus ring, spacing scale and motion", () => {
    expect(css).toContain("--color-line-panel: rgba(35,31,32,.06);");
    expect(css).toContain("--radius-editorial: 0px;");
    expect(css).toContain("--radius-control: 4px;");
    expect(css).toContain("--radius-pill: 99px;");
    expect(css).toContain("--shadow-lifted: 0 18px 46px -14px rgba(11,63,99,.28);");
    expect(css).toContain("--shadow-focus-ring: 0 0 0 3px rgba(11,111,180,.16);");
    // Zero is a step too, or `inset-0`, `p-0` and `gap-0` silently produce nothing.
    expect(css).toContain("--spacing-0: 0px;");
    expect(css).toContain("--spacing-4: 4px;");
    // The 6px status dot (DESIGN.md §4) and the Undo/Redo gap are a step of their own.
    expect(css).toContain("--spacing-6: 6px;");
    expect(css).toContain("--spacing-120: 120px;");
    // The tap-target floor is a spacing step too, so `size-44` / `min-h-44` exist.
    expect(css).toContain("--spacing-44: 44px;");
    expect(css).toContain("--ease-default: cubic-bezier(.16,.84,.28,1);");
    expect(css).toContain("--ease-wipe: cubic-bezier(.72,0,.16,1);");
    expect(css).toContain("--transition-duration-hover: 180ms;");
    expect(css).toContain("--transition-duration-section-rise: 1000ms;");
  });
});

describe("generateTokensCss layout", () => {
  it("names each layout width of TOKENS.json exactly once as a --container- token", () => {
    const layout = [
      "--container-profile-max: 1280px;",
      "--container-sign-in-card: 900px;",
      "--container-rail: 250px;",
      "--container-helper: 360px;",
      "--container-helper-tab: 52px;",
      "--container-topbar: 58px;",
      "--container-carousel-width: 1920px;",
      "--container-carousel-height: 1080px;",
    ];
    for (const token of layout) {
      expect(css.split(token)).toHaveLength(2);
    }
    // The reading measure the design sheet sets on its prose (§07), the one container
    // that is a measure rather than a layout width.
    expect(css.split("--container-prose: 52ch;")).toHaveLength(2);
  });

  it("names the topbar height as a spacing step too, so min-h-topbar resolves", () => {
    expect(css.split("--spacing-topbar: 58px;")).toHaveLength(2);
  });

  it("names the phone's peek bar height (layout.phone.peek) as a spacing step, so h-peek resolves", () => {
    expect(css.split("--spacing-peek: 48px;")).toHaveLength(2);
  });

  it("names the collapsed helper tab's disc (layout.builder.helperDisc) as a spacing step, so size-helper-disc resolves", () => {
    expect(css.split("--spacing-helper-disc: 26px;")).toHaveLength(2);
  });

  it("names the carousel's TV-safe inset from layout.carousel.safeInset", () => {
    expect(css.split("--carousel-safe-inset-block: 64px;")).toHaveLength(2);
    expect(css.split("--carousel-safe-inset-inline: 96px;")).toHaveLength(2);
  });
});

describe("generateTokensCss type and fonts", () => {
  it("names every type-scale step once as a --text- token, with its paired metrics", () => {
    const keys = [
      "heroName",
      "sectionHead",
      "factValue",
      "body",
      "heroLine",
      "ui",
      "monoLabel",
      "monoFloor",
      "carouselFloor",
      "carouselName",
      "carouselLine",
      "carouselFact",
      "carouselCardName",
      "toolHead",
      "lockedHead",
      "indexName",
      "heroCardName",
    ];
    const names = [
      "hero-name",
      "section-head",
      "fact-value",
      "prose",
      "hero-line",
      "ui",
      "mono-label",
      "mono-floor",
      "carousel-floor",
      "carousel-name",
      "carousel-line",
      "carousel-fact",
      "carousel-card-name",
      "tool-head",
      "locked-head",
      "index-name",
      "hero-card-name",
    ];
    expect(Object.keys(JSON.parse(tokensJson).typeScale)).toEqual(keys);
    for (const name of names) {
      expect(css.match(new RegExp(`^  --text-${name}: `, "gm"))).toHaveLength(1);
    }
    expect(css).toContain("--text-hero-name: clamp(74px, 13vw, 196px);");
    expect(css).toContain("--text-hero-name--line-height: 0.82;");
    expect(css).toContain("--text-hero-name--letter-spacing: -0.035em;");
    expect(css).toContain("--text-prose--line-height: 1.65;");
    // F50 (F28 review #3): the display floor never drops below 24px, even at the phone
    // width the clamp's own preferred value would otherwise fall to.
    expect(css).toContain("--text-fact-value: clamp(24px, 2vw, 30px);");
    expect(css).toContain("--text-hero-line: clamp(17px, 1.6vw, 24px);");
    expect(css).toContain("--text-hero-line--line-height: 1.45;");
    expect(css).toContain("--text-ui: 15px;");
    expect(css).toContain("--text-ui--font-weight: 500;");
    expect(css).toContain("--text-ui-dense: 13px;");
    expect(css).toContain("--text-mono-label--letter-spacing: 0.2em;");
    expect(css).toContain("--text-carousel-floor: 24px;");
    expect(css).toContain("--text-carousel-name: 190px;");
    expect(css).toContain("--text-carousel-name--line-height: 0.86;");
    expect(css).toContain("--text-carousel-name--letter-spacing: -0.03em;");
    expect(css).toContain("--text-carousel-line: 46px;");
    expect(css).toContain("--text-carousel-line--line-height: 1.3;");
    expect(css).toContain("--text-carousel-fact: 28px;");
    expect(css).toContain("--text-carousel-card-name: 34px;");
    expect(css).toContain("--text-carousel-card-name--line-height: 1.05;");
    expect(css).toContain("--text-tool-head: 38px;");
    expect(css).toContain("--text-tool-head--line-height: 1.1;");
    expect(css).toContain("--text-tool-head--letter-spacing: -0.01em;");
    // F51 (F28 review #10, comp 3a): the builder hero card's name, fixed at the comp's
    // own 52 / .86 / -.03em — never the public `heroName` clamp.
    expect(css).toContain("--text-hero-card-name: 52px;");
    expect(css).toContain("--text-hero-card-name--line-height: 0.86;");
    expect(css).toContain("--text-hero-card-name--letter-spacing: -0.03em;");
    expect(css).not.toContain("--text-body");
  });

  it("points the font tokens at the next/font variables with a real fallback stack", () => {
    expect(css).toContain("--font-display: var(--font-instrument-serif), serif;");
    expect(css).toContain("--font-text: var(--font-work-sans), Helvetica, sans-serif;");
    expect(css).toContain("--font-label: var(--font-ibm-plex-mono), monospace;");
    expect(css).toContain("--default-font-family: var(--font-text);");
    expect(css).toContain("--default-mono-font-family: var(--font-label);");
  });

  it("rejects a tokens file that does not match the schema", () => {
    expect(() => generateTokensCss({ color: { blue: { value: "blue" } } })).toThrow();
    expect(() => generateTokensCss(null)).toThrow();
  });
});

describe("generateTokensCss carousel group", () => {
  it("names the comp's own colours as --color-carousel- tokens", () => {
    expect(css.split("--color-carousel-sentence: #57534D;")).toHaveLength(2);
    expect(css.split("--color-carousel-divider: rgba(255,255,255,.28);")).toHaveLength(2);
    expect(css.split("--color-carousel-pill-edge: rgba(255,255,255,.45);")).toHaveLength(2);
    expect(css.split("--color-carousel-footer: rgba(255,255,255,.5);")).toHaveLength(2);
  });

  it("carries the scrim, the bloom and the two neutral shadows verbatim", () => {
    expect(css).toContain(
      "--carousel-gradient-scrim: linear-gradient(78deg, rgba(8,12,16,.94) 0%, rgba(8,12,16,.72) 34%, rgba(8,12,16,.12) 66%, rgba(8,12,16,.42) 100%);",
    );
    expect(css).toContain(
      "--carousel-gradient-bloom: radial-gradient(120% 90% at 78% 18%, rgba(11,111,180,.28) 0%, rgba(11,111,180,0) 58%);",
    );
    expect(css).toContain("--shadow-carousel-name: 0 24px 60px rgba(0,0,0,.4);");
    expect(css).toContain("--shadow-carousel-card: 0 18px 46px -14px rgba(0,0,0,.5);");
  });

  it("names the frame's geometry in pixels, the trackings and the motion offsets", () => {
    expect(css).toContain("--carousel-logo: 76px;");
    expect(css).toContain("--carousel-tick-width: 64px;");
    expect(css).toContain("--carousel-thumb-height: 96px;");
    expect(css).toContain("--carousel-qr: 240px;");
    expect(css).toContain("--carousel-tracking-counter: 0.16em;");
    expect(css).toContain("--carousel-tracking-up-next: 0.18em;");
    expect(css).toContain("--carousel-motion-name-tracking-from: 0.015em;");
    expect(css).toContain("--carousel-motion-name-rise: 46px;");
    expect(css).toContain("--carousel-motion-thumb-rise: 16px;");
  });

  it("emits every carousel token after the resets, and nothing named wall", () => {
    expect(css.indexOf("--carousel-logo:")).toBeGreaterThan(css.indexOf("--container-*: initial;"));
    expect(css).not.toContain("wall");
  });
});

describe("generateTokensCss against Tailwind's defaults", () => {
  it("resets every namespace it defines before defining it", () => {
    const resets = [
      "--color-*: initial;",
      "--font-*: initial;",
      "--text-*: initial;",
      "--radius-*: initial;",
      "--shadow-*: initial;",
      "--drop-shadow-*: initial;",
      "--inset-shadow-*: initial;",
      "--text-shadow-*: initial;",
      "--animate-*: initial;",
      "--spacing: initial;",
      "--spacing-*: initial;",
      "--ease-*: initial;",
      "--transition-duration-*: initial;",
      "--container-*: initial;",
    ];
    const firstToken = css.indexOf("--color-blue:");
    for (const reset of resets) {
      const at = css.indexOf(reset);
      expect(at, reset).toBeGreaterThanOrEqual(0);
      expect(at, `${reset} comes before the first token`).toBeLessThan(firstToken);
    }
  });
});

describe("generateTokensCss compiled by Tailwind", () => {
  it("lets no Tailwind default colour, size, shadow, animation, spacing step or container resolve", async () => {
    const stock = [
      "bg-slate-500",
      "text-gray-500",
      "bg-white",
      "text-4xl",
      "rounded-md",
      "shadow-sm",
      "drop-shadow-md",
      "inset-shadow-sm",
      "text-shadow-sm",
      "animate-spin",
      "p-5",
      "max-w-md",
      "max-w-7xl",
    ];
    const ours = [
      "max-w-profile-max",
      "w-rail",
      "max-w-helper",
      "w-helper-tab",
      "max-w-prose",
      "bg-blue",
      "text-section-head",
      "rounded-control",
      "shadow-lifted",
      "p-16",
      "size-44",
      "inset-0",
      "font-display",
      "min-h-topbar",
      "max-w-sign-in-card",
    ];
    const built = await buildUtilities(css, [...stock, ...ours]);
    for (const name of stock) {
      expect(built, name).not.toContain(`.${name}`);
    }
    for (const name of ours) {
      expect(built, name).toContain(`.${name}`);
    }
    expect(built).not.toContain("slate");
    expect(built).not.toContain("gray");
    expect(built).toContain(
      "line-height: var(--tw-leading, var(--text-section-head--line-height));",
    );
    expect(built).toContain(
      "letter-spacing: var(--tw-tracking, var(--text-section-head--letter-spacing));",
    );
    // Height utilities read the spacing namespace: the topbar's step is what they find.
    expect(built).toContain("min-height: var(--spacing-topbar);");
  });
});

describe("runGenTokens", () => {
  function tempOutPath(): string {
    return join(mkdtempSync(join(tmpdir(), "gen-tokens-")), "tokens.css");
  }

  it("writes the generated file, creating its directory, and reports where", () => {
    const outPath = join(mkdtempSync(join(tmpdir(), "gen-tokens-")), "ui", "tokens.css");
    const result = runGenTokens({ tokensPath, outPath, check: false });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain(outPath);
    expect(readFileSync(outPath, "utf8")).toBe(generateTokensCss(readTokens()));
  });

  it("--check passes when the file on disk matches", () => {
    const outPath = tempOutPath();
    runGenTokens({ tokensPath, outPath, check: false });
    const result = runGenTokens({ tokensPath, outPath, check: true });
    expect(result.exitCode).toBe(0);
  });

  it("--check fails with a plain message when the file has drifted", () => {
    const outPath = tempOutPath();
    writeFileSync(outPath, "/* stale */\n");
    const result = runGenTokens({ tokensPath, outPath, check: true });
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("pnpm gen-tokens");
  });

  it("--check fails when a fundraiser token was edited and the file was not regenerated", () => {
    const outPath = tempOutPath();
    runGenTokens({ tokensPath, outPath, check: false });
    const edited = readTokens() as { fundraiser: { size: Record<string, string> } };
    edited.fundraiser.size["thermometerFloorStack"] = "40cqh";
    const editedPath = join(mkdtempSync(join(tmpdir(), "gen-tokens-")), "TOKENS.json");
    writeFileSync(editedPath, JSON.stringify(edited));
    const result = runGenTokens({ tokensPath: editedPath, outPath, check: true });
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("pnpm gen-tokens");
  });

  it("--check fails when the file does not exist yet", () => {
    const result = runGenTokens({ tokensPath, outPath: tempOutPath(), check: true });
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("pnpm gen-tokens");
  });
});
