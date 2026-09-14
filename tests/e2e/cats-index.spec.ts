import { expect, test } from "@playwright/test";
import { runAxe } from "./_lib";

test("the root sends visitors to the public index, which is accessible", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/cats$/);
  await expect(page.getByRole("main")).toContainText("No cats are listed yet. Check back soon.");

  await runAxe(page);
});
