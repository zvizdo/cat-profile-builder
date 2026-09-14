import { expect, test } from "@playwright/test";
import { runAxe } from "./_lib";

// The sign-in journey (FR-001, FR-003, FR-005, ADR-011) against the production build. The
// credentials are the fixtures in playwright.config.ts.

const MISMATCH = "That username and password don't match.";

test("the guard sends a signed-out visitor from /builder to the sign-in page, which is accessible", async ({
  page,
}) => {
  await page.goto("/builder");
  await expect(page).toHaveURL("/sign-in?next=/builder");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

  // The photo panel (hi-fi 4b): the mark, the design's photo and the zero sentence while
  // nothing is published (the store starts empty).
  await expect(page.getByRole("img", { name: "South County Cats" })).toBeVisible();
  await expect(page.getByText("No cats are on a page yet.")).toBeVisible();
  await expect(page.locator('img[src*="sign-in-fallback"]')).toBeVisible();

  await runAxe(page);
});

test("a wrong password shows exactly one sentence, the right one lands on /builder and stays signed in", async ({
  page,
}) => {
  await page.goto("/builder");

  await page.getByRole("textbox", { name: "Username" }).fill("volunteer");
  await page.getByLabel("Password").fill("wrong");
  await page.keyboard.press("Enter");
  const alert = page.locator("main").getByRole("alert");
  await expect(alert).toHaveText(MISMATCH);
  await expect(alert).toHaveCount(1);
  await expect(page).toHaveURL("/sign-in?next=/builder");
  await expect(page.getByRole("textbox", { name: "Username" })).toHaveValue("volunteer");

  await runAxe(page);

  await page.getByLabel("Password").fill("catsarecool");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/builder");
  await expect(page.getByRole("heading", { level: 1, name: "Cats" })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL("/builder");
  expect(await page.evaluate(() => document.cookie)).not.toContain("cpb_session");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
  await page.goto("/builder");
  await expect(page).toHaveURL("/sign-in?next=/builder");
});

test("an unknown username gets the same sentence as a wrong password", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Username" }).fill("nobody");
  await page.getByLabel("Password").fill("catsarecool");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(MISMATCH);
  await expect(page.locator("main")).not.toContainText(/username is|password is/i);
});

test("next is only ever a same-origin path", async ({ page }) => {
  await page.goto("/sign-in?next=https://evil.example");
  await page.getByRole("textbox", { name: "Username" }).fill("volunteer");
  await page.getByLabel("Password").fill("catsarecool");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/builder");
});

test("the API answers 401 with the one error shape when signed out", async ({ request }) => {
  const response = await request.get("/api/profiles/abcdefgh/draft");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({
    error: { code: "unauthorized", message: "Sign in to continue." },
  });
});
