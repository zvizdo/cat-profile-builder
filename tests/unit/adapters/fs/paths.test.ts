import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { privatePath, publicPath, underRoot } from "@/adapters/fs/layout";

// Path safety for the filesystem store (T016): every file it touches is an ADR-015 object
// name from `src/core/media/paths.ts` joined under DATA_DIR, and the join is checked to
// still be inside the root. The grep test pins the other half of the rule — no adapter
// spells a path segment itself.

const ROOT = resolve("/tmp/cpb-root");

describe("underRoot", () => {
  it("joins an object name under the root", () => {
    expect(underRoot(ROOT, "a/b.json")).toBe(join(ROOT, "a/b.json"));
    expect(privatePath(ROOT, "x")).toBe(join(ROOT, "private", "x"));
    expect(publicPath(ROOT, "x")).toBe(join(ROOT, "public", "x"));
  });

  it("refuses a name that would resolve outside the root", () => {
    expect(() => underRoot(ROOT, "../escape.json")).toThrow(/outside/);
    expect(() => underRoot(ROOT, "a/../../escape.json")).toThrow(/outside/);
    expect(() => underRoot(ROOT, "/etc/passwd")).toThrow(/outside/);
  });

  it("does not mistake a sibling directory with the same prefix for the root", () => {
    expect(() => underRoot(ROOT, "../cpb-root-2/x")).toThrow(/outside/);
  });
});

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)],
    ),
  );
  return files.flat().filter((file) => file.endsWith(".ts"));
}

/** The source with its comments blanked: the rule is about code, and comments may cite the layout. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("no adapter builds an object path itself", () => {
  it("contains no literal `profiles/` in src/adapters code", async () => {
    const files = await sourceFiles(resolve("src/adapters"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = withoutComments(await readFile(file, "utf8"));
      expect(source, file).not.toContain("profiles/");
    }
  });
});
