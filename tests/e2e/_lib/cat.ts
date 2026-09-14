import { expect, type Locator, type Page } from "@playwright/test";
import { newCat } from "./newCat";
import { FAKE_DESCRIPTION, upload } from "./upload";

// What the publishing journeys share: the library picker, one cat built by hand from the
// fixtures — a hero, a bio, a gallery, a clip and a three-scene day — the way quickstart
// §1 steps 2–3 describe it, Publish with the contrast question answered, and Delete.

export const CAT_1 = `${FAKE_DESCRIPTION}, cat-1.jpg`;
export const CAT_2 = `${FAKE_DESCRIPTION}, cat-2.jpg`;
export const CAT_3 = `${FAKE_DESCRIPTION}, cat-3.jpg`;
export const CLIP = `${FAKE_DESCRIPTION}, clip-2s.mp4`;

/** Picks one library item in the open picker dialog and confirms with `use`. */
export async function pick(page: Page, choice: string, use: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: choice }).click();
  await dialog.getByRole("button", { name: use }).click();
  await expect(dialog).toHaveCount(0);
}

/** A block frame on the canvas, by its mono label (`/^HERO/`, `/^VIDEO/`, …). */
export function frame(page: Page, label: RegExp): Locator {
  return page.getByRole("region", { name: label });
}

/** The canvas's block types, top to bottom. */
export function order(page: Page): Promise<string[]> {
  return page
    .locator("[data-block-type]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-block-type") ?? ""));
}

/**
 * Drags one frame onto another's slot with the mouse (dnd-kit's pointer sensor, 4px to
 * start): the handle is pressed, then moved by exactly what brings the dragged frame's
 * centre over the target's centre, which is what `closestCenter` judges.
 */
export async function dragFrame(page: Page, from: RegExp, onto: RegExp): Promise<void> {
  // The canvas scrolls inside `main`; the target is centred first so both frames are in
  // view and the pointer never nears an edge, where dnd-kit would start auto-scrolling.
  await frame(page, onto).evaluate((el) => el.scrollIntoView({ block: "center" }));
  const handle = frame(page, from).getByRole("button", { name: "Drag to reorder" });
  const grip = await handle.boundingBox();
  const moving = await frame(page, from).boundingBox();
  const target = await frame(page, onto).boundingBox();
  if (grip === null || moving === null || target === null) throw new Error("frames have no box");
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  const delta = target.y + target.height / 2 - (moving.y + moving.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + Math.sign(delta) * 8, { steps: 3 });
  await page.mouse.move(x, y + delta, { steps: 12 });
  await page.mouse.up();
  // dnd-kit swallows every click for 50ms after a drop (the click that ends a mouse drag
  // must not land on what is under the pointer); a key pressed inside that window is
  // lost the same way, so the next action waits it out.
  await page.waitForTimeout(100);
}

/** Opens a library tile's detail if it is closed, and answers the tile. */
export async function openTile(page: Page, name: string | RegExp): Promise<Locator> {
  const tile = page.getByRole("complementary", { name: "Media" }).getByRole("button", { name });
  if ((await tile.getAttribute("aria-expanded")) !== "true") await tile.click();
  await expect(tile).toHaveAttribute("aria-expanded", "true");
  return tile;
}

/** Waits for the autosave to land, so what is on disk is what is on the screen. */
export async function draftSaved(page: Page): Promise<void> {
  await expect(page.locator("header").getByRole("status")).toHaveText(/^Draft saved/, {
    timeout: 10_000,
  });
}

/** Fills the facts: the name only when given, then age, sex and the tagline. */
async function fillFacts(page: Page, name: string | undefined): Promise<void> {
  const facts = page.getByRole("region", { name: "Facts" });
  if (name !== undefined) {
    await facts.getByRole("textbox", { name: "Name" }).fill(name);
    await page.keyboard.press("Enter");
  }
  await facts.getByRole("textbox", { name: "Age" }).fill("3 years");
  await page.keyboard.press("Enter");
  await facts.getByRole("combobox", { name: "Sex" }).selectOption("female");
  await facts.getByRole("textbox", { name: "Tagline" }).fill("A negotiator, not a complainer.");
  await page.keyboard.press("Enter");
}

/**
 * Adds bio, gallery, video and day from the rail and fills each from the library; the
 * hero is already on the canvas (F1: mandatory, fixed at the top of every profile).
 */
async function fillSections(page: Page): Promise<void> {
  const tiles = page.getByRole("region", { name: "Add section" });
  for (const name of ["Bio", "Gallery", "Video", "Day"]) {
    await tiles.getByRole("button", { name, exact: true }).click();
  }
  await expect(page.locator("[data-block-type]")).toHaveCount(5);

  await frame(page, /^HERO/).getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, CAT_1, "Use photo");
  const editor = frame(page, /^BIO/).getByRole("textbox", { name: "Bio" });
  await editor.click();
  await editor.pressSequentially("She came in from a laundromat and never looked back.");
  await frame(page, /^GALLERY/)
    .getByRole("button", { name: "add photos" })
    .click();
  const adding = page.getByRole("dialog", { name: "Add photos" });
  await adding.getByRole("button", { name: CAT_2 }).click();
  await adding.getByRole("button", { name: CAT_3 }).click();
  await adding.getByRole("button", { name: "Add 2 photos" }).click();
  await expect(frame(page, /^GALLERY · 2 of up to 12/)).toBeVisible();
  await frame(page, /^VIDEO/)
    .getByRole("button", { name: "Pick a clip" })
    .click();
  await pick(page, CLIP, "Use clip");
  const day = frame(page, /^DAY/);
  for (const n of [1, 2, 3]) {
    await day.getByRole("button", { name: `Pick a photo for scene ${n}` }).click();
    await pick(page, [CAT_1, CAT_2, CAT_3][n - 1] ?? CAT_1, "Use photo");
    await day.getByRole("textbox", { name: `Scene ${n} caption` }).fill(`Scene ${n} of her day.`);
    await page.keyboard.press("Enter");
  }
}

/**
 * A new cat with three photos and the clip uploaded, the facts filled (the name only when
 * `name` is given), and a hero, a bio, a gallery of two, the clip and a three-scene day
 * on the canvas. Answers the profile id.
 */
export async function buildCat(page: Page, options: { name?: string } = {}): Promise<string> {
  const id = await newCat(page);
  await upload(page, ["cat-1.jpg", "cat-2.jpg", "cat-3.jpg", "clip-2s.mp4"]);
  await fillFacts(page, options.name);
  await fillSections(page);
  await draftSaved(page);
  return id;
}

/** Presses Publish and answers the contrast question, if it comes, with `Publish anyway`. */
export async function publishCat(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Publish" }).click();
  const question = page.getByRole("dialog", { name: "The text may be hard to read." });
  // `isVisible` answers at once; `waitFor` gives the modal its moment to open.
  if (
    await question.waitFor({ state: "visible", timeout: 1500 }).then(
      () => true,
      () => false,
    )
  ) {
    await question.getByRole("button", { name: "Publish anyway" }).click();
  }
  const toast = page.getByRole("status").filter({ hasText: /is live at/ });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  const text = (await toast.textContent()) ?? "";
  const match = /is live at ([^\s]+)\./.exec(text);
  if (match?.[1] === undefined) throw new Error(`no address in "${text}"`);
  return `http://${match[1]}`;
}

/** Asks to remove `tile` from the library, confirms, and reads the refusal toast (FR-076). */
export async function refusedRemoval(page: Page, tile: string, refusal: string): Promise<void> {
  const rail = page.getByRole("complementary", { name: "Media" });
  await rail.getByRole("button", { name: tile }).focus();
  await page.keyboard.press("Delete");
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  const alert = page.getByRole("alert").filter({ hasText: refusal });
  await expect(alert).toBeVisible();
  await expect(rail.getByRole("button", { name: tile })).toBeVisible();
  await alert.getByRole("button", { name: "Dismiss" }).click();
  await expect(alert).toHaveCount(0);
}

/** Deletes a draft cat from the list, so the store is left as it was found. */
export async function deleteCat(page: Page, name: string): Promise<void> {
  await page.goto("/builder");
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("button", { name: `Delete ${name}` })).toHaveCount(0);
}
