import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { CAT_1, CLIP, draftSaved, newCat, pick, runAxe, signIn, upload } from "./_lib";
import { E2E_DATA_DIR } from "./global-setup";

// The preview journey (T028; FR-026, FR-068–FR-070, FR-085) against the production build:
// a cat with a hero, a bio, a three-scene day, a clip and a quote opens at
// `/builder/{id}/preview` as the public page — the name at the hero clamp, the clip muted
// with no controls and one Pause, axe clean at 1280 and at 390 with no sideways scroll,
// and under reduced motion the three day photos stacked and the clip waiting for Play.
// The served response carries none of the draft's block ids (FR-059). The public address
// is still a 404: nothing is published yet (T029).

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");

test("a volunteer previews the draft as the public page", async ({ page }) => {
  await signIn(page);
  const id = await newCat(page);

  await upload(page, ["cat-1.jpg", "clip-2s.mp4"]);

  const facts = page.getByRole("region", { name: "Facts" });
  await facts.getByRole("textbox", { name: "Name" }).fill("Charlotte");
  await page.keyboard.press("Enter");
  await facts.getByRole("textbox", { name: "Age" }).fill("3 years");
  await page.keyboard.press("Enter");
  await facts.getByRole("combobox", { name: "Sex" }).selectOption("female");
  await facts.getByRole("textbox", { name: "Tagline" }).fill("An explorer who never gives up.");
  await page.keyboard.press("Enter");

  const tiles = page.getByRole("region", { name: "Add section" });
  for (const name of ["Bio", "Day", "Video", "Quote"]) {
    await tiles.getByRole("button", { name, exact: true }).click();
  }
  await expect(page.locator("[data-block-type]")).toHaveCount(5);
  const frame = (label: RegExp) => page.getByRole("region", { name: label });
  await frame(/^HERO/).getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, CAT_1, "Use photo");
  const editor = frame(/^BIO/).getByRole("textbox", { name: "Bio" });
  await editor.click();
  await editor.pressSequentially("She is a talker. Not a complainer, a negotiator.");
  const day = frame(/^DAY/);
  for (const n of [1, 2, 3]) {
    await day.getByRole("button", { name: `Pick a photo for scene ${n}` }).click();
    await pick(page, CAT_1, "Use photo");
    await day.getByRole("textbox", { name: `Scene ${n} caption` }).fill(`Scene ${n} of her day.`);
    await page.keyboard.press("Enter");
  }
  await frame(/^VIDEO/)
    .getByRole("button", { name: "Pick a clip" })
    .click();
  await pick(page, CLIP, "Use clip");
  const quote = frame(/^QUOTE/);
  await quote.getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, CAT_1, "Use photo");
  await quote.getByRole("textbox", { name: "Quote" }).fill("She decided I was hers.");
  await quote.getByRole("textbox", { name: "Attribution" }).fill("Her foster");
  await page.keyboard.press("Enter");
  await draftSaved(page);

  // The preview: the public page under its bar.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("link", { name: "Preview" }).click();
  await expect(page).toHaveURL(`/builder/${id}/preview`);
  await expect(page.getByText("Preview · this is how the page looks once published")).toBeVisible();
  const name = page.getByRole("heading", { level: 1, name: "Charlotte" });
  await expect(name).toBeVisible();
  await expect(name).toHaveCSS("font-size", "166.4px");
  await expect(name).toHaveCSS("font-family", /Instrument Serif/);
  await expect(page.getByRole("list", { name: "Facts" })).toContainText("3 years");
  await expect(page.getByRole("navigation", { name: "Sections" })).toContainText("Her day");
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/updated/i);
  const link = page.getByRole("navigation", { name: "Sections" }).getByRole("link").first();
  await expect(link).toHaveCSS("font-family", /Work Sans/);
  await expect(link).toHaveCSS("text-transform", "none");

  // Nothing internal reaches the response: not the served HTML, not the hydrated DOM.
  const raw = await readFile(resolve(PROFILES_DIR, id, "draft.json"), "utf8");
  const draft: { blocks: { id: string }[]; updatedAt: string } = JSON.parse(raw);
  expect(draft.blocks).toHaveLength(5);
  const served = await (await page.request.get(`/builder/${id}/preview`)).text();
  const hydrated = await page.content();
  for (const block of draft.blocks) {
    expect(served).not.toContain(block.id);
    expect(hydrated).not.toContain(block.id);
  }
  expect(served).not.toContain(draft.updatedAt);

  // The clip: muted, no controls, plays once in view (Chromium starts muted autoplay
  // there), and the one visible control pauses it.
  const video = page.locator("video");
  await video.scrollIntoViewIfNeeded();
  await expect(video).toHaveJSProperty("muted", true);
  await expect(video).not.toHaveAttribute("controls");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(page.getByRole("button", { name: /sound|mute|volume/i })).toHaveCount(0);
  await runAxe(page);

  // Phone width: readable, nothing sideways, the header one row that does not ride along.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(name).toHaveCSS("font-size", "74px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const header = page.locator("main").locator("xpath=preceding-sibling::header");
  await expect(header).toHaveCSS("position", "relative");
  expect(await header.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(80);
  await runAxe(page);

  // Reduced motion: the heading, then the three day photos stacked and visible, the clip
  // waiting for Play.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const figures = page.locator("#day figure");
  await expect(figures).toHaveCount(3);
  const heading = page
    .getByRole("heading", { level: 2, name: "Her day" })
    .or(page.locator("#day h2"));
  const headingTop = await heading
    .first()
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await expect(page.locator("#day [data-dashes]")).toBeHidden();
  const tops: number[] = [];
  for (const figure of await figures.all()) {
    await figure.scrollIntoViewIfNeeded();
    await expect(figure.locator("img")).toBeVisible();
    await expect(figure.locator("figcaption")).toBeVisible();
    tops.push(await figure.evaluate((el) => el.getBoundingClientRect().top + window.scrollY));
  }
  expect(headingTop).toBeLessThan(tops[0] ?? 0);
  expect(tops[0]).toBeLessThan(tops[1] ?? 0);
  expect(tops[1]).toBeLessThan(tops[2] ?? 0);
  await video.scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // Not published: the public address is a 404 in the shelter's voice.
  const response = await page.goto(`/cats/charlotte-${id}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This cat isn't listed right now.",
  );

  // Leave the store as it was found: the list journey counts cats.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Charlotte" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});
