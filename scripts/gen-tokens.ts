import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { generateTokensCss } from "./lib/tokens-css";

/** Where the tokens come from and where the stylesheet goes; `check` compares instead of writing. */
export interface GenTokensOptions {
  tokensPath: string;
  outPath: string;
  check: boolean;
}

/** What the CLI prints and exits with; `1` only ever means "the file on disk is not current". */
export interface GenTokensResult {
  exitCode: 0 | 1;
  message: string;
}

/**
 * Generates `tokens.css` from `TOKENS.json`, or with `check` verifies that the committed
 * file is exactly what would be generated so the two cannot drift (ADR-008). Never writes
 * in check mode. A malformed TOKENS.json throws rather than producing a partial stylesheet.
 */
export function runGenTokens({ tokensPath, outPath, check }: GenTokensOptions): GenTokensResult {
  const css = generateTokensCss(JSON.parse(readFileSync(tokensPath, "utf8")));
  if (!check) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, css);
    return { exitCode: 0, message: `Wrote ${outPath}` };
  }
  const current = existsSync(outPath) && readFileSync(outPath, "utf8") === css;
  return current
    ? { exitCode: 0, message: `${outPath} is up to date` }
    : {
        exitCode: 1,
        message: `${outPath} does not match ${tokensPath}. Run \`pnpm gen-tokens\` and commit the result.`,
      };
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const result = runGenTokens({
    tokensPath: "references/design/TOKENS.json",
    outPath: "src/ui/tokens.css",
    check: process.argv.includes("--check"),
  });
  process.stdout.write(`${result.message}\n`);
  process.exitCode = result.exitCode;
}
