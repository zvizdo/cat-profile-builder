import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator } from "@playwright/test";
import {
  CAT_1,
  CAT_2,
  CLIP,
  deleteCat,
  draftSaved,
  FAKE_DESCRIPTION,
  frame,
  newCat,
  pick,
  runAxe,
  signIn,
  upload,
} from "./_lib";
import { E2E_DATA_DIR } from "./global-setup";

// The block editors journey (T025; FR-014–FR-016, FR-020, FR-021) against the production
// build over the filesystem store and the fake describer: two photos and a clip go into
// the library, every block type is added and filled from the canvas — photos picked from
// the library, a bio with a bold word and a link, captions, cards, a quote, the facts with
// a tagline that stops at 80 — the page survives a reload, the draft on disk holds the
// bio as `RichText` with no markup anywhere, a photo deleted from the library shows as
// missing in its slot, and axe finds nothing. The cat is deleted at the end.

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");
/**
 * Selects `word` inside the editor the way a drag would — the browser's own selection,
 * which the editor reads — since Home and End scroll rather than move the caret on a Mac.
 */
async function selectWord(editor: Locator, word: string): Promise<void> {
  await editor.click();
  await editor.evaluate((box, target) => {
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const at = node.textContent?.indexOf(target) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + target.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    throw new Error(`"${target}" is not in the editor`);
  }, word);
  await expect.poll(() => editor.evaluate(() => window.getSelection()?.toString())).toBe(word);
}

test("a volunteer fills every section from the canvas and the draft holds it as data", async ({
  page,
}) => {
  await signIn(page);
  const id = await newCat(page);

  // Two photos and a clip into the library, described by the fake.
  const rail = page.getByRole("complementary", { name: "Media" });
  await upload(page, ["cat-1.jpg", "cat-2.jpg", "clip-2s.mp4"]);
  // The helper unlocks on the live list, not the one the page opened with.
  await expect(page.getByText("Add one photo and I can help.")).toHaveCount(0);

  // The facts: the name reaches the topbar; the tagline stops at 80 and counts.
  const facts = page.getByRole("region", { name: "Facts" });
  await facts.getByRole("textbox", { name: "Name" }).fill("Charlotte");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Charlotte");
  await facts.getByRole("textbox", { name: "Age" }).fill("3 years");
  await facts.getByRole("combobox", { name: "Sex" }).selectOption("female");
  const tagline = facts.getByRole("textbox", { name: "Tagline" });
  await tagline.pressSequentially("t".repeat(81));
  await expect(tagline).toHaveValue("t".repeat(80));
  await expect(facts.getByText("80/80")).toBeVisible();
  await page.keyboard.press("Enter");

  // Every addable section from the rail, then filled on the canvas — the hero is already
  // on the page (F1: mandatory, fixed at the top of every profile).
  const tiles = page.getByRole("region", { name: "Add section" });
  for (const name of ["Bio", "Photo", "Gallery", "Video", "Day", "Needs", "Quote"]) {
    await tiles.getByRole("button", { name, exact: true }).click();
  }
  await expect(page.locator("[data-block-type]")).toHaveCount(8);

  const hero = frame(page, /^HERO/);
  await hero.getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, CAT_1, "Use photo");
  await expect(hero.getByRole("img", { name: FAKE_DESCRIPTION })).toBeVisible();

  const bio = frame(page, /^BIO/);
  const editor = bio.getByRole("textbox", { name: "Bio" });
  await editor.click();
  await editor.pressSequentially("Charlotte came in from a laundromat. See her page.");
  await selectWord(editor, "Charlotte");
  await bio.getByRole("button", { name: "Bold" }).click();
  await selectWord(editor, "page.");
  await bio.getByRole("button", { name: "Link" }).click();
  await bio.getByRole("textbox", { name: "Link address" }).fill("https://example.org/charlotte");
  await page.keyboard.press("Enter");
  await expect(bio.getByRole("link", { name: "page." })).toHaveAttribute(
    "href",
    "https://example.org/charlotte",
  );
  await expect(bio.locator("strong")).toHaveText("Charlotte");

  const photo = frame(page, /^PHOTO/);
  await photo.getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, CAT_2, "Use photo");
  await photo.getByRole("textbox", { name: "Caption" }).fill("On the sill, waiting.");
  await page.keyboard.press("Enter");

  const gallery = frame(page, /^GALLERY/);
  await gallery.getByRole("button", { name: "add photos" }).click();
  const adding = page.getByRole("dialog", { name: "Add photos" });
  await adding.getByRole("button", { name: CAT_1 }).click();
  await adding.getByRole("button", { name: CAT_2 }).click();
  await adding.getByRole("button", { name: "Add 2 photos" }).click();
  await expect(frame(page, /^GALLERY · 2 of up to 12/)).toBeVisible();

  const video = frame(page, /^VIDEO/);
  await video.getByRole("button", { name: "Pick a clip" }).click();
  await pick(page, CLIP, "Use clip");
  await expect(video.getByText("trim 0:00 – 0:02 of 0:02 · muted autoplay + loop")).toBeVisible();

  const day = frame(page, /^DAY/);
  for (const n of [1, 2, 3]) {
    await day.getByRole("button", { name: `Pick a photo for scene ${n}` }).click();
    await pick(page, n === 2 ? CAT_2 : CAT_1, "Use photo");
    await day.getByRole("textbox", { name: `Scene ${n} caption` }).fill(`Scene ${n} of her day.`);
    await page.keyboard.press("Enter");
  }

  const needs = frame(page, /^NEEDS/);
  await needs.getByRole("textbox", { name: "Card 1 title" }).fill("A quiet room");
  await needs
    .getByRole("textbox", { name: "Card 1 text" })
    .fill("She hides for a day, then owns it.");
  await needs.getByRole("button", { name: "add card" }).click();
  await expect(needs.getByRole("textbox", { name: "Card 2 title" })).toBeFocused();
  await page.keyboard.type("A window");
  await needs.getByRole("textbox", { name: "Card 2 text" }).fill("For the birds.");

  const quote = frame(page, /^QUOTE/);
  await quote.getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, CAT_1, "Use photo");
  await quote.getByRole("textbox", { name: "Quote" }).fill("A negotiator, not a complainer.");
  await quote.getByRole("textbox", { name: "Attribution" }).fill("Her foster");
  await page.keyboard.press("Enter");
  await runAxe(page);

  // Everything is on disk as data and survives a reload.
  await draftSaved(page);
  const raw = await readFile(resolve(PROFILES_DIR, id, "draft.json"), "utf8");
  expect(raw).not.toContain("<");
  const doc: {
    name: string;
    tagline: string;
    blocks: { type: string; content?: unknown; caption?: string; mediaIds?: string[] }[];
  } = JSON.parse(raw);
  expect(doc.name).toBe("Charlotte");
  expect(doc.tagline).toHaveLength(80);
  const bioBlock = doc.blocks.find((block) => block.type === "bio");
  expect(bioBlock?.content).toHaveProperty("paragraphs");
  expect(bioBlock?.content).not.toHaveProperty("type");
  expect(JSON.stringify(bioBlock?.content)).toContain('"bold":true');
  expect(JSON.stringify(bioBlock?.content)).toContain('"href":"https://example.org/charlotte"');
  expect(doc.blocks.find((block) => block.type === "gallery")?.mediaIds).toHaveLength(2);

  await page.reload();
  await expect(page.locator("[data-block-type]")).toHaveCount(8);
  await expect(frame(page, /^HERO/).getByRole("img", { name: FAKE_DESCRIPTION })).toBeVisible();
  await expect(frame(page, /^BIO/).locator("strong")).toHaveText("Charlotte");
  await expect(frame(page, /^PHOTO/).getByRole("textbox", { name: "Caption" })).toHaveValue(
    "On the sill, waiting.",
  );
  await expect(frame(page, /^NEEDS/).getByRole("textbox", { name: "Card 2 title" })).toHaveValue(
    "A window",
  );
  await expect(frame(page, /^QUOTE/).getByRole("textbox", { name: "Quote" })).toHaveValue(
    "A negotiator, not a complainer.",
  );
  await expect(page.getByRole("region", { name: "Facts" }).getByText("80/80")).toBeVisible();

  // A photo deleted from the library leaves its slots striped `photo missing`, never broken.
  await rail.getByRole("button", { name: CAT_2 }).focus();
  await page.keyboard.press("Delete");
  await page
    .getByRole("dialog", { name: "Remove cat-2.jpg?" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(rail.getByRole("button", { name: CAT_2 })).toHaveCount(0);
  await expect(frame(page, /^PHOTO/).getByText("photo missing — pick another")).toBeVisible();
  // A small tile shows `photo missing` and keeps the full sentence for assistive tech.
  await expect(frame(page, /^DAY/).getByText("photo missing", { exact: true })).toBeVisible();
  await expect(frame(page, /^DAY/).getByText("photo missing — pick another")).toHaveCount(1);
  await expect(frame(page, /^PHOTO/).locator("img")).toHaveCount(0);
  await runAxe(page);

  // Leave the store as it was found: the list journey counts cats.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Charlotte" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

// F47 (F28 review #6; comp 7c "iPad 1024×768 · touch-first"): a real touch context is
// the one thing a jsdom component test cannot exercise — the browser's own `matchMedia`
// crossing the 768/1180 boundaries. A dedicated context (rather than `test.use` at the
// file level) keeps the rest of this file's journey on the default pointer viewport.
test("a tap in the touch band (1024×768) finds duplicate at rest, and the pill/hover boundary sits exactly at 1180", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await signIn(page);
  await newCat(page);
  await page
    .getByRole("region", { name: "Add section" })
    .getByRole("button", { name: "Photo", exact: true })
    .click();

  const photoBlocks = page.locator('[data-block-type="photo"]');
  const duplicate = photoBlocks.first().getByRole("button", { name: "duplicate" });

  // Visible at rest — no hover to summon it with — and a real ≥44×44 tap target.
  await expect(duplicate).toBeVisible();
  const box = await duplicate.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  await duplicate.tap();
  await expect(photoBlocks).toHaveCount(2);

  // The boundary itself: `useTouchBand`'s query is 768–1179, so 1179 keeps the pill
  // visible and 1180 flips to the hover-gated row (opacity 0 at rest) — `wide`'s
  // pointer behaviour, untouched by this task. `opacity` is not an inherited CSS
  // property, so the check reads the pill's own parent row, the element the class
  // actually lands on.
  const rowOpacity = () =>
    duplicate.evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).opacity);
  await page.setViewportSize({ width: 1179, height: 800 });
  await expect.poll(rowOpacity).toBe("1");
  await page.setViewportSize({ width: 1180, height: 800 });
  await expect.poll(rowOpacity).toBe("0");

  await deleteCat(page, "Unnamed cat");
  await context.close();
});
