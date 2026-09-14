import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { GeneratedCredentials } from "../../src/core/auth/credentials";

// The testable half of `pnpm make-credentials` (ADR-011, ADR-014): what the tfvars and the
// `.env.local` lines look like, how the file is written, and what the flags mean. The CLI
// in scripts/make-credentials.ts only reads the password and calls these.

/** What the command-line flags asked for; `unknown` holds anything it could not read. */
export interface Args {
  /** Read the password from stdin (`printf '%s' "$pw" | pnpm make-credentials --password-stdin`). */
  passwordStdin: boolean;
  /** Overwrite an existing `secrets.auto.tfvars`. */
  force: boolean;
  /** Print the two `.env.local` lines to stdout instead of writing the tfvars. */
  env: boolean;
  help: boolean;
  unknown: string[];
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { passwordStdin: false, force: false, env: false, help: false, unknown: [] };
  for (const arg of argv) {
    if (arg === "--password-stdin") args.passwordStdin = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--env") args.env = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else args.unknown.push(arg);
  }
  return args;
}

/**
 * The password as piped in: one trailing newline is dropped (`echo` adds one, `printf '%s'`
 * does not), nothing else is touched — a password may begin or end with a space.
 */
export function passwordFromStdin(raw: string): string {
  if (raw.endsWith("\r\n")) return raw.slice(0, -2);
  if (raw.endsWith("\n")) return raw.slice(0, -1);
  return raw;
}

/** The contents of `infra/terraform/secrets.auto.tfvars`: the two sensitive variables. */
export function renderTfvars({ sessionSecret, passwordHmac }: GeneratedCredentials): string {
  return [
    "# Written by `pnpm make-credentials`. Git-ignored — NEVER commit this file: it holds the",
    "# session secret and the password HMAC the Cloud Run service runs with (ADR-011). To",
    "# rotate them, run the script again with --force and apply. Both values are hex only,",
    "# so nothing needs escaping.",
    `session_secret        = "${sessionSecret}"`,
    `shelter_password_hmac = "${passwordHmac}"`,
    "",
  ].join("\n");
}

/** The same two values as `.env.local` lines, for a local `pnpm dev` (README, "Run it locally"). */
export function renderEnv({ sessionSecret, passwordHmac }: GeneratedCredentials): string {
  return `SESSION_SECRET=${sessionSecret}\nSHELTER_PASSWORD_HMAC=${passwordHmac}\n`;
}

/** Whether the file was written; `exists` means it was already there and `force` was off. */
export type WriteResult = { written: true } | { written: false; reason: "exists" };

/**
 * Writes `contents` to `path` readable by its owner only (mode 0600). Without `force` an
 * existing file is left exactly as it was: overwriting silently would rotate a deployment's
 * credentials by accident. With `force` the mode is tightened even if the file was looser.
 */
export function writeTfvars(
  path: string,
  contents: string,
  { force }: { force: boolean },
): WriteResult {
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, contents, { mode: 0o600, flag: force ? "w" : "wx" });
  } catch (error) {
    if (!force && (error as NodeJS.ErrnoException).code === "EEXIST") {
      return { written: false, reason: "exists" };
    }
    throw error;
  }
  // `mode` only applies when the file is created; an overwritten file keeps its old bits.
  chmodSync(path, 0o600);
  return { written: true };
}
