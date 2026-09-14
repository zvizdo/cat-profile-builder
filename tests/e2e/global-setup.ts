import { rm } from "node:fs/promises";
import { resolve } from "node:path";

// Every end-to-end run starts from an empty store (ADR-015 → Local development): the
// filesystem adapter keeps state between runs, so the folder Playwright's web server is
// pointed at is wiped before the server starts.

/** The DATA_DIR the e2e web server writes to; git-ignored, separate from a dev `.data`. */
export const E2E_DATA_DIR = ".data-e2e";

export default async function globalSetup(): Promise<void> {
  await rm(resolve(E2E_DATA_DIR), { recursive: true, force: true });
}
