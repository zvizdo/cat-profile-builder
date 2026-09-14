import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { runAxe, signIn } from "./_lib";
import { E2E_DATA_DIR } from "./global-setup";

// The theme journey (T026; FR-029–FR-031; quickstart §1 step 4–5) against the production
// build: Sand from the rail, warmth to 1 from the keyboard, contrast to 0 until the note
// says publish will warn, `Restore to passing` back to the defaults, the theme on disk
// and back after a reload, one undo per slider gesture, and axe clean on the Sand and
// Night sheets (a failing theme is the volunteer's to keep, Waiver 3, so axe is not run
// on it). The cat is deleted at the end so the list journey starts clean.

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");

async function themeOnDisk(id: string): Promise<unknown> {
  const raw = await readFile(resolve(PROFILES_DIR, id, "draft.json"), "utf8");
  const doc: { theme: unknown } = JSON.parse(raw);
  return doc.theme;
}

test("a volunteer picks Sand, pushes the sliders past AA, restores, and keeps the theme across a reload", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "New cat", exact: true }).click();
  await expect(page).toHaveURL(/\/builder\/[a-z2-7]{8}$/);
  const id = new URL(page.url()).pathname.split("/").pop() ?? "";
  const rail = page.getByRole("region", { name: "Add section" });
  await rail.getByRole("button", { name: "Bio" }).click();

  const theme = page.getByRole("region", { name: "Theme" });
  const note = theme.getByRole("status");
  const warmth = page.getByRole("slider", { name: "warmth" });
  const contrast = page.getByRole("slider", { name: "contrast" });
  const sheet = page.locator(".theme-scope");
  await expect(note).toHaveText("contrast check: passes AA");

  // Sand: the swatch is checked, the sheet paints in Sand's hexes.
  await page.getByRole("radio", { name: "Sand" }).click();
  await expect(page.getByRole("radio", { name: "Sand" })).toHaveAttribute("aria-checked", "true");
  await expect(sheet).toHaveCSS("background-color", "rgb(227, 214, 194)");

  // Warmth to 1 from the keyboard: the backgrounds move toward amber; still passes.
  await warmth.focus();
  await page.keyboard.press("End");
  await expect(warmth).toHaveValue("1");
  await expect(theme.getByText("1.00")).toBeVisible();
  await expect(sheet).toHaveCSS("background-color", "rgb(229, 217, 192)");
  await expect(note).toHaveText("contrast check: passes AA");

  // Contrast down by pages until it fails: the note says publish will warn.
  await contrast.focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("PageDown");
  await expect(contrast).toHaveValue("0");
  await expect(note).toHaveText("contrast check: fails — publish will warn");

  // Restore to passing: both sliders back to 0.5 as one undoable edit; axe is clean on
  // the passing Sand sheet (a failing theme is the volunteer's to keep, Waiver 3).
  await page.getByRole("button", { name: "Restore to passing" }).click();
  await expect(note).toHaveText("contrast check: passes AA");
  await expect(warmth).toHaveValue("0.5");
  await expect(contrast).toHaveValue("0.5");
  await runAxe(page);
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(contrast).toHaveValue("0");
  await expect(note).toHaveText("contrast check: fails — publish will warn");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(contrast).toHaveValue("0.5");

  // A pointer drag is one entry: many pixels, one undo.
  const box = await warmth.boundingBox();
  if (box === null) throw new Error("warmth slider has no box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.5, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, y, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.9, y, { steps: 6 });
  await page.mouse.up();
  const dragged = await warmth.inputValue();
  expect(Number(dragged)).toBeGreaterThan(0.8);
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(warmth).toHaveValue("0.5");

  // Night: light labels swap in; the sheet is dark; axe is clean on it too.
  await page.getByRole("radio", { name: "Night" }).click();
  await expect(note).toHaveText("contrast check: passes AA · light labels swap in");
  await expect(sheet).toHaveCSS("background-color", "rgb(10, 14, 18)");
  await expect(page.locator("[data-block-type=hero]")).toHaveCSS(
    "background-color",
    "rgb(20, 26, 33)",
  );
  await runAxe(page);
  await page.getByRole("radio", { name: "Sand" }).click();

  // The theme lands on disk and survives a reload.
  await expect(page.locator("header").getByRole("status")).toHaveText(/^Draft saved/, {
    timeout: 5000,
  });
  expect(await themeOnDisk(id)).toEqual({ preset: "sand", warmth: 0.5, contrast: 0.5 });
  await page.reload();
  await expect(page.getByRole("radio", { name: "Sand" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("slider", { name: "warmth" })).toHaveValue("0.5");
  await expect(page.locator(".theme-scope")).toHaveCSS("background-color", "rgb(227, 214, 194)");

  // Leave the store as it was found.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Unnamed cat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});
