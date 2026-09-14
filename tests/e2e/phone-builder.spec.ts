import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_DATA_DIR } from "./global-setup";
import { deleteCat, draftSaved, fixture, frame, order, pick, runAxe, signIn } from "./_lib";

// The phone builder (F44; FR-091 as rewritten 2026-09-13; design §1–§2, §6) against the
// production build at 390×844: a new cat from the phone, the facts behind their
// collapsed line, a photo uploaded from the Media drawer and placed from the hero's own
// slot, sections added from the picker sheet, the bio edited in place, `↓` moving a
// section with focus kept, a removal through the question, a theme preset with the AA
// line, a request sent from the CATalyst drawer that lands on the canvas behind it,
// Preview as a page, and Publish. Every drawer state is axe clean, every target is at
// least 44px, nothing scrolls sideways; at 768px the full builder is back in the same
// tab. The second journey (F45) works the drawers: Media with its card and editors,
// the picker as a bottom sheet, and CATalyst through Peek and Half.

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");
const PHOTO = "A tabby cat on a windowsill., cat-1.jpg";

async function draftOf(id: string): Promise<{ name: string; blocks: { type: string }[] }> {
  return JSON.parse(await readFile(resolve(PROFILES_DIR, id, "draft.json"), "utf8"));
}

/** Every visible control's laid-out size, with its name, so a failure says which one is short. */
async function controlBoxes(
  page: Page,
): Promise<{ name: string; width: number; height: number }[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "button, a[href], input:not([type=file]):not([type=range]), select, textarea, [role=button]",
      ),
    )
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({
        name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "",
        width: el.offsetWidth,
        height: el.offsetHeight,
      })),
  );
}

/** The two phone floors at once: every target ≥ 44px, and no sideways scroll. */
async function phoneFloors(page: Page): Promise<void> {
  for (const box of await controlBoxes(page)) {
    expect(box.height, `${box.name} is ${box.height}px tall`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${box.name} is ${box.width}px wide`).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
}

function drawers(page: Page): Locator {
  return page.getByRole("navigation", { name: "Drawers" });
}

test("a volunteer builds, edits, themes, previews and publishes a cat from a phone", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.context().setExtraHTTPHeaders({ "x-fake-scenario": "phone-edits" });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole("button", { name: "New cat", exact: true }).click();
  await expect(page).toHaveURL(/\/builder\/[a-z2-7]{8}$/);
  const id = new URL(page.url()).pathname.split("/").pop() ?? "";

  // The chrome: the viewport lets the keyboard shrink the page; no preview, no old label.
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /interactive-widget=resizes-content/,
  );
  await expect(page.getByText("CANVAS · phone 390")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Add section" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Drag to reorder" })).toHaveCount(0);
  await expect(drawers(page).getByRole("button", { name: "Media" })).toBeVisible();
  await expect(drawers(page).getByRole("button", { name: "CATalyst" })).toBeVisible();
  await expect(page.getByRole("banner")).toHaveCSS("min-height", "58px");
  await runAxe(page);

  // Facts: open for a brand-new cat; filled, then folded to its one line.
  const facts = page.getByRole("region", { name: "Facts" });
  await facts.getByRole("textbox", { name: "Name" }).fill("Mabel Anders");
  await page.keyboard.press("Enter");
  await facts.getByRole("textbox", { name: "Age" }).fill("3 years");
  await page.keyboard.press("Enter");
  await facts.getByRole("combobox", { name: "Sex" }).selectOption("female");
  const h1 = page.getByRole("banner").getByRole("heading", { level: 1 });
  await expect(h1).toHaveText("Mabel Anders");
  // A twelve-letter name shows whole in the bar (review, finding 1): nothing truncated.
  await expect
    .poll(() => h1.evaluate((el) => el.scrollWidth <= el.clientWidth && el.clientWidth >= 100))
    .toBe(true);
  await facts.getByRole("button", { name: /^Facts/ }).click();
  await expect(facts.getByRole("button", { name: /^Facts/ })).toHaveText(
    /Facts.*Mabel Anders · 3 years · female/,
  );
  await expect(
    page.getByRole("region", { name: "Canvas" }).getByRole("link", { name: "All cats" }),
  ).toHaveAttribute("href", "/builder");
  await expect(facts.getByRole("textbox", { name: "Name" })).toHaveCount(0);

  // The Media drawer: a Full sheet; an upload joins the grid; Escape closes it and hands
  // focus back to its tab.
  await drawers(page).getByRole("button", { name: "Media" }).click();
  // The sheet is named by its count, which the upload changes: reach it by role alone.
  const media = page.getByRole("dialog");
  await expect(media).toHaveAccessibleName("Media · 0 items");
  await expect(media.getByRole("button", { name: "Close" })).toBeFocused();
  // Slid up over `panel` (design §3), and once the slide has landed, sitting under the
  // 58px top bar.
  expect(await media.evaluate((el) => getComputedStyle(el).animationName)).toBe("sheet-in");
  await expect
    .poll(() => media.evaluate((el) => Math.round(el.getBoundingClientRect().top)))
    .toBe(58);
  await media.locator("input[type=file]").setInputFiles(fixture("cat-1.jpg"));
  await expect(media.getByRole("button", { name: PHOTO })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("dialog", { name: "Media · 1 item" })).toBeVisible();
  await runAxe(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(drawers(page).getByRole("button", { name: "Media" })).toBeFocused();

  // The hero takes the photo from its own slot: the whole striped face is the button.
  await frame(page, /^HERO/).getByRole("button", { name: "Add a photo" }).click();
  await pick(page, PHOTO, "Use photo");
  await expect(frame(page, /^HERO/).getByRole("img", { name: /tabby cat/ })).toBeVisible();

  // Two sections from the picker sheet, then the bio edited in place.
  await page.getByRole("button", { name: "+ add section" }).click();
  await page
    .getByRole("dialog", { name: "Add a section" })
    .locator("[data-section-option=bio]")
    .click();
  await page.getByRole("button", { name: "+ add section" }).click();
  await page
    .getByRole("dialog", { name: "Add a section" })
    .locator("[data-section-option=gallery]")
    .click();
  expect(await order(page)).toEqual(["hero", "bio", "gallery"]);
  const bio = frame(page, /^BIO/).getByRole("textbox", { name: "Bio" });
  await bio.click();
  await bio.pressSequentially("Small, loud, decided.");
  await draftSaved(page);
  await expect.poll(() => draftOf(id)).toMatchObject({ name: "Mabel Anders" });

  // `↓` on the phone label row moves the bio under the gallery, keeps focus, and keeps
  // the moved row in view between the bars (review, finding 4).
  await frame(page, /^BIO/).getByRole("button", { name: "Move down" }).click();
  expect(await order(page)).toEqual(["hero", "gallery", "bio"]);
  const down = frame(page, /^BIO/).getByRole("button", { name: "Move down" });
  await expect(down).toBeFocused();
  await expect
    .poll(() =>
      down.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const band = document.querySelector("main")?.getBoundingClientRect();
        // `nearest` lands the row on the band's edge to the subpixel: round both.
        return (
          band !== undefined &&
          Math.round(box.top) >= Math.round(band.top) &&
          Math.round(box.bottom) <= Math.round(band.bottom)
        );
      }),
    )
    .toBe(true);
  await expect(frame(page, /^BIO/).getByRole("button", { name: "Move down" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // `remove` asks first; the section leaves; focus lands on the add tile.
  await frame(page, /^GALLERY/)
    .getByRole("button", { name: "remove" })
    .click();
  await page
    .getByRole("dialog", { name: /^Remove/ })
    .getByRole("button", { name: "Remove section" })
    .click();
  expect(await order(page)).toEqual(["hero", "bio"]);
  await expect(page.getByRole("button", { name: "+ add section" })).toBeFocused();

  // Theme: folded to one line; Sand from the swatches, and the AA line.
  const theme = page.getByRole("region", { name: "Theme" });
  await expect(theme.getByRole("button", { name: /^Theme/ })).toHaveText(
    /Paper · warmth 0\.50 · contrast 0\.50/,
  );
  await theme.getByRole("button", { name: /^Theme/ }).click();
  await theme.getByRole("radio", { name: "Sand" }).click();
  await expect(theme.getByRole("button", { name: /^Theme/ })).toHaveText(/Sand · warmth/);
  await expect(theme.getByRole("status")).toHaveText(/contrast check: passes AA/);
  await phoneFloors(page);
  await runAxe(page);
  await theme.getByRole("button", { name: /^Theme/ }).click();

  // F45: a bio chip sends from the canvas and the CATalyst drawer peeks — the 48px bar
  // on the bottom bar with the working sentence, then the receipt; the chip is back
  // once the turn ends, and the peek is a tap from Full.
  const rewrite = frame(page, /^BIO/).getByRole("button", { name: "rewrite" });
  await rewrite.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const peek = page.getByRole("button", { name: "open CATalyst" });
  await expect(peek).toHaveCSS("height", "48px");
  await expect(rewrite).toBeEnabled({ timeout: 15_000 });
  await expect(peek).toHaveText(/^Applied — added photo section\./);
  expect(await order(page)).toEqual(["hero", "bio", "photo"]);
  await runAxe(page);

  // The CATalyst drawer from the peek: Full. A destructive request (`phone-edits`' turn
  // 2 removes the quote) drops it to Peek on send, and the card raises Half — a region,
  // the canvas above it, the bottom bar under it; Apply drops to Peek, and the receipt
  // is the peek's line once the turn ends. Close from Full is Peek, focus on the bar.
  await page.getByRole("button", { name: "+ add section" }).click();
  await page
    .getByRole("dialog", { name: "Add a section" })
    .locator("[data-section-option=quote]")
    .click();
  expect(await order(page)).toEqual(["hero", "bio", "photo", "quote"]);
  await peek.click();
  const helper = page.getByRole("dialog", { name: "CATalyst AI Assistant" });
  await expect(helper).toBeVisible();
  await expect(helper.getByText("Added a photo section about her favourite box.")).toBeVisible();
  await helper.getByPlaceholder("Ask for a change…").fill("remove the quote");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const half = page.getByRole("region", { name: "CATalyst AI Assistant" });
  await expect(half).toBeVisible({ timeout: 15_000 });
  await expect(half).not.toHaveAttribute("aria-modal", "true");
  await expect(half.getByText("Proposed · 1 operation")).toBeVisible();
  // Half the window, in the flow: the canvas keeps the band above it, the bar sits under it.
  await expect
    .poll(() => half.evaluate((el) => Math.round(el.getBoundingClientRect().height)))
    .toBe(422);
  expect(
    await page.locator("main").evaluate((el) => Math.round(el.getBoundingClientRect().bottom)),
  ).toBe(364);
  // F60: the card names the quote (the block `remove the quote` would take), and the
  // canvas has already revealed it — centre inside the band above the sheet — before
  // Apply is ever pressed, the same way it would once the removal actually lands.
  const quoteFrame = frame(page, /^QUOTE/);
  await expect
    .poll(async () => {
      const box = await quoteFrame.boundingBox();
      return box === null ? null : box.y + box.height / 2;
    })
    .toBeLessThan(364);
  await expect(drawers(page).getByRole("button", { name: "CATalyst" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await runAxe(page);
  await half.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("region", { name: "CATalyst AI Assistant" })).toHaveCount(0);
  await expect(peek).toHaveText(/^Applied — removed quote\./, { timeout: 15_000 });
  expect(await order(page)).toEqual(["hero", "bio", "photo"]);
  await runAxe(page);
  await peek.click();
  await expect(helper.getByRole("button", { name: "Undo these" })).toBeVisible();
  await helper.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(peek).toBeFocused();
  await phoneFloors(page);

  // Preview is a page.
  await page.getByRole("banner").getByRole("link", { name: "Preview" }).click();
  await expect(page).toHaveURL(`/builder/${id}/preview`);
  await expect(page.getByRole("heading", { level: 1, name: "Mabel Anders" })).toBeVisible();
  await page.getByRole("link", { name: "Back to the builder" }).click();
  await expect(page).toHaveURL(`/builder/${id}`);

  // Publish from the topbar; the Published menu opens with the save line as its note.
  await page.getByRole("banner").getByRole("button", { name: "Publish" }).click();
  const question = page.getByRole("dialog", { name: "The text may be hard to read." });
  if (
    await question.waitFor({ state: "visible", timeout: 1500 }).then(
      () => true,
      () => false,
    )
  ) {
    await question.getByRole("button", { name: "Publish anyway" }).click();
  }
  await expect(page.getByRole("status").filter({ hasText: /is live at/ })).toBeVisible({
    timeout: 15_000,
  });
  // The compact trigger: `● Live` — the dot with one short word (F55 amends F44); the
  // name still whole.
  const published = page.getByRole("banner").getByRole("button", { name: "Live" });
  await expect(published).toHaveText("Live");
  await expect
    .poll(() => h1.evaluate((el) => el.scrollWidth <= el.clientWidth && el.clientWidth >= 100))
    .toBe(true);
  await published.click();
  const menu = page.getByRole("menu", { name: "Live" });
  await expect(menu).toBeVisible();
  // The note is the popover's first line, above the menu — the topbar's own status is
  // for the screen reader alone.
  await expect(menu.locator("xpath=..").locator("p").first()).toHaveText(/^Draft saved/);
  await expect(page.getByRole("banner").getByRole("status").locator(".sr-only")).toHaveText(
    /^Draft saved/,
  );
  await runAxe(page);
  await page.getByRole("menuitem", { name: "Unpublish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to draft" }).click();
  await expect(page.getByRole("banner").getByRole("button", { name: "Publish" })).toBeVisible();

  // The boundary: 768px is the full builder, in the same tab.
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.getByRole("region", { name: "Add section" })).toBeVisible();
  await expect(drawers(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Drag to reorder" }).first()).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 720 });
  await deleteCat(page, "Mabel Anders");
});

// F45 (design §5, §8): the drawers. The Media drawer — Upload first, two photos and a
// clip in, the clip trimmed from its card (the trim editor over the drawer, focus back on
// the card), the hero placed from its slot's picker as a bottom sheet, the enhance
// compare over the drawer at 390; then CATalyst on the `build-proposal` scenario — the
// interview's questions raise Half, the proposal's yes builds behind the peek with the
// canvas following, the receipt on the line; landscape (844×390) gets the same
// one-column builder and is checked once. axe is clean in every drawer state.
test("a volunteer works the Media and CATalyst drawers from a phone", async ({ page }) => {
  test.setTimeout(300_000);
  await page.context().setExtraHTTPHeaders({ "x-fake-scenario": "build-proposal" });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole("button", { name: "New cat", exact: true }).click();
  await expect(page).toHaveURL(/\/builder\/[a-z2-7]{8}$/);
  const facts = page.getByRole("region", { name: "Facts" });
  await facts.getByRole("textbox", { name: "Name" }).fill("Ines Tabby");
  await page.keyboard.press("Enter");
  await facts.getByRole("textbox", { name: "Age" }).fill("4 years");
  await page.keyboard.press("Enter");
  await facts.getByRole("combobox", { name: "Sex" }).selectOption("female");
  await facts.getByRole("button", { name: /^Facts/ }).click();

  // The Media drawer: Upload is the first control, a 44px row above the grid.
  await drawers(page).getByRole("button", { name: "Media" }).click();
  const media = page.getByRole("dialog");
  const upload = media.getByRole("button", { name: "Add photos or video" });
  await expect(upload).toHaveCSS("height", "44px");
  expect(
    await upload.evaluate(
      (el) => el.compareDocumentPosition(el.closest("aside")!.querySelector("ul")!) & 4,
    ),
  ).toBeTruthy();
  await media
    .locator("input[type=file]")
    .setInputFiles([fixture("cat-1.jpg"), fixture("cat-2.jpg"), fixture("clip-20s.mp4")]);
  await expect(media.getByRole("button", { name: PHOTO })).toBeVisible({ timeout: 90_000 });
  const needsTrim = media.getByRole("button", { name: "clip-20s.mp4, needs a trim" });
  await expect(needsTrim).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("dialog", { name: "Media · 3 items" })).toBeVisible();

  // Trim from the drawer: the card's Trim opens the editor over the sheet; Escape
  // closes the editor alone and hands focus back to the card; the cut lands.
  await needsTrim.click();
  const clipCard = media.getByRole("group", { name: /clip-20s/ });
  const trim = clipCard.getByRole("button", { name: "Trim", exact: true });
  await trim.click();
  const editor = page.getByRole("dialog", { name: /^That clip is 0:20/ });
  await expect(editor).toBeVisible();
  await runAxe(page);
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Media · 3 items" })).toBeVisible();
  await expect(trim).toBeFocused();
  await trim.click();
  await editor.getByRole("button", { name: "Use this stretch" }).click();
  await expect(editor).toHaveCount(0);
  await expect(media.getByRole("button", { name: /clip-20s\.mp4, 0:1[45]$/ })).toBeVisible({
    timeout: 90_000,
  });
  await runAxe(page);
  // Escape with the clip's card open closes the card alone (review round 1, finding 1):
  // the sheet stays, focus on the tile; the next Escape is the sheet's.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(media.getByRole("group")).toHaveCount(0);
  await expect(media.getByRole("button", { name: /clip-20s\.mp4, 0:1[45]$/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The hero from its slot: the picker is a bottom sheet; choosing fills the slot.
  await frame(page, /^HERO/).getByRole("button", { name: "Add a photo" }).click();
  const picker = page.getByRole("dialog", { name: "Pick a photo" });
  expect(await picker.evaluate((el) => getComputedStyle(el).animationName)).toBe("sheet-in");
  await expect
    .poll(() => picker.evaluate((el) => Math.round(el.getBoundingClientRect().bottom)))
    .toBe(844);
  await runAxe(page);
  await pick(page, PHOTO, "Use photo");
  await expect(frame(page, /^HERO/).getByRole("img", { name: /tabby cat/ })).toBeVisible();

  // Enhance… from the placed photo's card: the compare over the drawer, at 390; Keep
  // original leaves the hero and hands focus back to the card's action.
  await drawers(page).getByRole("button", { name: "Media" }).click();
  await media.getByRole("button", { name: PHOTO }).click();
  const photoCard = media.getByRole("group", { name: /cat-1\.jpg/ });
  await expect(photoCard.getByText("On the page · hero")).toBeVisible();
  const enhance = photoCard.getByRole("button", { name: "Enhance…" });
  await enhance.click();
  const compare = page.getByRole("dialog", { name: "Use the enhanced photo in the hero?" });
  await expect(compare).toBeVisible({ timeout: 60_000 });
  await runAxe(page);
  await compare.getByRole("button", { name: "Keep original" }).click();
  await expect(compare).toHaveCount(0);
  await expect(enhance).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Media · 4 items" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The delete refusal (FR-076) shows in the builder's one toast stack, above the open
  // sheet (review round 1, finding 2): publish, then ask the drawer to remove the hero's
  // photo.
  await page.getByRole("banner").getByRole("button", { name: "Publish" }).click();
  const contrast = page.getByRole("dialog", { name: "The text may be hard to read." });
  if (
    await contrast.waitFor({ state: "visible", timeout: 1500 }).then(
      () => true,
      () => false,
    )
  ) {
    await contrast.getByRole("button", { name: "Publish anyway" }).click();
  }
  await expect(page.getByRole("status").filter({ hasText: /is live at/ })).toBeVisible({
    timeout: 15_000,
  });
  await drawers(page).getByRole("button", { name: "Media" }).click();
  await media.getByRole("button", { name: PHOTO, exact: true }).click();
  await media.getByRole("button", { name: "Remove cat-1.jpg" }).click();
  await page
    .getByRole("dialog", { name: /^Remove cat-1/ })
    .getByRole("button", { name: "Remove" })
    .click();
  const refusal = page
    .getByRole("alert")
    .filter({ hasText: /uses this photo\. Unpublish first\./ });
  await expect(refusal).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Media · 4 items" })).toBeVisible();
  // Above the scrim: the point at the toast's centre hits the toast, not the sheet.
  expect(
    await refusal.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return el.contains(hit);
    }),
  ).toBe(true);
  await refusal.getByRole("button", { name: "Dismiss" }).click();
  await runAxe(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("banner").getByRole("button", { name: "Live" }).click();
  await page.getByRole("menuitem", { name: "Unpublish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to draft" }).click();
  await expect(page.getByRole("banner").getByRole("button", { name: "Publish" })).toBeVisible();

  // CATalyst: `Build the page` from Full drops to Peek; each question raises Half with
  // the composer; the proposal's yes builds behind the peek — the blocks land and the
  // canvas follows — and the receipt is the line.
  await drawers(page).getByRole("button", { name: "CATalyst" }).click();
  const full = page.getByRole("dialog", { name: "CATalyst AI Assistant" });
  await full.getByRole("button", { name: "Build the page" }).click();
  await expect(full).toHaveCount(0);
  const half = page.getByRole("region", { name: "CATalyst AI Assistant" });
  await expect(half.getByText("What's her personality like")).toBeVisible({ timeout: 15_000 });
  await runAxe(page);
  await half.getByPlaceholder("Ask for a change…").fill("Confident and a little bossy.");
  await page.keyboard.press("Enter");
  await expect(half.getByText("Does she get along with other cats")).toBeVisible({
    timeout: 15_000,
  });
  await half.getByPlaceholder("Ask for a change…").fill("She's an only cat, no other pets.");
  await page.keyboard.press("Enter");
  await expect(half.getByText("Want me to build this now?")).toBeVisible({ timeout: 15_000 });
  // Close on Half is Peek, with the question as its line and focus on the bar.
  await half.getByRole("button", { name: "Close" }).click();
  await expect(half).toHaveCount(0);
  const peek = page.getByRole("button", { name: "open CATalyst" });
  await expect(peek).toHaveText(/Want me to build this now\?/);
  await expect(peek).toBeFocused();
  await runAxe(page);
  await peek.click();
  await full.getByPlaceholder("Ask for a change…").fill("Yes, build it.");
  await page.keyboard.press("Enter");
  await expect(full).toHaveCount(0);
  await expect(page.locator("[data-block-type]")).toHaveCount(5, { timeout: 30_000 });
  await expect(peek).toHaveText(/^Applied — added bio, gallery, .* set theme Sand\./, {
    timeout: 15_000,
  });
  expect(await order(page)).toEqual(["hero", "bio", "gallery", "needs", "quote"]);
  // F34: the canvas followed and returned to the first block the turn added — the bio
  // is in the band between the bars.
  await expect
    .poll(() =>
      frame(page, /^BIO/).evaluate((el) => {
        const box = el.getBoundingClientRect();
        const band = document.querySelector("main")!.getBoundingClientRect();
        return box.bottom > band.top && box.top < band.bottom;
      }),
    )
    .toBe(true);
  await phoneFloors(page);
  await runAxe(page);

  // The peek can be put away (F45 addendum): `Hide CATalyst` closes it, the tab takes
  // focus, and the next turn brings it back on its own.
  await page.getByRole("button", { name: "Hide CATalyst" }).click();
  await expect(peek).toHaveCount(0);
  await expect(drawers(page).getByRole("button", { name: "CATalyst" })).toBeFocused();
  await drawers(page).getByRole("button", { name: "CATalyst" }).click();
  await full.getByPlaceholder("Ask for a change…").fill("Thanks.");
  await page.keyboard.press("Enter");
  await expect(peek).toBeVisible();
  await expect(peek).toHaveCSS("height", "48px");

  // Landscape: the same one-column builder, the peek still on the bar.
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(drawers(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Add section" })).toHaveCount(0);
  await expect(peek).toHaveCSS("height", "48px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
  await runAxe(page);

  await page.setViewportSize({ width: 1280, height: 720 });
  await deleteCat(page, "Ines Tabby");
});

/** A bio long enough that its diff against `text-proposals`'s rewrite folds. */
const LONG_BIO =
  "Olive came to us in March after her owner moved away and could not take her. She is a " +
  "three-year-old tabby who follows you from room to room just to be near you and curls up " +
  "on your lap the second you sit. She is not a lap cat who demands it; she waits. She gets " +
  "along fine with the dog and has never once scratched the sofa.";

/** Apply and Not this both wholly inside the window as the card lands — the panel brings
 * the newest thing into view itself, so this polls; nothing here scrolls. */
async function decisionInView(sheet: Locator): Promise<void> {
  await expect(sheet.getByRole("button", { name: "Apply" })).toBeInViewport({ ratio: 1 });
  await expect(sheet.getByRole("button", { name: "Not this" })).toBeInViewport({ ratio: 1 });
}

// F58 (design §4): a card whose change would put Apply under the Half sheet's fold —
// any card that draws a change block — opens the drawer to Full, so the change and the
// decision are in view together without scrolling; Apply drops it to Peek. On
// `text-proposals`: the bio card (its word diff folds behind `Show the full text`) and
// the tagline card (two lines) both open Full, at the shortest common phone window and
// at a tall one, with Apply and Not this wholly inside the window either way.
for (const height of [664, 844]) {
  test(`at 390×${height} the bio and tagline cards open Full with Apply and Not this in view; Apply drops to Peek`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.context().setExtraHTTPHeaders({ "x-fake-scenario": "text-proposals" });
    await page.setViewportSize({ width: 390, height });
    await signIn(page);
    await page.getByRole("button", { name: "New cat", exact: true }).click();
    await expect(page).toHaveURL(/\/builder\/[a-z2-7]{8}$/);
    const facts = page.getByRole("region", { name: "Facts" });
    await facts.getByRole("textbox", { name: "Name" }).fill("Olive");
    await page.keyboard.press("Enter");
    await facts.getByRole("textbox", { name: "Tagline" }).fill("A negotiator, not a complainer.");
    await page.keyboard.press("Enter");
    await facts.getByRole("button", { name: /^Facts/ }).click();
    await draftSaved(page);

    // One photo, so the helper is unlocked; then the long bio.
    await drawers(page).getByRole("button", { name: "Media" }).click();
    const media = page.getByRole("dialog");
    await media.locator("input[type=file]").setInputFiles(fixture("cat-1.jpg"));
    await expect(media.getByRole("button", { name: PHOTO })).toBeVisible({ timeout: 90_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "+ add section" }).click();
    await page
      .getByRole("dialog", { name: "Add a section" })
      .locator("[data-section-option=bio]")
      .click();
    const bio = frame(page, /^BIO/).getByRole("textbox", { name: "Bio" });
    await bio.click();
    await bio.pressSequentially(LONG_BIO);
    await expect(bio).toHaveText(LONG_BIO);

    // The bio card: Full, the diff folded, the decision inside the window.
    await drawers(page).getByRole("button", { name: "CATalyst" }).click();
    const full = page.getByRole("dialog", { name: "CATalyst AI Assistant" });
    await full.getByPlaceholder("Ask for a change…").fill("Make the bio read better.");
    await page.keyboard.press("Enter");
    await expect(full.getByText("Proposed · 1 operation")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "CATalyst AI Assistant" })).toHaveCount(0);
    await expect(full.getByText("Shorten the bio.")).toBeVisible();
    await expect(full.locator("[data-diff] del", { hasText: "came to us in March" })).toBeVisible();
    await expect(full.getByRole("button", { name: "Show the full text" })).toBeVisible();
    await decisionInView(full);
    await runAxe(page);
    await full.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const peek = page.getByRole("button", { name: "open CATalyst" });
    await expect(peek).toHaveText(/^Applied — /, { timeout: 15_000 });
    await expect(bio).toHaveText(/^Charlotte is a tabby/);

    // The tagline card: two lines, Full too — at 664 even those put Apply under Half's fold.
    await peek.click();
    await full.getByPlaceholder("Ask for a change…").fill("Give her a better tagline.");
    await page.keyboard.press("Enter");
    await expect(full.getByText("Proposed · 1 operation")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "CATalyst AI Assistant" })).toHaveCount(0);
    await expect(full.locator("del", { hasText: "A negotiator, not a complainer." })).toBeVisible();
    await expect(full.locator("ins", { hasText: "Follows you room to room" })).toBeVisible();
    await decisionInView(full);
    await runAxe(page);
    await full.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(peek).toHaveText(/^Applied — /, { timeout: 15_000 });

    await page.setViewportSize({ width: 1280, height: 720 });
    await deleteCat(page, "Olive");
  });
}
