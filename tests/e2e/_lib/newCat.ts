import { expect, type Page } from "@playwright/test";

// A fresh draft from the list's `New cat` button (FR-005): the builder opens at
// `/builder/{id}` and the id is what the journeys read the store by.

/** Creates a cat from the list and answers its profile id. */
export async function newCat(page: Page): Promise<string> {
  await page.getByRole("button", { name: "New cat", exact: true }).click();
  await expect(page).toHaveURL(/\/builder\/[a-z2-7]{8}$/);
  return new URL(page.url()).pathname.split("/").pop() ?? "";
}
