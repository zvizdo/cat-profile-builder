import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { checkTrim } from "@/core/media/validation";
import { FAKE_DESCRIPTION, newCat, probe, runAxe, signIn, upload } from "./_lib";
import { E2E_DATA_DIR } from "./global-setup";

// The two media editors (T023; FR-011's focal point, FR-077–FR-079's trim, FR-085's
// silence) against the production build over the filesystem store and the real ffmpeg: a
// photo's focal point is nudged by keyboard, saved, and survives a reload as whole
// percentages; a 20 s clip needs a trim, is cut to its first ten seconds (ffprobe agrees
// and finds no audio), refuses sixteen in core's own words, and loses its trim again.

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");
const PUBLIC_DIR = resolve(E2E_DATA_DIR, "public/profiles");
/** The one media record of `id`, read straight from the store. */
async function assetOf(id: string, mid: string): Promise<Record<string, unknown>> {
  const text = await readFile(resolve(PROFILES_DIR, id, "media", mid, "asset.json"), "utf8");
  return JSON.parse(text) as Record<string, unknown>;
}

/** The media ids under a cat, oldest first. */
async function mediaIds(id: string): Promise<string[]> {
  return (await readdir(resolve(PROFILES_DIR, id, "media"))).sort();
}

/** Moves a trim handle by whole seconds with Shift+Arrow. */
async function shiftHandle(page: Page, handle: Locator, seconds: number): Promise<void> {
  await handle.focus();
  const key = seconds < 0 ? "Shift+ArrowLeft" : "Shift+ArrowRight";
  for (let i = 0; i < Math.abs(seconds); i += 1) await page.keyboard.press(key);
}

test("a volunteer sets a focal point by keyboard and it survives a reload", async ({ page }) => {
  await signIn(page);
  const id = await newCat(page);
  const rail = page.getByRole("complementary", { name: "Media" });
  await upload(page, ["cat-1.jpg"]);
  const tile = rail.getByRole("button", { name: `${FAKE_DESCRIPTION}, cat-1.jpg` });
  await expect(tile.locator("img")).toHaveCSS("object-position", "50% 50%");

  // The sheet: the question, the picker described by its point, four live crops.
  await tile.click();
  await rail.getByRole("button", { name: "Focal point" }).click();
  const sheet = page.getByRole("dialog", { name: "Where should the crop hold on?" });
  await expect(sheet).toBeVisible();
  const picker = sheet.getByRole("button", { name: "Focal point", exact: true });
  await expect(picker).toHaveAccessibleDescription("x 50%, y 50%");
  await runAxe(page);

  // Three nudges right, one Shift up; the crops follow; Save writes whole percentages.
  await picker.focus();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(picker).toHaveAccessibleDescription("x 53%, y 40%");
  const crops = sheet.getByRole("group", { name: "Derived crops · live" }).locator("img");
  await expect(crops).toHaveCount(4);
  await expect(crops.first()).toHaveCSS("object-position", "53% 40%");
  await sheet.getByRole("button", { name: "Save focal point" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(tile.locator("img")).toHaveCSS("object-position", "53% 40%");

  await page.reload();
  const reloaded = rail.getByRole("button", { name: `${FAKE_DESCRIPTION}, cat-1.jpg` });
  await expect(reloaded.locator("img")).toHaveCSS("object-position", "53% 40%");
  const [mid] = await mediaIds(id);
  expect((await assetOf(id, mid ?? "")).focal).toEqual({ x: 53, y: 40 });

  // Reset to centre lands 50/50 on disk.
  await reloaded.click();
  await rail.getByRole("button", { name: "Focal point" }).click();
  await sheet.getByRole("button", { name: "Reset to centre" }).click();
  await sheet.getByRole("button", { name: "Save focal point" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(reloaded.locator("img")).toHaveCSS("object-position", "50% 50%");
  expect((await assetOf(id, mid ?? "")).focal).toEqual({ x: 50, y: 50 });

  // Leave the store as it was found.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Unnamed cat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("a volunteer trims a long clip, is refused sixteen seconds in core's words, and removes the trim", async ({
  page,
}) => {
  await signIn(page);
  const id = await newCat(page);
  const rail = page.getByRole("complementary", { name: "Media" });
  await upload(page, ["clip-20s.mp4"]);
  const needsTrim = rail.getByRole("button", { name: "clip-20s.mp4, needs a trim" });
  const [mid] = await mediaIds(id);
  expect((await assetOf(id, mid ?? "")).status).toBe("needs-trim");

  // The modal, its sentences, the silent original, the first fifteen seconds offered.
  await needsTrim.click();
  await rail.getByRole("button", { name: "Trim", exact: true }).click();
  const modal = page.getByRole("dialog", {
    name: "That clip is 0:20. A profile plays up to 15 seconds; the carousel shows the first 8.",
  });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(
    "Drag the handles to choose the stretch. Its first frame is the cover.",
  );
  const video = modal.locator("video");
  await expect(video).toHaveAttribute("src", `/api/profiles/${id}/media/${mid}/original`);
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted && !v.controls)).toBe(true);
  await expect(modal.getByText("0:00 – 0:15 of 0:20 · muted · loops")).toBeVisible();
  await runAxe(page);

  // The first ten seconds: the tile is cut, and ffprobe agrees — and hears nothing.
  const end = modal.getByRole("slider", { name: "End" });
  await shiftHandle(page, end, -5);
  await expect(modal.getByText("0:00 – 0:10 of 0:20 · muted · loops")).toBeVisible();
  await modal.getByRole("button", { name: "Use this stretch" }).click();
  await expect(modal).toHaveCount(0);
  const ready = rail.getByRole("button", { name: /clip-20s\.mp4, 0:(09|10)$/ });
  await expect(ready).toBeVisible({ timeout: 60_000 });
  await expect(ready.locator("img")).toHaveAttribute("src", /poster\.[0-9a-f]{10}\.jpg$/);
  const trimmed = await assetOf(id, mid ?? "");
  expect(trimmed.trim).toEqual({ start: 0, end: 10 });
  const revisions = trimmed.revisions as { web: string };
  const web = probe(resolve(PUBLIC_DIR, id, "media", mid ?? "", `web.${revisions.web}.mp4`));
  expect(Math.abs(web.duration - 10)).toBeLessThan(0.25);
  expect(web.streams).toEqual(["video"]);

  // Sixteen seconds is refused in core's own words, and the button waits. The tile is
  // still open from before the cut, so it is only clicked when it closed meanwhile.
  if ((await ready.getAttribute("aria-expanded")) !== "true") await ready.click();
  await rail.getByRole("button", { name: "Re-trim" }).click();
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("slider", { name: "End" })).toHaveValue("10");
  await shiftHandle(page, modal.getByRole("slider", { name: "End" }), 6);
  const refusal = checkTrim({ start: 0, end: 16, originalDurationSeconds: 20 });
  if (refusal.ok) throw new Error("expected core to refuse sixteen seconds");
  await expect(modal.getByRole("status")).toHaveText(refusal.message);
  await expect(modal.getByRole("button", { name: "Use this stretch" })).toBeDisabled();
  await runAxe(page);

  // Remove trim: back to needing one, and the record no longer carries a trim.
  await modal.getByRole("button", { name: "Remove trim" }).click();
  await expect(modal).toHaveCount(0);
  await expect(needsTrim).toBeVisible({ timeout: 15_000 });
  const cleared = await assetOf(id, mid ?? "");
  expect(cleared.status).toBe("needs-trim");
  expect(cleared).not.toHaveProperty("trim");

  // Leave the store as it was found.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Unnamed cat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});
