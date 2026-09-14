import { expect, test } from "@playwright/test";
import { CAT_1, deleteCat, fixture, frame, newCat, openTile, pick, signIn, upload } from "./_lib";

// F56: the focal sheet's body follows the cat's recorded sex (`Click her face.` /
// `Click his face.` / `Click their face.`, `Tap` under the tablet floor — F41's pronoun
// table, `FocalPicker.tsx`'s `bodyFor`), from every place `MediaEditors` mounts it: the
// desktop rail's card (`MediaLibrary.tsx`, at 1440) and, on the phone (390), both the
// hero's own `focal point` chip on the canvas and the Media drawer's card — the two
// mounts `PhoneBuilder.tsx` owns (`PhoneMain`'s copy and `FullDrawers`'). A cat's sex is
// changed mid-session rather than built twice, so the same photo's sheet is read for
// `her`, then reopened and read again for `his`.

const WANTS_HER =
  "Click her face. Every crop on the site, the phone and the carousel is derived from this one point.";
const WANTS_HIS =
  "Click his face. Every crop on the site, the phone and the carousel is derived from this one point.";
const TAPS_HER =
  "Tap her face. Every crop on the site, the phone and the carousel is derived from this one point.";
const TAPS_HIS =
  "Tap his face. Every crop on the site, the phone and the carousel is derived from this one point.";

test("at 1440 the desktop rail's focal sheet follows the cat's sex, then changes with it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await newCat(page);
  const facts = page.getByRole("region", { name: "Facts" });
  await facts.getByRole("combobox", { name: "Sex" }).selectOption("female");
  await upload(page, ["cat-1.jpg"]);

  const rail = page.getByRole("complementary", { name: "Media" });
  await openTile(page, CAT_1);
  await rail.getByRole("button", { name: "Focal point" }).click();
  const sheet = page.getByRole("dialog", { name: "Where should the crop hold on?" });
  await expect(sheet).toHaveAccessibleDescription(WANTS_HER);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await facts.getByRole("combobox", { name: "Sex" }).selectOption("male");
  await rail.getByRole("button", { name: "Focal point" }).click();
  await expect(sheet).toHaveAccessibleDescription(WANTS_HIS);
  await page.keyboard.press("Escape");

  await deleteCat(page, "Unnamed cat");
});

test("at 390 the phone's two focal mounts — the hero chip and the Media drawer's card — both follow the cat's sex", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await newCat(page);
  const facts = page.getByRole("region", { name: "Facts" });
  await facts.getByRole("combobox", { name: "Sex" }).selectOption("female");

  // A photo in, from the Media drawer, then placed in the hero from its own slot.
  const drawers = page.getByRole("navigation", { name: "Drawers" });
  await drawers.getByRole("button", { name: "Media" }).click();
  const media = page.getByRole("dialog");
  await media.locator("input[type=file]").setInputFiles(fixture("cat-1.jpg"));
  await expect(media.getByRole("button", { name: CAT_1 })).toBeVisible({ timeout: 90_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await frame(page, /^HERO/).getByRole("button", { name: "Add a photo" }).click();
  await pick(page, CAT_1, "Use photo");

  const sheet = page.getByRole("dialog", { name: "Where should the crop hold on?" });

  // The canvas: the hero's own `focal point` chip, mounted by `PhoneMain` while the
  // Media sheet is down.
  await frame(page, /^HERO/).getByRole("button", { name: "focal point" }).click();
  await expect(sheet).toHaveAccessibleDescription(TAPS_HER);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // The Media drawer's card, mounted by `FullDrawers` while the sheet is up.
  await drawers.getByRole("button", { name: "Media" }).click();
  await media.getByRole("button", { name: CAT_1 }).click();
  await media.getByRole("button", { name: "Focal point" }).click();
  await expect(sheet).toHaveAccessibleDescription(TAPS_HER);
  // The focal sheet, then the tile's own card, then the Media sheet itself: three
  // layers, three Escapes (the same order `phone-builder.spec.ts` already relies on).
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(media.getByRole("group")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Sex changes mid-session: both mounts read the new pronoun, not a stale one.
  await facts.getByRole("combobox", { name: "Sex" }).selectOption("male");
  await frame(page, /^HERO/).getByRole("button", { name: "focal point" }).click();
  await expect(sheet).toHaveAccessibleDescription(TAPS_HIS);
  await page.keyboard.press("Escape");

  await deleteCat(page, "Unnamed cat");
});
