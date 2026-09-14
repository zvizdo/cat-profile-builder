import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

// F48 / F28 review #5: `tokens.css` turns Tailwind's own spacing scale off
// (`--spacing: initial`) and defines only the steps `references/design/TOKENS.json`
// lists, so a class like `py-10` — no `--spacing-10` exists — is not wrong, it is
// nothing: Tailwind emits no rule for it and the browser falls back to the box's
// default padding. `SectionPicker.tsx`'s options sat at padding-block 0 for exactly
// this reason (the design review's finding #5). This guard reads the allowed steps
// out of `tokens.css` itself at run time — never a copy of the list — so a scale
// change here can never leave a stale copy passing classes it should now catch.

/** One dead-spacing hit: the file, the 1-based line, and the class as written. */
export interface Violation {
  file: string;
  line: number;
  className: string;
}

export interface CheckDeadSpacingOptions {
  /** The generated stylesheet to read the live scale from. */
  tokensPath: string;
  /** The directory to walk for `.ts`/`.tsx` source. */
  scanDir: string;
}

export interface CheckDeadSpacingResult {
  exitCode: 0 | 1;
  message: string;
}

// Tailwind utilities keyed to the spacing scale (padding, margin, gap, inset, the
// logical-position utilities, and width/height/size, which alias to spacing steps
// once `--spacing-N` is what defines them). Longer prefixes are listed so a search
// that finds "gap-x-4" is not later mistaken for a bare "gap" — though the regex
// below matches the full prefix either way (the `-(\d+)` suffix forces backtracking
// onto whichever alternative actually fits).
const SPACING_PREFIXES = [
  "gap-x",
  "gap-y",
  "gap",
  "px",
  "py",
  "pt",
  "pb",
  "pl",
  "pr",
  "p",
  "mx",
  "my",
  "mt",
  "mb",
  "ml",
  "mr",
  "m",
  "w",
  "h",
  "size",
];

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Every `--spacing-N` step `tokensCss` defines, as plain numbers (`44px` → `44`).
 * Order in the file does not matter (TOKENS.json's own list is not sorted).
 */
export function allowedSpacingSteps(tokensCss: string): Set<number> {
  const steps = new Set<number>();
  for (const match of tokensCss.matchAll(/--spacing-(\d+):/g)) {
    steps.add(Number(match[1]));
  }
  return steps;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

/**
 * Every spacing-shaped utility in `source` (`py-10`, `sm:gap-3`, …) whose step is not
 * in `allowed`. Skips comment lines, so prose that names a class — `EnhanceCompare.tsx`
 * explains why `w-2` was dropped — is never a false hit. A fraction (`w-1/2`) or an
 * arbitrary value (`size-[26px]`) is not a numeric step and is never flagged.
 */
export function findDeadSpacing(file: string, source: string, allowed: Set<number>): Violation[] {
  const prefixGroup = SPACING_PREFIXES.join("|");
  const pattern = new RegExp(`(?<![\\w-])(?:${prefixGroup})-(\\d+)(?![\\w/])`, "g");
  const violations: Violation[] = [];
  source.split("\n").forEach((line, index) => {
    if (isCommentLine(line)) return;
    for (const match of line.matchAll(pattern)) {
      const step = Number(match[1]);
      if (!allowed.has(step)) {
        violations.push({ file, line: index + 1, className: match[0] });
      }
    }
  });
  return violations;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (SCAN_EXTENSIONS.has(extname(entry.name))) {
      yield full;
    }
  }
}

/**
 * Walks `scanDir` for dead spacing classes against the scale `tokensPath` defines.
 * `exitCode` is `1` with one `file:line` per hit when any exists, so the class of bug
 * the F28 review found (`SectionPicker.tsx`'s `py-10`) cannot come back unseen.
 */
export function runCheckDeadSpacing({
  tokensPath,
  scanDir,
}: CheckDeadSpacingOptions): CheckDeadSpacingResult {
  const allowed = allowedSpacingSteps(readFileSync(tokensPath, "utf8"));
  const violations: Violation[] = [];
  for (const file of walk(scanDir)) {
    const source = readFileSync(file, "utf8");
    violations.push(...findDeadSpacing(relative(process.cwd(), file), source, allowed));
  }
  if (violations.length === 0) {
    return { exitCode: 0, message: `check-dead-spacing: clean (${scanDir}).` };
  }
  const lines = violations.map(
    (v) => `${v.file}:${v.line}: \`${v.className}\` is not on the spacing scale`,
  );
  return {
    exitCode: 1,
    message: [...lines, `check-dead-spacing: ${violations.length} dead spacing class(es).`].join(
      "\n",
    ),
  };
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const result = runCheckDeadSpacing({
    tokensPath: "src/ui/tokens.css",
    scanDir: "src/ui",
  });
  process.stdout.write(`${result.message}\n`);
  process.exitCode = result.exitCode;
}
