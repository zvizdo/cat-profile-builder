import { expect, test, type Locator, type Page } from "@playwright/test";
import { deleteCat, draftSaved, fixture, frame, pick, runAxe, signIn } from "./_lib";

// F59 (the memo's §3, "image changes"), split out of `phone-builder.spec.ts` (review
// round 1, S3 — that file was already over the 400-line ceiling before this task and
// grew further): a `replace_image` or a `remove_block` with a face draws a change block
// exactly as F58's text edits do (measured: at 390×664 two full alt-text lines under
// each 56px face put Apply the same distance under Half's fold a long bio diff does),
// so `PhoneBuilder.tsx`'s `useOpensFull` answers yes for these too — Full, at the
// shortest common phone window and at a tall one, Apply and Not this both in view
// either way. `drawers`/`decisionInView` are duplicated from `phone-builder.spec.ts`
// rather than shared, per the review's own suggestion — each is a few lines.

const PHOTO = "A tabby cat on a windowsill., cat-1.jpg";
const PHOTO_2 = "A tabby cat on a windowsill., cat-2.jpg";

function drawers(page: Page): Locator {
  return page.getByRole("navigation", { name: "Drawers" });
}

/** Apply and Not this both wholly inside the window as the card lands — the panel brings
 * the newest thing into view itself, so this polls; nothing here scrolls. */
async function decisionInView(sheet: Locator): Promise<void> {
  await expect(sheet.getByRole("button", { name: "Apply" })).toBeInViewport({ ratio: 1 });
  await expect(sheet.getByRole("button", { name: "Not this" })).toBeInViewport({ ratio: 1 });
}

for (const height of [664, 844]) {
  test(`at 390×${height} a hero swap and a removal with a face open Full with Apply and Not this in view`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.context().setExtraHTTPHeaders({ "x-fake-scenario": "image-proposals" });
    await page.setViewportSize({ width: 390, height });
    await signIn(page);
    await page.getByRole("button", { name: "New cat", exact: true }).click();
    await expect(page).toHaveURL(/\/builder\/[a-z2-7]{8}$/);
    const facts = page.getByRole("region", { name: "Facts" });
    await facts.getByRole("textbox", { name: "Name" }).fill("Sable");
    await page.keyboard.press("Enter");
    await facts.getByRole("button", { name: /^Facts/ }).click();

    await drawers(page).getByRole("button", { name: "Media" }).click();
    const media = page.getByRole("dialog");
    await media
      .locator("input[type=file]")
      .setInputFiles([fixture("cat-1.jpg"), fixture("cat-2.jpg")]);
    await expect(media.getByRole("button", { name: PHOTO })).toBeVisible({ timeout: 90_000 });
    await expect(media.getByRole("button", { name: PHOTO_2 })).toBeVisible({ timeout: 90_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await frame(page, /^HERO/).getByRole("button", { name: "Add a photo" }).click();
    await pick(page, PHOTO, "Use photo");

    await page.getByRole("button", { name: "+ add section" }).click();
    await page
      .getByRole("dialog", { name: "Add a section" })
      .locator("[data-section-option=quote]")
      .click();
    const quote = frame(page, /^QUOTE/);
    await quote.getByRole("button", { name: "Add a photo" }).click();
    await pick(page, PHOTO, "Use photo");
    await quote.getByRole("textbox", { name: "Quote" }).fill("She purrs at the kettle.");
    await page.keyboard.press("Enter");
    await draftSaved(page);

    // The hero swap: two faces, Full, the decision inside the window.
    await drawers(page).getByRole("button", { name: "CATalyst" }).click();
    const full = page.getByRole("dialog", { name: "CATalyst AI Assistant" });
    await full.getByPlaceholder("Ask for a change…").fill("Give her a better hero photo.");
    await page.keyboard.press("Enter");
    await expect(full.getByText("Proposed · 1 operation")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "CATalyst AI Assistant" })).toHaveCount(0);
    await expect(full.getByRole("img")).toHaveCount(2);
    await decisionInView(full);
    await runAxe(page);
    await full.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const peek = page.getByRole("button", { name: "open CATalyst" });
    await expect(peek).toHaveText(/^Applied — /, { timeout: 15_000 });

    // The removal: the struck line and its own face, Full too.
    await peek.click();
    await full.getByPlaceholder("Ask for a change…").fill("Remove the quote.");
    await page.keyboard.press("Enter");
    await expect(full.getByText("Proposed · 1 operation")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "CATalyst AI Assistant" })).toHaveCount(0);
    await expect(full.locator("del", { hasText: "She purrs at the kettle." })).toBeVisible();
    await expect(full.getByRole("img")).toHaveCount(1);
    await decisionInView(full);
    await runAxe(page);
    await full.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(peek).toHaveText(/^Applied — /, { timeout: 15_000 });

    await page.setViewportSize({ width: 1280, height: 720 });
    await deleteCat(page, "Sable");
  });
}
