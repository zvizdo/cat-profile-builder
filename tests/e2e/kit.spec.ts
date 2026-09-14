import { expect, test } from "@playwright/test";
import { runAxe } from "./_lib";

// The component sheet against the production build. It is served only because the web
// server in playwright.config.ts sets KIT_ENABLED=1; nothing else ever does.

test("/kit renders every group, passes axe, and Tab reaches every button in DOM order", async ({
  page,
}) => {
  await page.goto("/kit");
  await expect(page.getByRole("heading", { level: 1, name: "Kit" })).toBeVisible();
  for (const caption of ["Buttons", "Fields", "Badges", "Empty slots", "Icon buttons"]) {
    await expect(page.getByRole("region", { name: caption, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("alert").filter({ hasText: "Upload failed." })).toContainText(
    "Upload failed. Nothing was added.",
  );

  await runAxe(page);

  // Every enabled button and field on the sheet, in DOM order. Tab must visit exactly
  // these, in exactly this order; a name is the aria-label, else the id, else the text.
  const expected = [
    "Publish",
    "Preview",
    "Skip for now",
    "Remove section",
    "kit-name",
    "kit-fee",
    "+ add section",
    "Undo",
    "Move up",
    "Move down",
    "Duplicate",
    "Remove section",
    "Previous cat",
    "Pause",
    "Next cat",
    "Undo",
    "Dismiss",
    "Use anyway",
    "Dismiss",
    "Try again",
    "Dismiss",
    "Show a toast in the region",
    "Remove section",
  ];
  const inDom = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"),
    ).map((el) => el.getAttribute("aria-label") || el.id || el.textContent?.trim() || ""),
  );
  expect(inDom).toEqual(expected);
  const seen: string[] = [];
  for (let i = 0; i < expected.length; i++) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el?.getAttribute("aria-label") || el?.id || el?.textContent?.trim() || "";
      }),
    );
  }
  expect(seen).toEqual(expected);
});

test("the modal traps focus, Escape presses the safe button and focus returns", async ({
  page,
}) => {
  await page.goto("/kit");
  const opener = page.getByRole("region", { name: /^Modal/ }).getByRole("button", {
    name: "Remove section",
  });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Remove the gallery?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Remove section" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Remove section" })).toBeFocused();

  await runAxe(page);

  // A scrim click changes nothing: Escape still answers "Keep it" and focus still returns.
  await page.mouse.click(10, 10);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  // After a scrim click, Shift+Tab lands inside the dialog, never on the page behind.
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.mouse.click(10, 10);
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Remove section" })).toBeFocused();
  await page.mouse.click(10, 10);
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
