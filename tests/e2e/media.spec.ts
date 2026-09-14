import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { FAKE_DESCRIPTION, fixture, newCat, runAxe, signIn } from "./_lib";
import { E2E_DATA_DIR } from "./global-setup";

// The media library journey (T022; FR-006, FR-007, FR-008, FR-011, FR-013, FR-073's edit
// path, FR-076's ask-first) against the production build over the filesystem store and
// the fake describer: a photo and a clip go in through the real upload route and the real
// ffmpeg, land with the fake sentence, the clip shows its poster and length, a description
// edit survives a reload, a renamed PNG is refused with the modal, a small photo is accepted
// with its warning, and the cat is deleted at the end so the list journey starts clean.

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");
test("a volunteer uploads a photo and a clip, edits a description, and sees refusals in plain words", async ({
  page,
}) => {
  await signIn(page);
  const id = await newCat(page);
  const rail = page.getByRole("complementary", { name: "Media" });
  await expect(rail.getByRole("heading", { name: "Media · 0 items" })).toBeVisible();
  const picker = rail.locator("input[type=file]");
  await expect(picker).toHaveAttribute(
    "accept",
    "image/jpeg,image/png,image/webp,video/mp4,video/quicktime",
  );

  // A photo and a clip, one after the other, both described by the fake.
  await picker.setInputFiles([fixture("cat-1.jpg"), fixture("clip-2s.mp4")]);
  const photoTile = rail.getByRole("button", { name: `${FAKE_DESCRIPTION}, cat-1.jpg` });
  const clipTile = rail.getByRole("button", { name: `${FAKE_DESCRIPTION}, clip-2s.mp4, 0:02` });
  await expect(photoTile).toBeVisible({ timeout: 30_000 });
  await expect(clipTile).toBeVisible({ timeout: 60_000 });
  await expect(rail.getByRole("heading", { name: "Media · 2 items" })).toBeVisible();
  await expect(rail.getByRole("progressbar")).toHaveCount(0);
  await expect(clipTile.locator("img")).toHaveAttribute("src", /poster\.[0-9a-f]{10}\.jpg$/);
  expect(await readdir(resolve(PROFILES_DIR, id, "media"))).toHaveLength(2);

  // Enter opens the clip: its length, its description, Remove.
  await clipTile.focus();
  await page.keyboard.press("Enter");
  await expect(clipTile).toHaveAttribute("aria-expanded", "true");
  await expect(rail.getByText("0:02 · clip-2s.mp4")).toBeVisible();
  const description = rail.getByRole("textbox", { name: "Description" });
  await expect(description).toHaveValue(FAKE_DESCRIPTION);
  await expect(rail.getByText("described automatically")).toBeVisible();
  await runAxe(page);

  // A volunteer's words replace the model's and survive a reload.
  await description.fill("Charlotte pacing the hall, tail up.");
  await page.keyboard.press("Enter");
  await expect(rail.getByText("written by a volunteer")).toBeVisible();
  await page.reload();
  await rail
    .getByRole("button", { name: "Charlotte pacing the hall, tail up., clip-2s.mp4, 0:02" })
    .click();
  await expect(rail.getByRole("textbox", { name: "Description" })).toHaveValue(
    "Charlotte pacing the hall, tail up.",
  );
  await expect(rail.getByText("written by a volunteer")).toBeVisible();

  // A PNG named .mp4 passes the browser and is refused by the server's sniff (FR-008).
  await picker.setInputFiles(fixture("not-a-video.mp4"));
  const dialog = page.getByRole("dialog", { name: "We can't read that file." });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toContainText(
    "Photos as JPEG, PNG or WebP; video as MP4 or MOV. Nothing was added.",
  );
  await runAxe(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(rail.getByRole("heading", { name: "Media · 2 items" })).toBeVisible();
  expect(await readdir(resolve(PROFILES_DIR, id, "media"))).toHaveLength(2);

  // A small photo is accepted with its warning, never refused (FR-008).
  await picker.setInputFiles(fixture("small.jpg"));
  await expect(rail.getByRole("button", { name: `${FAKE_DESCRIPTION}, small.jpg` })).toBeVisible({
    timeout: 15_000,
  });
  const warning = page.getByRole("status").filter({ hasText: "too small for the hero" });
  await expect(warning).toContainText("That photo is 850px wide — too small for the hero.");
  await runAxe(page);
  await warning.getByRole("button", { name: "Use anyway" }).click();
  await expect(warning).toHaveCount(0);

  // Delete asks first; Escape keeps; confirming removes the file from disk.
  await rail.getByRole("button", { name: `${FAKE_DESCRIPTION}, small.jpg` }).focus();
  await page.keyboard.press("Delete");
  const remove = page.getByRole("dialog", { name: "Remove small.jpg?" });
  await expect(remove).toContainText("It comes out of the library.");
  await page.keyboard.press("Escape");
  await expect(remove).toHaveCount(0);
  await expect(rail.getByRole("button", { name: `${FAKE_DESCRIPTION}, small.jpg` })).toBeVisible();
  await page.keyboard.press("Delete");
  await remove.getByRole("button", { name: "Remove" }).click();
  await expect(rail.getByRole("button", { name: `${FAKE_DESCRIPTION}, small.jpg` })).toHaveCount(0);
  await expect(rail.getByRole("heading", { name: "Media · 2 items" })).toBeVisible();
  expect(await readdir(resolve(PROFILES_DIR, id, "media"))).toHaveLength(2);

  // Leave the store as it was found: the list journey counts cats.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Unnamed cat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});
