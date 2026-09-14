import { createHash } from "node:crypto";
import { copyFile, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import {
  CAT_1,
  CAT_2,
  deleteCat,
  draftSaved,
  FAKE_DESCRIPTION,
  frame,
  newCat,
  fixture,
  pick,
  runAxe,
  signIn,
  upload,
} from "./_lib";
import { E2E_DATA_DIR } from "./global-setup";

// Photo enhancement, volunteer-facing (T045; FR-050–FR-054) against the production build
// over the filesystem store and the real sharp recipe: `enhance` on the hero's label row
// opens the compare view — original and result at one crop, a divider and a keyboard
// toggle, axe-clean — `Use enhanced` swaps the hero alone (the gallery holding the same
// original is untouched) as one undoable step, the library tile says ENHANCED and names
// its original, `revert to original` puts the original back, the new record carries its
// recipe and source; a second Enhance of the same original reuses the copy the library
// holds (no new record), and the same bytes uploaded twice enhance to byte-identical
// files (FR-051). Then the same from phone mode at 390px, where the actions live on the
// tile and focus returns to it.

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");
const PUBLIC_DIR = resolve(E2E_DATA_DIR, "public/profiles");
const DIM = `${FAKE_DESCRIPTION}, dim.jpg`;
const DIM_ENHANCED = `${DIM}, ENHANCED`;
/** The same bytes under a second name, so the gallery holds its own original. */
const DIM_2 = `${FAKE_DESCRIPTION}, dim-2.jpg`;
const NAME = "Dim";

/** The media ids under a cat, oldest first. */
async function mediaIds(id: string): Promise<string[]> {
  return (await readdir(resolve(PROFILES_DIR, id, "media"))).sort();
}

async function assetOf(id: string, mid: string): Promise<Record<string, unknown>> {
  const text = await readFile(resolve(PROFILES_DIR, id, "media", mid, "asset.json"), "utf8");
  return JSON.parse(text) as Record<string, unknown>;
}

/** SHA-256 of a record's one clean file. */
async function cleanHash(id: string, mid: string): Promise<string> {
  const dir = resolve(PUBLIC_DIR, id, "media", mid);
  const clean = (await readdir(dir)).find((name) => name.startsWith("clean."));
  if (clean === undefined) throw new Error(`no clean file under ${mid}`);
  return createHash("sha256")
    .update(await readFile(resolve(dir, clean)))
    .digest("hex");
}

/** The first image of a frame — the slot's photo. */
function slotImage(page: Page, label: RegExp): Locator {
  return frame(page, label).locator("img").first();
}

/** Places dim.jpg in the hero and a second copy of its bytes, `dim-2.jpg`, in a new gallery. */
async function placeDim(page: Page): Promise<{ id: string; original: string; second: string }> {
  const id = await newCat(page);
  // A name, so the preview's hero heading is never empty (axe's `empty-heading`).
  await page
    .getByRole("region", { name: "Facts" })
    .getByRole("textbox", { name: "Name" })
    .fill(NAME);
  await page.keyboard.press("Enter");
  const second = resolve(tmpdir(), "dim-2.jpg");
  await copyFile(fixture("dim.jpg"), second);
  await upload(page, ["dim.jpg"]);
  const [original] = await mediaIds(id);
  await upload(page, [second]);
  const secondId = (await mediaIds(id)).find((mid) => mid !== original) ?? "";
  await frame(page, /^HERO/).getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, DIM, "Use photo");
  await page
    .getByRole("region", { name: "Add section" })
    .getByRole("button", { name: "Gallery", exact: true })
    .click();
  await frame(page, /^GALLERY/)
    .getByRole("button", { name: "add photos" })
    .click();
  const adding = page.getByRole("dialog", { name: "Add photos" });
  await adding.getByRole("button", { name: DIM_2 }).click();
  await adding.getByRole("button", { name: "Add 1 photo" }).click();
  await expect(frame(page, /^GALLERY · 1 of up to 12/)).toBeVisible();
  return { id, original: original ?? "", second: secondId };
}

test("a volunteer enhances the hero, compares, accepts, undoes, reverts; the gallery keeps the original", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signIn(page);
  const { id, original, second } = await placeDim(page);
  const originalSrc = (await slotImage(page, /^HERO/).getAttribute("src")) ?? "";
  const gallerySrc = (await slotImage(page, /^GALLERY/).getAttribute("src")) ?? "";

  // Enhance: the compare view, named by core's sentence, both photos at one crop.
  await frame(page, /^HERO/).getByRole("button", { name: "enhance" }).click();
  const dialog = page.getByRole("dialog", { name: "Use the enhanced photo in the hero?" });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  const images = dialog.locator("img");
  await expect(images).toHaveCount(2);
  await expect(images.first()).toHaveAttribute("src", originalSrc);
  await expect(images.last()).not.toHaveAttribute("src", originalSrc);
  await expect(dialog.getByRole("slider", { name: "Divider" })).toHaveValue("50");
  await runAxe(page);

  // The keyboard toggle and the divider are one state.
  await expect(dialog.getByRole("button", { name: "Keep original" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("slider", { name: "Divider" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("radio", { name: "Original" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("radio", { name: "Enhanced" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(dialog.getByRole("slider", { name: "Divider" })).toHaveValue("0");
  await dialog.getByRole("slider", { name: "Divider" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("slider", { name: "Divider" })).toHaveValue("1");
  await expect(dialog.getByRole("radio", { name: "Enhanced" })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  // Use enhanced: the hero changes, the gallery does not, focus lands on revert.
  await dialog.getByRole("button", { name: "Use enhanced" }).click();
  await expect(dialog).toHaveCount(0);
  const enhanced = (await mediaIds(id)).find((mid) => mid !== original && mid !== second) ?? "";
  expect(enhanced).not.toBe("");
  await expect(slotImage(page, /^HERO/)).toHaveAttribute("src", new RegExp(enhanced));
  await expect(slotImage(page, /^GALLERY/)).toHaveAttribute("src", gallerySrc);
  await expect(
    frame(page, /^HERO/).getByRole("button", { name: "revert to original" }),
  ).toBeFocused();
  await expect(frame(page, /^HERO/).getByText("enhanced", { exact: true })).toBeVisible();

  // The tile: ENHANCED, and its original by description.
  const rail = page.getByRole("complementary", { name: "Media" });
  await rail.getByRole("button", { name: DIM_ENHANCED }).click();
  // The mark on the closed square, and the badge in the open detail.
  await expect(rail.getByText("ENHANCED", { exact: true })).toHaveCount(2);
  await expect(rail.getByText(`original: ${FAKE_DESCRIPTION}`)).toBeVisible();

  // One undo brings the original back; redo the enhanced; revert is its own step.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(slotImage(page, /^HERO/)).toHaveAttribute("src", originalSrc);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(slotImage(page, /^HERO/)).toHaveAttribute("src", new RegExp(enhanced));
  await frame(page, /^HERO/).getByRole("button", { name: "revert to original" }).click();
  await expect(slotImage(page, /^HERO/)).toHaveAttribute("src", originalSrc);
  await expect(frame(page, /^HERO/).getByRole("button", { name: "enhance" })).toBeFocused();
  await expect(slotImage(page, /^GALLERY/)).toHaveAttribute("src", gallerySrc);

  // Provenance on disk (FR-054). The same original again reuses the copy: no new record.
  expect((await assetOf(id, enhanced)).enhancement).toEqual({
    sourceMediaId: original,
    recipe: "auto-v1",
  });
  await frame(page, /^HERO/).getByRole("button", { name: "enhance" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img[data-layer="enhanced"]')).toHaveAttribute(
    "src",
    new RegExp(enhanced),
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(slotImage(page, /^HERO/)).toHaveAttribute("src", originalSrc);
  expect(await mediaIds(id)).toHaveLength(3);
  await expect(rail.getByRole("button", { name: DIM_ENHANCED })).toHaveCount(1);

  // Determinism (FR-051): the gallery's own original — the same bytes — enhanced from the
  // cell's row action comes out byte-identical. Keep original leaves the gallery as it was.
  const cell = frame(page, /^GALLERY/).getByRole("button", { name: "enhance" });
  await cell.click();
  const gallery = page.getByRole("dialog", {
    name: "Use the enhanced photo in slot 1 of the gallery?",
  });
  await expect(gallery).toBeVisible({ timeout: 60_000 });
  await gallery.getByRole("button", { name: "Keep original" }).click();
  await expect(gallery).toHaveCount(0);
  await expect(slotImage(page, /^GALLERY/)).toHaveAttribute("src", gallerySrc);
  await expect(cell).toBeFocused();
  const ids = await mediaIds(id);
  expect(ids).toHaveLength(4);
  const fromSecond = ids.find((mid) => ![original, second, enhanced].includes(mid)) ?? "";
  expect((await assetOf(id, fromSecond)).enhancement).toEqual({
    sourceMediaId: second,
    recipe: "auto-v1",
  });
  expect(await cleanHash(id, fromSecond)).toBe(await cleanHash(id, enhanced));

  // The picker tells the copies from their originals.
  await frame(page, /^HERO/).getByRole("button", { name: "replace photo" }).click();
  const picker = page.getByRole("dialog", { name: "Pick a photo" });
  await expect(picker.getByRole("button", { name: DIM_ENHANCED })).toBeVisible();
  await expect(picker.getByRole("button", { name: `${DIM_2}, ENHANCED` })).toBeVisible();
  await expect(picker.getByRole("button", { name: DIM, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // Leave the store as it was found.
  await draftSaved(page);
  await deleteCat(page, NAME);
});

test("from a phone, the hero frame's enhance action opens the compare at 390px and Revert goes back", async ({
  page,
}) => {
  // The per-placement tile actions (`Enhance in the hero`, `Revert to original in the
  // hero`) were retired with `PhoneMedia` (F44). On the phone the hero frame's own
  // `enhance` action — a visible button in the editor body, same as desktop — opens the
  // compare directly; there is no separate tile step.
  test.setTimeout(240_000);
  await signIn(page);
  const { id, original, second } = await placeDim(page);
  await draftSaved(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await frame(page, /^HERO/).getByRole("button", { name: "enhance" }).click();
  const dialog = page.getByRole("dialog", { name: "Use the enhanced photo in the hero?" });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await runAxe(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  await dialog.getByRole("radio", { name: "Enhanced" }).click();
  await expect(dialog.getByRole("slider", { name: "Divider" })).toHaveValue("0");
  await dialog.getByRole("button", { name: "Use enhanced" }).click();
  await expect(dialog).toHaveCount(0);
  const enhanced = (await mediaIds(id)).find((mid) => mid !== original && mid !== second) ?? "";
  expect(enhanced).not.toBe("");
  await expect(slotImage(page, /^HERO/)).toHaveAttribute("src", new RegExp(enhanced));
  await expect(slotImage(page, /^GALLERY/)).toHaveAttribute("src", new RegExp(second));
  await expect(
    frame(page, /^HERO/).getByRole("button", { name: "revert to original" }),
  ).toBeFocused();

  // Revert goes back; the gallery's own copy is untouched throughout.
  await frame(page, /^HERO/).getByRole("button", { name: "revert to original" }).click();
  await expect(slotImage(page, /^HERO/)).toHaveAttribute("src", new RegExp(original));
  await expect(frame(page, /^HERO/).getByRole("button", { name: "enhance" })).toBeFocused();
  await expect(slotImage(page, /^GALLERY/)).toHaveAttribute("src", new RegExp(second));

  // Leave the store as it was found.
  await draftSaved(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await deleteCat(page, NAME);
});

function drawers(page: Page): Locator {
  return page.getByRole("navigation", { name: "Drawers" });
}

test("from a phone, an enhanced gallery tile's controls line up with its plain row neighbour (F61)", async ({
  browser,
}) => {
  // gallery-many-photos-investigation.md: `GalleryCellTouch`'s old `flex flex-wrap` row
  // let the longer `revert to original` label wrap one tile to a third line while its
  // row neighbour's shorter `enhance` stayed at two, so the two columns' `Remove photo`
  // rows ended up 52px apart. The two fixed `flex` rows (plus the touch-only short
  // `revert` word) keep both tiles the same height at every label.
  test.setTimeout(240_000);
  const NAME = "Row Neighbours";
  const { userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["iPhone 14"]!;
  const context = await browser.newContext({
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await signIn(page);
  await newCat(page);
  const facts = page.getByRole("region", { name: "Facts" });
  await facts.getByRole("textbox", { name: "Name" }).fill(NAME);
  await page.keyboard.press("Enter");
  await facts.getByRole("button", { name: /^Facts/ }).click();

  // Two photos into the library, then both into a fresh gallery — slot 1 and slot 2,
  // the same visual row at 390's two-up grid.
  await drawers(page).getByRole("button", { name: "Media" }).click();
  const media = page.getByRole("dialog");
  await media
    .locator("input[type=file]")
    .setInputFiles([fixture("cat-1.jpg"), fixture("cat-2.jpg")]);
  await expect(page.getByRole("dialog", { name: "Media · 2 items" })).toBeVisible({
    timeout: 90_000,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "+ add section" }).first().tap();
  await page
    .getByRole("dialog", { name: "Add a section" })
    .getByRole("button", { name: /^GALLERY/ })
    .tap();
  const gallery = frame(page, /^GALLERY/);
  await gallery.getByRole("button", { name: "add photos" }).tap();
  const adding = page.getByRole("dialog", { name: "Add photos" });
  await adding.getByRole("button", { name: CAT_1 }).click();
  await adding.getByRole("button", { name: CAT_2 }).click();
  await adding.getByRole("button", { name: "Add 2 photos" }).click();
  await expect(frame(page, /^GALLERY · 2 of up to 12/)).toBeVisible();

  const tiles = gallery.getByRole("listitem");
  const enhancedTile = tiles.nth(0);
  const plainTile = tiles.nth(1);

  // Enhance the first tile only — the second stays a plain `enhance` pill, its row
  // neighbour.
  await enhancedTile.getByRole("button", { name: "enhance" }).tap();
  const compare = page.getByRole("dialog", {
    name: "Use the enhanced photo in slot 1 of the gallery?",
  });
  await expect(compare).toBeVisible({ timeout: 60_000 });
  await compare.getByRole("button", { name: "Use enhanced" }).click();
  await expect(compare).toHaveCount(0);

  // The controller's ruling: the pill's visible word shortens to `revert`, but the
  // accessible name stays the full `revert to original` phrase.
  const revertPill = enhancedTile.getByRole("button", { name: "revert to original" });
  await expect(revertPill).toBeVisible();
  await expect(revertPill).toHaveText("revert");
  await expect(plainTile.getByRole("button", { name: "enhance" })).toBeVisible();

  // Same row, same height: the two-row flex layout holds regardless of which word the
  // pill wears.
  const enhancedBox = await enhancedTile.boundingBox();
  const plainBox = await plainTile.boundingBox();
  expect(enhancedBox, "the enhanced tile is laid out").not.toBeNull();
  expect(plainBox, "the plain tile is laid out").not.toBeNull();
  expect(Math.abs(enhancedBox!.height - plainBox!.height)).toBeLessThanOrEqual(1);

  const enhancedRemoveBox = await enhancedTile
    .getByRole("button", { name: "Remove photo" })
    .boundingBox();
  const plainRemoveBox = await plainTile
    .getByRole("button", { name: "Remove photo" })
    .boundingBox();
  expect(enhancedRemoveBox, "the enhanced tile's Remove photo is laid out").not.toBeNull();
  expect(plainRemoveBox, "the plain tile's Remove photo is laid out").not.toBeNull();
  expect(Math.abs(enhancedRemoveBox!.y - plainRemoveBox!.y)).toBeLessThanOrEqual(1);

  await runAxe(page);

  // Leave the store as it was found.
  await draftSaved(page);
  await deleteCat(page, NAME);
  await context.close();
});
