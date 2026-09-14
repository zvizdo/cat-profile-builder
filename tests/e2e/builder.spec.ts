import { chmod, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { order, runAxe, signIn } from "./_lib";
import { E2E_DATA_DIR } from "./global-setup";

// The builder shell journey (T024; FR-021, FR-022, FR-023, FR-024, FR-025) against the
// production build over the filesystem store: four sections from the rail, a keyboard
// Move up that keeps focus, an order that survives a reload, three undos and three redos
// from the keyboard, the draft on disk within five seconds, an edit that survives a tab
// closed at once, and axe clean on the full shell. The cat is deleted at the end so the
// list journey starts clean.

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");

function frames(page: Page): Locator {
  return page.locator("[data-block-type]");
}

async function blocksOnDisk(id: string): Promise<string[]> {
  const raw = await readFile(resolve(PROFILES_DIR, id, "draft.json"), "utf8");
  const doc: { blocks: { type: string }[] } = JSON.parse(raw);
  return doc.blocks.map((block) => block.type);
}

test("a volunteer builds a stack, reorders it from the keyboard, undoes, and loses nothing on close", async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "New cat", exact: true }).click();
  await expect(page).toHaveURL(/\/builder\/[a-z2-7]{8}$/);
  const id = new URL(page.url()).pathname.split("/").pop() ?? "";
  await expect(page).toHaveTitle(/Unnamed cat · Builder/);
  await expect(page.getByRole("banner")).toHaveCSS("min-height", "58px");

  // Three more sections from the rail; the hero is already on the page (F1: mandatory,
  // fixed at the top of every profile) and is never one of the rail's tiles.
  const rail = page.getByRole("region", { name: "Add section" });
  await expect(rail.getByRole("button", { name: "Hero" })).toHaveCount(0);
  await rail.getByRole("button", { name: "Bio" }).click();
  await rail.getByRole("button", { name: "Gallery" }).click();
  await rail.getByRole("button", { name: "Video", exact: true }).click();
  expect(await order(page)).toEqual(["hero", "bio", "gallery", "video"]);
  await expect(page.getByRole("region", { name: "HERO · full-bleed photo + name" })).toBeVisible();
  await runAxe(page);

  // Move up from the keyboard: the order changes and focus stays on the button.
  const video = page.getByRole("region", { name: /VIDEO/ });
  const moveUp = video.getByRole("button", { name: "Move up" });
  await moveUp.focus();
  await page.keyboard.press("Enter");
  expect(await order(page)).toEqual(["hero", "bio", "video", "gallery"]);
  await expect(
    page.getByRole("region", { name: /VIDEO/ }).getByRole("button", { name: "Move up" }),
  ).toBeFocused();

  // The draft lands within five seconds and the order survives a reload.
  await expect(page.locator("header").getByRole("status")).toHaveText(/^Draft saved/, {
    timeout: 5000,
  });
  expect(await blocksOnDisk(id)).toEqual(["hero", "bio", "video", "gallery"]);
  await page.reload();
  await expect(frames(page)).toHaveCount(4);
  expect(await order(page)).toEqual(["hero", "bio", "video", "gallery"]);

  // Three more edits, undone and redone from the keyboard.
  await rail.getByRole("button", { name: "Photo", exact: true }).click();
  await rail.getByRole("button", { name: "Day" }).click();
  await rail.getByRole("button", { name: "Quote" }).click();
  await expect(frames(page)).toHaveCount(7);
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ControlOrMeta+z");
  expect(await order(page)).toEqual(["hero", "bio", "video", "gallery"]);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(frames(page)).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ControlOrMeta+z");
  await expect(frames(page)).toHaveCount(4);
  await expect(page.locator("header").getByRole("status")).toHaveText(/^Draft saved/, {
    timeout: 5000,
  });
  expect(await blocksOnDisk(id)).toEqual(["hero", "bio", "video", "gallery"]);

  // Remove asks first and names what leaves; Escape keeps.
  await page
    .getByRole("region", { name: /GALLERY/ })
    .getByRole("button", { name: "remove" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Remove the gallery?" });
  await expect(dialog).toContainText("One undo brings the section back.");
  await runAxe(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(frames(page)).toHaveCount(4);

  // An edit followed at once by a closed tab is still there when the cat is reopened.
  const tab = await context.newPage();
  await tab.goto(`/builder/${id}`);
  await expect(tab.locator("[data-block-type]")).toHaveCount(4);
  await tab
    .getByRole("region", { name: "Add section" })
    .getByRole("button", { name: "Needs" })
    .click();
  await expect(tab.locator("[data-block-type]")).toHaveCount(5);
  await tab.close();
  await expect
    .poll(() => blocksOnDisk(id), { timeout: 5000 })
    .toEqual(["hero", "bio", "video", "gallery", "needs"]);
  await page.reload();
  await expect(frames(page)).toHaveCount(5);

  // Storage down mid-edit: the page keeps the change and says so; once storage is back
  // and the tab is closed at once, the change is on disk (FR-024, FR-027).
  const folder = resolve(PROFILES_DIR, id);
  await chmod(folder, 0o555);
  try {
    const second = await context.newPage();
    await second.goto(`/builder/${id}`);
    await expect(second.locator("[data-block-type]")).toHaveCount(5);
    await second
      .getByRole("region", { name: "Add section" })
      .getByRole("button", { name: "Quote" })
      .click();
    await expect(second.locator("[data-block-type]")).toHaveCount(6);
    await expect(second.locator("header").getByRole("status")).toHaveText(
      "Couldn't save. Your change is kept here and will be sent again.",
      { timeout: 5000 },
    );
    expect(await blocksOnDisk(id)).toHaveLength(5);
    await chmod(folder, 0o755);
    await second.close();
  } finally {
    await chmod(folder, 0o755);
  }
  await expect
    .poll(() => blocksOnDisk(id), { timeout: 5000 })
    .toEqual(["hero", "bio", "video", "gallery", "needs", "quote"]);
  await page.reload();
  await expect(frames(page)).toHaveCount(6);

  // Leave the store as it was found: the list journey counts cats.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Unnamed cat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("add a Quote through the canvas tile by keyboard", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "New cat", exact: true }).click();
  await expect(page).toHaveURL(/\/builder\/[a-z2-7]{8}$/);

  // The tile opens the picker (F2), never the hero among its seven types; Escape closes
  // it and hands focus straight back to the tile.
  const tile = page.getByRole("button", { name: "+ add section" });
  await tile.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add a section" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^HERO/ })).toHaveCount(0);
  await runAxe(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(tile).toBeFocused();

  // Keyboard-only end to end: Enter on the tile, Tab then arrow down to Quote, Enter adds
  // it at the end and focuses its first control.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab"); // Cancel -> Bio, the first option
  for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowDown"); // Bio .. Quote
  await expect(dialog.getByRole("button", { name: /^QUOTE/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  expect(await order(page)).toEqual(["hero", "quote"]);
  await expect(
    page.getByRole("region", { name: /QUOTE/ }).getByRole("button", { name: "Pick a photo" }),
  ).toBeFocused();

  // The rail's tiles stay a second way in: a Bio after the Quote.
  await page
    .getByRole("region", { name: "Add section" })
    .getByRole("button", { name: "Bio" })
    .click();
  expect(await order(page)).toEqual(["hero", "quote", "bio"]);

  // Reload keeps the order.
  await expect(page.locator("header").getByRole("status")).toHaveText(/^Draft saved/, {
    timeout: 5000,
  });
  await page.reload();
  expect(await order(page)).toEqual(["hero", "quote", "bio"]);

  // Leave the store as it was found.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Unnamed cat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});
