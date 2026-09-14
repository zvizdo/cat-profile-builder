import { z } from "zod";

// The slice of references/design/TOKENS.json that becomes CSS. Keys the design handoff
// documents as prose only (contrast tables, breakpoints, media caps) are not tokens and are
// left out on purpose; TOKENS.json is external data, so it is parsed rather than trusted.
const hex = z.string().regex(/^#[0-9A-F]{6}$/);
const px = z.number().int().nonnegative();

const tokensSchema = z.object({
  color: z.record(z.string(), z.object({ value: hex })),
  line: z.record(z.string(), z.string()),
  font: z.object({
    display: z.object({ family: z.string() }),
    text: z.object({ family: z.string() }),
    label: z.object({ family: z.string() }),
  }),
  typeScale: z.record(
    z.string(),
    z.object({
      size: z.union([z.string(), z.number()]),
      lineHeight: z.number().optional(),
      tracking: z.string().optional(),
      weight: z.number().optional(),
      dense: z.number().optional(),
      font: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  space: z.object({ scale: z.array(px) }),
  touchTarget: z.object({ min: px }),
  radius: z.record(z.string(), px),
  shadow: z.object({ lifted: z.string(), screen: z.string() }),
  focusRing: z.string(),
  motion: z.object({
    easing: z.record(z.string(), z.string()),
    duration: z.object({
      hover: px,
      panel: px,
      sectionRise: px,
      beatDefault: px,
    }),
  }),
  layout: z.object({
    profileMaxWidth: px,
    carousel: z.object({
      width: px,
      height: px,
      safeInset: z.object({ block: px, inline: px }),
    }),
    builder: z.object({ rail: px, helper: px, helperTab: px, helperDisc: px, topbar: px }),
    phone: z.object({ peek: px }),
    signInCard: px,
  }),
  carousel: z.object({
    note: z.string(),
    color: z.record(z.string(), z.string()),
    gradient: z.record(z.string(), z.string()),
    shadow: z.record(z.string(), z.string()),
    size: z.record(z.string(), px),
    tracking: z.record(z.string(), z.string()),
    motion: z.record(z.string(), z.union([z.string(), px])),
  }),
});

type Tokens = z.infer<typeof tokensSchema>;
type FontRole = keyof Tokens["font"];

// Generic fallbacks per role, as DESIGN.md's Tailwind sketch lists them. next/font already
// supplies a metric-matched fallback inside its variable; these cover the variable itself
// being absent (a stylesheet rendered outside the root layout).
const fontFallback: Record<FontRole, string> = {
  display: "serif",
  text: "Helvetica, sans-serif",
  label: "monospace",
};

// Every Tailwind namespace this file defines is emptied first so that no stock name
// (`slate`, `gray-500`, `rounded-md`, `shadow-sm`, `text-4xl`, `p-5`) resolves — DESIGN.md:
// replace the default theme, don't extend it. The other shadow families and `--animate-*`
// are emptied too, with nothing put back: DESIGN.md allows no grey shadow and no spinner.
// `--spacing` is the bare-number multiplier; without it only the named steps below are
// spacing values, and they are named by pixel (`p-16` = 16 px).
const resets = [
  "--color-*",
  "--font-*",
  "--text-*",
  "--radius-*",
  "--shadow-*",
  "--drop-shadow-*",
  "--inset-shadow-*",
  "--text-shadow-*",
  "--animate-*",
  "--spacing",
  "--spacing-*",
  "--ease-*",
  "--transition-duration-*",
  "--container-*",
];

// The one container that is a reading measure rather than a layout width: the design
// sheet caps its prose at this (South County Cats Design System §07), and DESIGN.md sets
// no other measure. Everything else in `--container-*` comes from TOKENS.json's `layout`.
const PROSE_MEASURE = "52ch";

// TOKENS.json's `body` step is renamed: Tailwind's `text-*` utility resolves a font size
// before a colour, so a `--text-body` size would hide the `body` colour.
const typeScaleName: Record<string, string> = { body: "prose" };

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function declaration(name: string, value: string): string {
  return `  ${name}: ${value};`;
}

function colorLines(tokens: Tokens): string[] {
  return [
    ...Object.entries(tokens.color).map(([key, { value }]) =>
      declaration(`--color-${kebab(key)}`, value),
    ),
    ...Object.entries(tokens.line).map(([key, value]) =>
      declaration(`--color-line-${kebab(key)}`, value),
    ),
  ];
}

function cssLength(value: string | number): string {
  return typeof value === "number" ? `${value}px` : value;
}

function typeLines(tokens: Tokens): string[] {
  return Object.entries(tokens.typeScale).flatMap(([key, step]) => {
    const name = `--text-${typeScaleName[key] ?? kebab(key)}`;
    const lines = [declaration(name, cssLength(step.size))];
    if (step.lineHeight !== undefined) {
      lines.push(declaration(`${name}--line-height`, String(step.lineHeight)));
    }
    if (step.tracking !== undefined) {
      lines.push(declaration(`${name}--letter-spacing`, step.tracking));
    }
    if (step.weight !== undefined) {
      lines.push(declaration(`${name}--font-weight`, String(step.weight)));
    }
    if (step.dense !== undefined) {
      lines.push(declaration(`${name}-dense`, cssLength(step.dense)));
    }
    return lines;
  });
}

function surfaceLines(tokens: Tokens): string[] {
  return [
    ...Object.entries(tokens.radius).map(([key, value]) =>
      declaration(`--radius-${kebab(key)}`, `${value}px`),
    ),
    declaration("--shadow-lifted", tokens.shadow.lifted),
    declaration("--shadow-screen", tokens.shadow.screen),
    declaration("--shadow-focus-ring", tokens.focusRing),
    // Zero is not in TOKENS.json's scale but is a step all the same: without it `inset-0`,
    // `p-0` and `gap-0` resolve to nothing once the bare-number multiplier is gone.
    declaration("--spacing-0", "0px"),
    ...tokens.space.scale.map((step) => declaration(`--spacing-${step}`, `${step}px`)),
    // The tap-target floor (DESIGN.md §4) joins the pixel-named steps so `size-44` and
    // `min-h-44` exist without anyone writing the number in a component.
    declaration(`--spacing-${tokens.touchTarget.min}`, `${tokens.touchTarget.min}px`),
  ];
}

function motionLines(tokens: Tokens): string[] {
  return [
    ...Object.entries(tokens.motion.easing).map(([key, value]) =>
      declaration(`--ease-${kebab(key)}`, value),
    ),
    ...Object.entries(tokens.motion.duration).map(([key, value]) =>
      declaration(`--transition-duration-${kebab(key)}`, `${value}ms`),
    ),
    // The bare `transition` utility then already moves at the system's hover timing.
    declaration("--default-transition-duration", "var(--transition-duration-hover)"),
    declaration("--default-transition-timing-function", "var(--ease-default)"),
  ];
}

// TOKENS.json's layout widths as `--container-*` tokens, so `w-rail`, `max-w-profile-max`
// and `w-carousel-width` exist and no component carries a pixel width of its own. The topbar
// is the one height among them: Tailwind's height utilities (`h-*`, `min-h-*`) read the
// spacing namespace, not `--container-*`, so it is emitted there too — `min-h-topbar`
// resolves only because `--spacing-topbar` exists.
function layoutLines(tokens: Tokens): string[] {
  const { layout } = tokens;
  return [
    declaration("--container-profile-max", `${layout.profileMaxWidth}px`),
    declaration("--container-sign-in-card", `${layout.signInCard}px`),
    declaration("--container-rail", `${layout.builder.rail}px`),
    declaration("--container-helper", `${layout.builder.helper}px`),
    // The docked helper's collapsed width (hi-fi 7b): the tab it folds to.
    declaration("--container-helper-tab", `${layout.builder.helperTab}px`),
    declaration("--container-topbar", `${layout.builder.topbar}px`),
    declaration("--spacing-topbar", `${layout.builder.topbar}px`),
    // The phone's peek bar (design 2026-09-13 §1): a height, so a spacing step like the
    // topbar's; both of the phone's bars reuse `--spacing-topbar` itself.
    declaration("--spacing-peek", `${layout.phone.peek}px`),
    // The collapsed helper tab's disc (hi-fi 7b's own size — an object, not a spacing
    // step, F28 review #18): a spacing step too, so `size-helper-disc` resolves in place
    // of the one arbitrary pixel literal `src/ui/helper` used to carry.
    declaration("--spacing-helper-disc", `${layout.builder.helperDisc}px`),
    declaration("--container-carousel-width", `${layout.carousel.width}px`),
    declaration("--container-carousel-height", `${layout.carousel.height}px`),
    // The TV-safe inset (DESIGN.md §3) is neither a width nor a spacing step.
    declaration("--carousel-safe-inset-block", `${layout.carousel.safeInset.block}px`),
    declaration("--carousel-safe-inset-inline", `${layout.carousel.safeInset.inline}px`),
    declaration("--container-prose", PROSE_MEASURE),
  ];
}

// The carousel comp's own values (TOKENS.json `carousel`), read only by the carousel's
// stylesheet: its colours join the colour namespace, its shadows the shadow namespace, and
// the rest — gradients, geometry, trackings, motion offsets — are plain `--carousel-*`
// properties, since no utility class ever needs them (ADR-008: the carousel is hand-written
// CSS).
function carouselLines(tokens: Tokens): string[] {
  const { carousel } = tokens;
  const entries = (
    prefix: string,
    group: Record<string, string | number>,
    unit: (value: string | number) => string,
  ): string[] =>
    Object.entries(group).map(([key, value]) =>
      declaration(`${prefix}-${kebab(key)}`, unit(value)),
    );
  return [
    ...entries("--color-carousel", carousel.color, String),
    ...entries("--shadow-carousel", carousel.shadow, String),
    ...entries("--carousel-gradient", carousel.gradient, String),
    ...entries("--carousel", carousel.size, cssLength),
    ...entries("--carousel-tracking", carousel.tracking, String),
    ...entries("--carousel-motion", carousel.motion, cssLength),
  ];
}

function fontLines(tokens: Tokens): string[] {
  const roles: FontRole[] = ["display", "text", "label"];
  return [
    ...roles.map((role) => {
      const variable = `--font-${tokens.font[role].family.toLowerCase().replace(/ /g, "-")}`;
      return declaration(`--font-${role}`, `var(${variable}), ${fontFallback[role]}`);
    }),
    // Preflight's `html` and `code`/`pre`/`kbd` rules read these, so the page and its
    // monospace elements are in the system's families without a rule per element.
    declaration("--default-font-family", "var(--font-text)"),
    declaration("--default-mono-font-family", "var(--font-label)"),
  ];
}

/**
 * Turns the parsed contents of `references/design/TOKENS.json` into the complete text of
 * `src/ui/tokens.css`: two Tailwind v4 `@theme` blocks that replace the default theme with
 * the design system's colours, hairlines, radii, shadows, 4 px spacing scale, easings,
 * durations, layout widths and font families. Pure and deterministic — the same input always yields the
 * same string — and throws a `ZodError` when the input is not the shape TOKENS.json promises.
 *
 * Font tokens live in an `inline` block so utilities carry the `next/font` variable directly
 * to the element that uses them; `static` keeps every token in `:root` for the CSS Modules
 * surfaces that never go through a utility class.
 */
export function generateTokensCss(tokens: unknown): string {
  const parsed = tokensSchema.parse(tokens);
  const lines = [
    "/* Generated from references/design/TOKENS.json by `pnpm gen-tokens`. Do not edit. */",
    "",
    "@theme static {",
    ...resets.map((namespace) => declaration(namespace, "initial")),
    "",
    ...colorLines(parsed),
    "",
    ...typeLines(parsed),
    "",
    ...surfaceLines(parsed),
    "",
    ...motionLines(parsed),
    "",
    ...layoutLines(parsed),
    "",
    ...carouselLines(parsed),
    "}",
    "",
    "@theme static inline {",
    ...fontLines(parsed),
    "}",
    "",
  ];
  return lines.join("\n");
}
