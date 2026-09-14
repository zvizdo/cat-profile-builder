import { expect, type Page } from "@playwright/test";

// The one way every journey gets in (FR-001): `/builder` sends a signed-out visitor to
// the sign-in page; the fixture credentials from playwright.config.ts land on the list.

export const USERNAME = "volunteer";
export const PASSWORD = "catsarecool";

/** Signs the volunteer in from `/builder` and waits for the list. */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/builder");
  await page.getByRole("textbox", { name: "Username" }).fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/builder");
}
