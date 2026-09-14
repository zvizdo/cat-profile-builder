import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  allowedSpacingSteps,
  findDeadSpacing,
  runCheckDeadSpacing,
} from "../../../scripts/check-dead-spacing";

// F48: the guard against dead Tailwind spacing utilities — a class like `py-10` where no
// `--spacing-10` exists in tokens.css silently resolves to nothing (F28 review #5). The
// allowed steps come from tokens.css itself, never a copy, so a scale change can never
// leave this guard stale.

const TOKENS_CSS = `
  @theme static {
    --spacing-0: 0px;
    --spacing-4: 4px;
    --spacing-8: 8px;
    --spacing-12: 12px;
    --spacing-44: 44px;
  }
`;

describe("allowedSpacingSteps", () => {
  it("reads every --spacing-N step out of tokens.css, regardless of order", () => {
    expect(allowedSpacingSteps(TOKENS_CSS)).toEqual(new Set([0, 4, 8, 12, 44]));
  });
});

describe("findDeadSpacing", () => {
  const allowed = allowedSpacingSteps(TOKENS_CSS);

  it("flags a spacing utility whose step is not on the scale", () => {
    const source = 'export const OPTION = "flex px-12 py-10 gap-8";\n';
    expect(findDeadSpacing("SectionPicker.tsx", source, allowed)).toEqual([
      { file: "SectionPicker.tsx", line: 1, className: "py-10" },
    ]);
  });

  it("passes a file that only uses steps on the scale", () => {
    const source = 'export const OPTION = "flex px-12 py-8 gap-4";\n';
    expect(findDeadSpacing("SectionPicker.tsx", source, allowed)).toEqual([]);
  });

  it("does not flag a class name mentioned inside a comment", () => {
    const source =
      "// the spacing scale has no 2px step, and `w-2` resolved to nothing, so only the\n" +
      "// handle showed (F38).\n";
    expect(findDeadSpacing("EnhanceCompare.tsx", source, allowed)).toEqual([]);
  });

  it("does not mistake a fraction or an arbitrary value for a numeric step", () => {
    const source = 'className="w-1/2 min-w-[200px] size-[26px] py-8"';
    expect(findDeadSpacing("x.tsx", source, allowed)).toEqual([]);
  });

  it("reports a responsive variant's step too", () => {
    const source = 'className="sm:py-10"';
    expect(findDeadSpacing("x.tsx", source, allowed)).toEqual([
      { file: "x.tsx", line: 1, className: "py-10" },
    ]);
  });
});

describe("runCheckDeadSpacing", () => {
  it("exits 1 with file:line for a tree that has a dead class", () => {
    const dir = mkdtempSync(join(tmpdir(), "dead-spacing-"));
    const tokensPath = join(dir, "tokens.css");
    writeFileSync(tokensPath, TOKENS_CSS);
    writeFileSync(join(dir, "Bad.tsx"), 'const c = "py-10";\n');

    const result = runCheckDeadSpacing({ tokensPath, scanDir: dir });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("py-10");
    expect(result.message).toMatch(/Bad\.tsx:1/);
  });

  it("exits 0 for a tree where every step is on the scale", () => {
    const dir = mkdtempSync(join(tmpdir(), "dead-spacing-"));
    const tokensPath = join(dir, "tokens.css");
    writeFileSync(tokensPath, TOKENS_CSS);
    writeFileSync(join(dir, "Good.tsx"), 'const c = "py-8 gap-4";\n');

    const result = runCheckDeadSpacing({ tokensPath, scanDir: dir });

    expect(result.exitCode).toBe(0);
  });

  it("walks into subdirectories and ignores non-source files", () => {
    const dir = mkdtempSync(join(tmpdir(), "dead-spacing-"));
    const tokensPath = join(dir, "tokens.css");
    writeFileSync(tokensPath, TOKENS_CSS);
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "nested", "Deep.tsx"), 'const c = "py-10";\n');
    writeFileSync(join(dir, "notes.md"), "py-10 mentioned in prose, not scanned\n");

    const result = runCheckDeadSpacing({ tokensPath, scanDir: dir });

    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/Deep\.tsx:1/);
  });
});
