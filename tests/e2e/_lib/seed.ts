import { execFileSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { E2E_DATA_DIR } from "../global-setup";

// The carousel journeys need a real roster (T042: twenty live cats, two archived, with
// "Solo" and "Clip" among the live ones). `pnpm seed` writes them through the real
// pipeline into the e2e store; the journeys that count cats share that store, so every
// seeded cat is removed again once the file that seeded it is done.

/** One seeded cat as the script printed it. */
export interface SeededCat {
  name: string;
  id: string;
  url: string;
  status: "published" | "archived";
}

const LINE = /^(published|archived)\s+(.+?)\s+([a-z0-9]{8})\s+(\S+)$/;

/** Runs `pnpm seed --published N --archived M` against the e2e store and answers what it wrote. */
export function seedCats(published: number, archived: number): SeededCat[] {
  const stdout = execFileSync(
    "pnpm",
    ["seed", "--published", String(published), "--archived", String(archived)],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATA_DIR: E2E_DATA_DIR,
        PUBLIC_BASE_URL: "http://localhost:3100",
      },
    },
  );
  const cats: SeededCat[] = [];
  for (const line of stdout.split("\n")) {
    const match = LINE.exec(line.trim());
    if (match === null) continue;
    const [, status, name, id, url] = match;
    if (status === "published" || status === "archived") {
      cats.push({ status, name: name ?? "", id: id ?? "", url: url ?? "" });
    }
  }
  return cats;
}

/** Removes every seeded cat's private and public folders from the e2e store. */
export async function removeSeeded(cats: readonly SeededCat[]): Promise<void> {
  for (const cat of cats) {
    for (const bucket of ["private", "public"]) {
      await rm(resolve(E2E_DATA_DIR, bucket, "profiles", cat.id), { recursive: true, force: true });
    }
  }
}
