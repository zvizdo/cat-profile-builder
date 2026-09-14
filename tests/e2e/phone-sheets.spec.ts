import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { deleteCat, fixture, frame, pick, runAxe, signIn } from "./_lib";

// F55 items 3 and 4 (the controller's phone sweep, `runs/2026-09-13-phone-sweep.md`) on a
// real phone profile — iPhone 14, `isMobile`, `hasTouch`, taps — at 390×664, the height
// the sweep ran at: the trim editor's footer (`Cancel` / `Use this stretch`) is pinned
// inside the viewport without scrolling the sheet, its preview held to 40dvh; and
// `Add a section` is a bottom sheet like the picker's, its list scrolling inside with
// `Cancel` pinned. axe is clean in both states.

const CLIP = "A tabby cat on a windowsill., clip-2s.mp4";
const HEIGHT = 664;

/** The panel's own scroll offset and the box of one of its controls. */
async function inReach(dialog: Locator, control: Locator): Promise<void> {
  const box = await control.boundingBox();
  expect(box, "the control is laid out").not.toBeNull();
  expect(
    box!.y + box!.height,
    "the control's bottom edge is inside the viewport",
  ).toBeLessThanOrEqual(HEIGHT);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await dialog.evaluate((el) => el.scrollTop), "the sheet was not scrolled").toBe(0);
}

async function newCatWithClip(page: Page): Promise<void> {
  await signIn(page);
  await page.getByRole("button", { name: "New cat", exact: true }).click();
  await expect(page).toHaveURL(/\/builder\/[a-z2-7]{8}$/);
  const facts = page.getByRole("region", { name: "Facts" });
  await facts.getByRole("textbox", { name: "Name" }).fill("Trim Sheet");
  await page.keyboard.press("Enter");
  await facts.getByRole("button", { name: /^Facts/ }).click();
  await page
    .getByRole("navigation", { name: "Drawers" })
    .getByRole("button", { name: "Media" })
    .click();
  const media = page.getByRole("dialog");
  await media.locator("input[type=file]").setInputFiles(fixture("clip-2s.mp4"));
  await expect(media.getByRole("button", { name: CLIP })).toBeVisible({ timeout: 120_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("the trim sheet and the section picker keep their footers in reach at 390×664", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  // The device profile minus its browser type: Playwright's own iPhone 14 is WebKit; the
  // emulation (`isMobile`, `hasTouch`, the scale, the UA) runs under this Chromium.
  const { userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["iPhone 14"]!;
  const context = await browser.newContext({
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    viewport: { width: 390, height: HEIGHT },
  });
  const page = await context.newPage();
  await newCatWithClip(page);

  // Item 4: `Add a section` slides up from the foot, scrolls inside, Cancel pinned.
  await page.getByRole("button", { name: "+ add section" }).first().tap();
  const picker = page.getByRole("dialog", { name: "Add a section" });
  await expect(picker).toBeVisible();
  expect(await picker.evaluate((el) => getComputedStyle(el).animationName)).toBe("sheet-in");
  await expect
    .poll(() => picker.evaluate((el) => Math.round(el.getBoundingClientRect().bottom)))
    .toBe(HEIGHT);
  expect(
    await picker.evaluate((el) => el.scrollHeight > el.clientHeight),
    "seven options are taller than the sheet, so the list scrolls inside it",
  ).toBe(true);
  await inReach(picker, picker.getByRole("button", { name: "Cancel" }));
  await runAxe(page);
  await picker.getByRole("button", { name: /^VIDEO/ }).tap();
  await expect(picker).toHaveCount(0);

  // The clip into the video frame from its own slot, then re-trim: item 3.
  const video = frame(page, /^VIDEO/);
  await video.getByRole("button", { name: "Add a clip" }).tap();
  await pick(page, CLIP, "Use clip");
  await video.getByRole("button", { name: "re-trim" }).tap();
  const trim = page.getByRole("dialog", { name: /^That clip is 0:02/ });
  await expect(trim).toBeVisible();
  await expect(trim).toHaveAccessibleDescription(
    "Drag the handles to choose the stretch. Its first frame is the cover.",
  );
  const preview = trim.locator("video");
  await expect
    .poll(async () => (await preview.boundingBox())?.height ?? Infinity)
    .toBeLessThanOrEqual(HEIGHT * 0.4);
  await inReach(trim, trim.getByRole("button", { name: "Use this stretch" }));
  await inReach(trim, trim.getByRole("button", { name: "Cancel" }));
  await runAxe(page);
  await trim.getByRole("button", { name: "Cancel" }).tap();
  await expect(trim).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await deleteCat(page, "Trim Sheet");
  await context.close();
});
