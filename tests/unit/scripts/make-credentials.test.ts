import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseArgs,
  passwordFromStdin,
  renderEnv,
  renderTfvars,
  writeTfvars,
} from "../../../scripts/lib/make-credentials";

const credentials = {
  sessionSecret: "a".repeat(64),
  passwordHmac: "b".repeat(64),
};

function tempPath(): string {
  return join(mkdtempSync(join(tmpdir(), "make-credentials-")), "secrets.auto.tfvars");
}

describe("renderTfvars", () => {
  it("names the two Terraform variables with the values as HCL strings", () => {
    const text = renderTfvars(credentials);
    expect(text).toMatch(/^session_secret\s+= "a{64}"$/m);
    expect(text).toMatch(/^shelter_password_hmac\s+= "b{64}"$/m);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("says in a comment that the file is generated and must not be committed", () => {
    const text = renderTfvars(credentials);
    expect(text).toContain("pnpm make-credentials");
    expect(text.toLowerCase()).toContain("never commit");
  });
});

describe("renderEnv", () => {
  it("prints the two .env.local lines and nothing else", () => {
    expect(renderEnv(credentials)).toBe(
      `SESSION_SECRET=${"a".repeat(64)}\nSHELTER_PASSWORD_HMAC=${"b".repeat(64)}\n`,
    );
  });
});

describe("writeTfvars", () => {
  it("writes a new file readable by its owner only", () => {
    const path = tempPath();
    expect(writeTfvars(path, "x = 1\n", { force: false })).toEqual({ written: true });
    expect(readFileSync(path, "utf8")).toBe("x = 1\n");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("refuses to overwrite an existing file without --force and leaves it untouched", () => {
    const path = tempPath();
    writeFileSync(path, "old\n");
    expect(writeTfvars(path, "new\n", { force: false })).toEqual({
      written: false,
      reason: "exists",
    });
    expect(readFileSync(path, "utf8")).toBe("old\n");
  });

  it("overwrites with --force and tightens the mode of the existing file", () => {
    const path = tempPath();
    writeFileSync(path, "old\n", { mode: 0o644 });
    expect(writeTfvars(path, "new\n", { force: true })).toEqual({ written: true });
    expect(readFileSync(path, "utf8")).toBe("new\n");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("creates the parent directory when it is missing", () => {
    const path = join(mkdtempSync(join(tmpdir(), "make-credentials-")), "deeper", "s.tfvars");
    expect(existsSync(path)).toBe(false);
    expect(writeTfvars(path, "x = 1\n", { force: false })).toEqual({ written: true });
    expect(existsSync(path)).toBe(true);
  });
});

describe("passwordFromStdin", () => {
  it("strips exactly one trailing newline and keeps everything else", () => {
    expect(passwordFromStdin("catsarecool\n")).toBe("catsarecool");
    expect(passwordFromStdin("catsarecool\r\n")).toBe("catsarecool");
    expect(passwordFromStdin("catsarecool")).toBe("catsarecool");
    expect(passwordFromStdin("cats are cool\n\n")).toBe("cats are cool\n");
    expect(passwordFromStdin(" spaced ")).toBe(" spaced ");
  });
});

describe("parseArgs", () => {
  it("defaults to prompting, writing the tfvars, and refusing to overwrite", () => {
    expect(parseArgs([])).toEqual({
      passwordStdin: false,
      force: false,
      env: false,
      help: false,
      unknown: [],
    });
  });

  it("recognises every flag in any order", () => {
    expect(parseArgs(["--env", "--force", "--password-stdin"])).toEqual({
      passwordStdin: true,
      force: true,
      env: true,
      help: false,
      unknown: [],
    });
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("reports anything it does not know, including a bare password", () => {
    expect(parseArgs(["--frce", "catsarecool"]).unknown).toEqual(["--frce", "catsarecool"]);
  });
});
