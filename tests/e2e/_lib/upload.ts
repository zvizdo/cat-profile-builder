import { basename, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

// Uploads through the rail's real file input and waits until every file has settled
// into a tile — described and ready, or `needs a trim` for a long clip — so a journey
// never picks a record that is still processing.

/** What the fake describer writes for every photo and clip (MODEL=fake). */
export const FAKE_DESCRIPTION = "A tabby cat on a windowsill.";

/** The absolute path of a committed fixture under `tests/fixtures/`. */
export function fixture(name: string): string {
  return resolve("tests/fixtures", name);
}

/** How the rail names `file` once it has settled: `…, file`, `…, file, m:ss` or `file, needs a trim`. */
export function settledTile(file: string): RegExp {
  const name = basename(file).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${name}(, \\d+:\\d\\d|, needs a trim)?$`);
}

/**
 * Uploads `files` (fixture names or absolute paths) through the media rail and waits for
 * each one's tile to settle. A clip is transcoded by the real ffmpeg, so the wait is long.
 */
export async function upload(page: Page, files: string[]): Promise<void> {
  const rail = page.getByRole("complementary", { name: "Media" });
  const paths = files.map((file) => (file.includes("/") ? file : fixture(file)));
  await rail.locator("input[type=file]").setInputFiles(paths);
  for (const file of files) {
    await expect(rail.getByRole("button", { name: settledTile(file) })).toBeVisible({
      timeout: 90_000,
    });
  }
  await expect(rail.getByRole("progressbar")).toHaveCount(0);
}
