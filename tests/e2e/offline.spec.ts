import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { newCat, runAxe, signIn } from "./_lib";
import { E2E_DATA_DIR } from "./global-setup";

// The offline journey (T027; FR-023, FR-024, FR-027; quickstart §1 step 12) against the
// production build: the connection drops, a bio edit shows the offline toast and stays
// on the page; the connection returns and the draft lands within five seconds; offline
// again, an edit, the tab closed, online, the cat reopened — `Restore unsaved changes?`
// is offered, Restore puts the edit on the canvas, and axe is clean on the prompt. The
// cat is deleted at the end so the list journey starts clean.

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");
const OFFLINE_TOAST =
  "You're offline. Your last change is saved here and will sync when you're back.";

async function draftOnDisk(id: string): Promise<string> {
  return readFile(resolve(PROFILES_DIR, id, "draft.json"), "utf8");
}

async function typeIntoBio(page: Page, text: string): Promise<void> {
  const bio = page.locator("[data-block-type=bio]").getByRole("textbox", { name: "Bio" });
  await bio.click();
  await page.keyboard.press("End");
  await bio.pressSequentially(text);
  await page.locator("main").click({ position: { x: 5, y: 5 } });
}

test("edits made offline sync when the connection returns, and a tab closed offline is offered back", async ({
  page,
  context,
}) => {
  await signIn(page);
  const id = await newCat(page);
  await page
    .getByRole("region", { name: "Add section" })
    .getByRole("button", { name: "Bio" })
    .click();
  await expect(page.locator("header").getByRole("status")).toHaveText(/^Draft saved/, {
    timeout: 5000,
  });

  // Offline: the edit stays on the page, the toast says so, and nothing reaches disk.
  await context.setOffline(true);
  await typeIntoBio(page, "Charlotte came in from a laundromat.");
  const toast = page.getByRole("status").filter({ hasText: OFFLINE_TOAST });
  await expect(toast).toBeVisible({ timeout: 8000 });
  await expect(page.locator("header").getByRole("status")).toHaveText(
    "Couldn't save. Your change is kept here and will be sent again.",
  );
  expect(await draftOnDisk(id)).not.toContain("laundromat");
  await runAxe(page);

  // Online: the retry lands within five seconds and the toast leaves.
  await context.setOffline(false);
  await expect(page.locator("header").getByRole("status")).toHaveText(/^Draft saved/, {
    timeout: 5000,
  });
  await expect(toast).toHaveCount(0);
  expect(await draftOnDisk(id)).toContain("laundromat");

  // Offline again, an edit in a second tab, the tab closed, online: the server never
  // saw the edit, the device did.
  const tab = await context.newPage();
  await tab.goto(`/builder/${id}`);
  await expect(tab.locator("[data-block-type=bio]")).toHaveCount(1);
  await context.setOffline(true);
  await typeIntoBio(tab, " Then the tab closed.");
  await expect(tab.getByRole("status").filter({ hasText: OFFLINE_TOAST })).toBeVisible({
    timeout: 8000,
  });
  await tab.close();
  await context.setOffline(false);
  expect(await draftOnDisk(id)).not.toContain("Then the tab closed");

  // Reopened: the prompt, Restore, the edit on the canvas, and then on disk.
  await page.goto(`/builder/${id}`);
  const dialog = page.getByRole("dialog", { name: "Restore unsaved changes?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "This cat has edits saved on this device that never reached the server.",
  );
  await expect(dialog.getByRole("button", { name: "Restore" })).toBeFocused();
  await runAxe(page);
  await dialog.getByRole("button", { name: "Restore" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-block-type=bio]")).toContainText("Then the tab closed.");
  await expect(page.getByRole("button", { name: "Undo" })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await expect(page.locator("header").getByRole("status")).toHaveText(/^Draft saved/, {
    timeout: 5000,
  });
  expect(await draftOnDisk(id)).toContain("Then the tab closed");

  // Reopened once more: the mirror is equal to the server's copy, so no prompt.
  await page.reload();
  await expect(page.locator("[data-block-type=bio]")).toContainText("Then the tab closed.");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Leave the store as it was found.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Unnamed cat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});
