import { fileURLToPath } from "node:url";
import { makeCredentials } from "../src/core/auth/credentials";
import {
  parseArgs,
  passwordFromStdin,
  renderEnv,
  renderTfvars,
  writeTfvars,
} from "./lib/make-credentials";

// Produces the two credential values a deployment needs (ADR-011) — a fresh SESSION_SECRET
// and the SHELTER_PASSWORD_HMAC of the password keyed by it — and writes them to
// infra/terraform/secrets.auto.tfvars, which Terraform picks up on the next apply. Only
// the path is printed; the values never reach stdout, stderr or the shell history. The
// logic lives in scripts/lib/make-credentials.ts (tested); this file is the terminal side.
//
//   pnpm make-credentials                    prompts twice, echo off
//   pnpm make-credentials --force            overwrite the existing file (rotation)
//   printf '%s' "$pw" | pnpm make-credentials --password-stdin
//   pnpm make-credentials --env              print the two .env.local lines instead

const USAGE = `usage: pnpm make-credentials [--password-stdin] [--force] [--env]
  --password-stdin  read the password from stdin (one trailing newline is dropped)
  --force           overwrite infra/terraform/secrets.auto.tfvars if it exists
  --env             print SESSION_SECRET= and SHELTER_PASSWORD_HMAC= lines to stdout
                    for .env.local instead of writing the tfvars`;

const TFVARS_PATH = fileURLToPath(
  new URL("../infra/terraform/secrets.auto.tfvars", import.meta.url),
);

const ENTER = new Set(["\r", "\n"]);
const CTRL_C = "\u0003";
const BACKSPACE = new Set(["\u007f", "\b"]);

function fail(message: string, code: 1 | 2): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

/** Reads all of stdin (the `--password-stdin` path). */
async function readStdin(): Promise<string> {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

/**
 * Asks on the terminal with echo off: raw mode, characters collected until Enter, Backspace
 * honoured, Ctrl-C aborts. Node's readline has no hidden mode of its own.
 */
function promptHidden(label: string): Promise<string> {
  const { stdin, stderr } = process;
  // Raw mode first, label second: nothing typed can be echoed before echo is off.
  stdin.setRawMode(true);
  stderr.write(label);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const done = (outcome: () => void) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write("\n");
      outcome();
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (ENTER.has(char)) return done(() => resolve(value));
        if (char === CTRL_C) return done(() => reject(new Error("Interrupted.")));
        if (BACKSPACE.has(char)) value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword(fromStdin: boolean): Promise<string> {
  if (fromStdin) return passwordFromStdin(await readStdin());
  if (!process.stdin.isTTY) {
    fail("stdin is not a terminal; pipe the password with --password-stdin.", 2);
  }
  const first = await promptHidden("Shelter password: ");
  const again = await promptHidden("Again: ");
  if (first !== again) fail("The two entries differ; nothing written.", 2);
  return first;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}
if (args.unknown.length > 0) {
  // The stray argument is not echoed back: it may be a password typed by habit.
  fail(
    `${args.unknown.length} unknown argument(s); the password is never an argument.\n${USAGE}`,
    2,
  );
}

const password = await readPassword(args.passwordStdin).catch((error: Error) =>
  fail(`${error.message} Nothing written.`, 2),
);
if (password === "") fail("The password must not be empty.", 2);
const credentials = makeCredentials(password);

if (args.env) {
  process.stdout.write(renderEnv(credentials));
} else {
  const result = writeTfvars(TFVARS_PATH, renderTfvars(credentials), { force: args.force });
  if (!result.written) {
    fail(
      `${TFVARS_PATH} already exists; pass --force to replace it (that rotates the deployment's credentials).`,
      1,
    );
  }
  process.stdout.write(
    `Wrote ${TFVARS_PATH} (mode 0600, git-ignored). Apply the stack to deploy it.\n`,
  );
}
