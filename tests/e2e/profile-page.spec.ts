import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_DATA_DIR } from "./global-setup";
import {
  buildCat,
  CAT_1,
  CAT_2,
  CAT_3,
  CLIP,
  deleteCat,
  draftSaved,
  frame,
  newCat,
  pick,
  runAxe,
  publishCat,
  signIn,
  upload,
} from "./_lib";

// The public page as a visitor meets it (T028 moved here; FR-055, FR-059, FR-068–FR-070,
// FR-085): in a fresh context with no cookies, at phone width with nothing sideways, axe
// clean, the clip muted with no controls and paused under reduced motion, and none of the
// draft's block ids, `updatedAt` or the word `draft` in the served HTML.

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");

test("a visitor with no cookies reads the published page on a phone and under reduced motion", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  const id = await buildCat(page, { name: "Charlotte" });
  const url = await publishCat(page);
  expect(url).toBe(`http://localhost:3100/cats/charlotte-${id}`);

  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cat = await visitor.newPage();
  const response = await cat.goto(url);
  expect(response?.status()).toBe(200);
  expect(await visitor.cookies()).toEqual([]);

  const name = cat.getByRole("heading", { level: 1, name: "Charlotte" });
  await expect(name).toBeVisible();
  await expect(name).toHaveCSS("font-size", "74px");
  expect(await cat.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(cat.locator("footer")).toHaveCount(0);
  await expect(cat.getByRole("navigation", { name: "Sections" })).toContainText("Her day");
  await runAxe(cat);

  // Nothing internal reaches the visitor: not the served HTML, not the hydrated DOM.
  const served = await (await cat.request.get(url)).text();
  const hydrated = await cat.content();
  const draft: { blocks: { id: string }[]; updatedAt: string } = JSON.parse(
    await readFile(resolve(PROFILES_DIR, id, "draft.json"), "utf8"),
  );
  for (const html of [served, hydrated]) {
    for (const block of draft.blocks) expect(html).not.toContain(block.id);
    expect(html).not.toContain(draft.updatedAt);
    expect(html).not.toContain("updatedAt");
    expect(html).not.toContain("draft");
    expect(html).not.toContain("publishedAt");
  }

  // The clip: muted, no controls, no sound control anywhere.
  const video = cat.locator("video");
  await video.scrollIntoViewIfNeeded();
  await expect(video).toHaveJSProperty("muted", true);
  await expect(video).not.toHaveAttribute("controls");
  await expect(cat.getByRole("button", { name: /sound|mute|volume/i })).toHaveCount(0);

  // Reduced motion: the day photos stacked and the clip waiting for Play.
  await cat.emulateMedia({ reducedMotion: "reduce" });
  await cat.reload();
  await expect(cat.locator("#day figure")).toHaveCount(3);
  await video.scrollIntoViewIfNeeded();
  await expect(cat.getByRole("button", { name: "Play" })).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await runAxe(cat);
  await visitor.close();

  // Leave the store as it was found.
  await page.getByRole("button", { name: "Published" }).click();
  await page.getByRole("menuitem", { name: "Unpublish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to draft" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  await deleteCat(page, "Charlotte");
});

// F5 regression: right as the day section's pin engages, the day frame must show the
// day's own first scene — never the hero's photo left over from the section above. The
// bug was a scroll-timeline "before phase" gap: before the timeline (or its `--progress`
// fallback) had a value, `.scenePhoto`/`.sceneCaption` had no resting style to fall back
// on, so every scene rendered at its plain, un-animated `opacity: 1` at once. `buildCat`
// gives the hero and the day's first scene the same photo by default, so this replaces
// the hero's with a third, distinct one first.
test("the hero never shows inside the day frame as its pin engages", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await buildCat(page, { name: "Charlotte" });
  await frame(page, /^HERO/).getByRole("button", { name: "replace photo" }).click();
  await pick(page, CAT_3, "Use photo");
  await draftSaved(page);
  const url = await publishCat(page);

  const visitor = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cat = await visitor.newPage();
  await cat.goto(url);
  await cat.waitForLoadState("networkidle");

  // Scroll to exactly where the day's pin takes over (its top at the viewport top) —
  // the moment the bug showed at, before the fix.
  const dayTop = await cat.evaluate(() => {
    const el = document.querySelector("#day");
    if (el === null) throw new Error("no #day section");
    return el.getBoundingClientRect().top + window.scrollY;
  });
  await cat.evaluate((y) => window.scrollTo(0, y), dayTop);
  await cat.waitForTimeout(200);

  const state = await cat.evaluate(() => {
    const heroImg = document.querySelector('[class*="heroPhoto"] img') as HTMLImageElement | null;
    const firstScene = document.querySelector("#day figure:first-of-type");
    const otherScenes = document.querySelectorAll("#day figure:not(:first-of-type)");
    const sceneImg = firstScene?.querySelector("img") as HTMLImageElement | null;
    const photoOpacity = (el: Element | null): string | null =>
      el === null
        ? null
        : getComputedStyle(el.querySelector('[class*="scenePhoto"]') ?? el).opacity;
    return {
      heroSrc: heroImg?.currentSrc ?? heroImg?.src ?? null,
      sceneSrc: sceneImg?.currentSrc ?? sceneImg?.src ?? null,
      firstSceneOpacity: photoOpacity(firstScene),
      otherOpacities: Array.from(otherScenes).map(photoOpacity),
    };
  });

  // The image shown is the day's own first scene, never the hero's.
  expect(state.sceneSrc).not.toBeNull();
  expect(state.heroSrc).not.toBeNull();
  expect(state.sceneSrc).not.toBe(state.heroSrc);
  // And it is the only one actually painted — the regression showed every scene (or the
  // wrong one) at full opacity before the pin had a progress value to animate from.
  expect(state.firstSceneOpacity).toBe("1");
  for (const opacity of state.otherOpacities) expect(opacity).toBe("0");

  await visitor.close();

  // Leave the store as it was found.
  await page.getByRole("button", { name: "Published" }).click();
  await page.getByRole("menuitem", { name: "Unpublish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to draft" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  await deleteCat(page, "Charlotte");
});

// F43: the audit's own comps never double a same-surface seam and never let a phone read
// the desktop's 80–120px rhythm. `buildFullCat` gives the page every section type in the
// audit's order (bio, gallery, day, needs, video, quote, photo, a second bio) so every
// pair it measured is on the page: bio → gallery and needs → video are same-surface
// `.section` seams (halved, both sides); gallery → day, day → needs, video → quote and
// photo → second bio each have a `.day` or a `.bleed` on one side, which keeps its own
// full side untouched (proposal §3).

/** One block frame by position: `0` is the hero, `1` the first block added after it. */
function blockAt(page: Page, index: number) {
  return page.locator("[data-block-type]").nth(index);
}

/**
 * A cat with a hero, then — in the audit's own order — a bio, a gallery, a three-scene
 * day, a needs card, a clip, a quote, a photo and a second bio. Facts, publish readiness
 * (a photo or clip in every slot, words in every required field) are all satisfied.
 */
async function buildFullCat(page: Page, name: string): Promise<string> {
  const id = await newCat(page);
  await upload(page, ["cat-1.jpg", "cat-2.jpg", "cat-3.jpg", "clip-2s.mp4"]);

  const facts = page.getByRole("region", { name: "Facts" });
  await facts.getByRole("textbox", { name: "Name" }).fill(name);
  await page.keyboard.press("Enter");
  await facts.getByRole("textbox", { name: "Age" }).fill("3 years");
  await page.keyboard.press("Enter");
  await facts.getByRole("combobox", { name: "Sex" }).selectOption("female");
  await facts.getByRole("textbox", { name: "Tagline" }).fill("A negotiator, not a complainer.");
  await page.keyboard.press("Enter");

  const tiles = page.getByRole("region", { name: "Add section" });
  for (const label of ["Bio", "Gallery", "Day", "Needs", "Video", "Quote", "Photo", "Bio"]) {
    await tiles.getByRole("button", { name: label, exact: true }).click();
  }
  await expect(page.locator("[data-block-type]")).toHaveCount(9);

  await frame(page, /^HERO/).getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, CAT_1, "Use photo");

  const bio1 = blockAt(page, 1);
  const editor1 = bio1.getByRole("textbox", { name: "Bio" });
  await editor1.click();
  // Several sentences, not one — long enough that the prose column (body text, narrower
  // and smaller) reliably runs taller than the lead column (one big display line) at the
  // desktop's two-column width, so "the prose's bottom" is really the section's last
  // content pixel there, the way the audit's own fixture read.
  await editor1.pressSequentially(
    "She came in from a laundromat and never looked back. Now she negotiates for the good " +
      "sunbeam every afternoon, and always wins the argument. She takes her time with new " +
      "people, watching from the doorway before she decides you are worth the trip across " +
      "the room. Once she does, she is loyal in a quiet, steady way — a paw on your knee, " +
      "not a lap you asked for.",
  );

  const gallery = blockAt(page, 2);
  await gallery.getByRole("button", { name: "add photos" }).click();
  const adding = page.getByRole("dialog", { name: "Add photos" });
  await adding.getByRole("button", { name: CAT_2 }).click();
  await adding.getByRole("button", { name: CAT_3 }).click();
  await adding.getByRole("button", { name: "Add 2 photos" }).click();
  await expect(gallery.getByText("GALLERY · 2 of up to 12")).toBeVisible();

  const day = blockAt(page, 3);
  for (const n of [1, 2, 3]) {
    await day.getByRole("button", { name: `Pick a photo for scene ${n}` }).click();
    await pick(page, [CAT_1, CAT_2, CAT_3][n - 1] ?? CAT_1, "Use photo");
    await day.getByRole("textbox", { name: `Scene ${n} caption` }).fill(`Scene ${n} of her day.`);
    await page.keyboard.press("Enter");
  }

  const needs = blockAt(page, 4);
  await needs.getByRole("textbox", { name: "Card 1 title" }).fill("A quiet room");
  await needs
    .getByRole("textbox", { name: "Card 1 text" })
    .fill("She settles best with one steady person, away from other pets.");
  await page.keyboard.press("Enter");

  const video = blockAt(page, 5);
  await video.getByRole("button", { name: "Pick a clip" }).click();
  await pick(page, CLIP, "Use clip");

  const quote = blockAt(page, 6);
  await quote.getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, CAT_1, "Use photo");
  await quote.getByRole("textbox", { name: "Quote" }).fill("A negotiator, not a complainer.");
  await quote.getByRole("textbox", { name: "Attribution" }).fill("Her foster");
  await page.keyboard.press("Enter");

  const photo = blockAt(page, 7);
  await photo.getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, CAT_2, "Use photo");

  const bio2 = blockAt(page, 8);
  const editor2 = bio2.getByRole("textbox", { name: "Bio" });
  await editor2.click();
  await editor2.pressSequentially("She showed up the way good things do: without warning.");

  await draftSaved(page);
  return id;
}

/** What one seam's measurement needs: two selectors, the bottom of one and the top of the next. */
interface Seam {
  name: string;
  bottomOf: string;
  topOf: string;
}

const SEAMS: readonly Seam[] = [
  { name: "bio → gallery", bottomOf: "#story [class*=prose]", topOf: "#photos h2" },
  { name: "needs → video", bottomOf: "#needs li:last-child", topOf: "#film h2" },
];

/**
 * Every seam's gap (last content pixel to first content pixel, `getBoundingClientRect`,
 * animations disabled) plus the second bio's own top-edge-to-prose offset and the
 * gallery's left edge against its kicker's — everything the F43 audit measured that this
 * fix touches.
 */
async function measureSeams(
  page: Page,
): Promise<{ seams: Record<string, number>; secondBioOffset: number; galleryAligned: boolean }> {
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
  await page.waitForLoadState("networkidle");
  // The display and text faces load async (next/font); measuring before they swap in
  // reads a fallback face's line-wrap and heights, not the comp's.
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((seams) => {
    function bottomOf(selector: string): number {
      const el = document.querySelector(selector);
      if (el === null) throw new Error(`no element for "${selector}"`);
      return el.getBoundingClientRect().bottom;
    }
    function topOf(selector: string): number {
      const el = document.querySelector(selector);
      if (el === null) throw new Error(`no element for "${selector}"`);
      return el.getBoundingClientRect().top;
    }
    const result: Record<string, number> = {};
    for (const seam of seams) result[seam.name] = topOf(seam.topOf) - bottomOf(seam.bottomOf);

    // The second bio: the only section with a `.prose` block (the photo and quote bleeds
    // have a `<p>` too, but never that class) and no `h2` — every anchored section, and
    // the first bio, keeps one.
    const sections = Array.from(document.querySelectorAll("section"));
    const secondBio = sections.find(
      (section) =>
        section.querySelector("h2") === null && section.querySelector("[class*=prose]") !== null,
    );
    if (secondBio === undefined) throw new Error("no headless bio section found");
    const prose = secondBio.querySelector("[class*=prose]");
    if (prose === null) throw new Error("second bio has no prose");
    const secondBioOffset =
      prose.getBoundingClientRect().top - secondBio.getBoundingClientRect().top;

    // The kicker's left edge is its container div's padding-box; the grid `<ul>` carries
    // the same padding itself, so its *border*-box (what `getBoundingClientRect` reads)
    // sits one gutter further left than its own content — compare the first cell instead.
    const kicker = document.querySelector("#photos h2");
    const firstCell = document.querySelector("#photos [class*=cell]");
    const galleryAligned =
      kicker !== null &&
      firstCell !== null &&
      Math.abs(kicker.getBoundingClientRect().left - firstCell.getBoundingClientRect().left) < 1;

    return { seams: result, secondBioOffset, galleryAligned };
  }, SEAMS);
}

test("the section rhythm matches the comps on the phone and the desktop (F43)", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  await buildFullCat(page, "Charlotte");
  const url = await publishCat(page);

  // 390×844: every seam this fix touches is a single 40px unit — same-surface pairs
  // shared, half each side; a section next to the day or a bleed keeps its own full side.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phonePage = await phone.newPage();
  await phonePage.goto(url);
  const atPhone = await measureSeams(phonePage);
  for (const seam of SEAMS) {
    expect(atPhone.seams[seam.name], `${seam.name} at 390`).toBeGreaterThanOrEqual(36);
    expect(atPhone.seams[seam.name], `${seam.name} at 390`).toBeLessThanOrEqual(44);
  }
  expect(atPhone.secondBioOffset).toBeGreaterThanOrEqual(36);
  expect(atPhone.secondBioOffset).toBeLessThanOrEqual(44);
  expect(await phonePage.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await phone.close();

  // 1440×900: the same seams, at the desktop's rhythm (`clamp(80px, 13vh, 120px)` = 117 at
  // this height) — never the old 234–239 a doubled pair used to measure. The gallery's
  // grid now centres with the container instead of sitting flush left of its own kicker.
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(url);
  const atDesktop = await measureSeams(desktopPage);
  for (const seam of SEAMS) {
    expect(atDesktop.seams[seam.name], `${seam.name} at 1440`).toBeGreaterThanOrEqual(111);
    expect(atDesktop.seams[seam.name], `${seam.name} at 1440`).toBeLessThanOrEqual(123);
    // Never the pre-fix double.
    expect(atDesktop.seams[seam.name]).toBeLessThan(200);
  }
  expect(atDesktop.galleryAligned).toBe(true);
  await desktop.close();

  // Leave the store as it was found.
  await page.getByRole("button", { name: "Published" }).click();
  await page.getByRole("menuitem", { name: "Unpublish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to draft" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  await deleteCat(page, "Charlotte");
});

// F50 (F28 review #3, #4): on a phone the display floor never drops under 24px, and the
// `Scroll in` cue must never sit on the hero line — checked at both a tall phone (844,
// where the review measured a 3px overlap) and a short one (664, 16px) to prove the fix
// holds across the clamp's own range, not just the one height it was first measured at.
test("the phone hero cue clears the hero line, and the fact value never drops under 24px", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  await buildCat(page, { name: "Charlotte" });
  const url = await publishCat(page);

  for (const height of [844, 664]) {
    const visitor = await browser.newContext({ viewport: { width: 390, height } });
    const cat = await visitor.newPage();
    await cat.goto(url);
    await cat.addStyleTag({
      content:
        "*, *::before, *::after { animation: none !important; transition: none !important; }",
    });
    await cat.waitForLoadState("networkidle");
    await cat.evaluate(() => document.fonts.ready);

    const rects = await cat.evaluate(() => {
      const line = document.querySelector('[class*="heroLine"]');
      const cue = document.querySelector('[class*="heroCue"]');
      if (line === null || cue === null) throw new Error("hero line or cue missing");
      const { top: lineTop, bottom: lineBottom } = line.getBoundingClientRect();
      const { top: cueTop, bottom: cueBottom } = cue.getBoundingClientRect();
      return { lineTop, lineBottom, cueTop, cueBottom };
    });
    expect(rects.cueTop, `cue vs hero line at 390x${height}`).toBeGreaterThanOrEqual(
      rects.lineBottom + 8,
    );
    // The cue is fully on screen at scroll 0 — the pin gives up the in-flow phone header's
    // own height, so the fold never cuts the cue's stem.
    expect(rects.cueBottom, `cue on screen at 390x${height}`).toBeLessThanOrEqual(height);

    const factValueSize = await cat.evaluate(() => {
      const fact = document.querySelector('[class*="factValue"]');
      if (fact === null) throw new Error("no fact value on the page");
      return Number.parseFloat(getComputedStyle(fact).fontSize);
    });
    expect(factValueSize, `.factValue at 390x${height}`).toBeGreaterThanOrEqual(24);

    await visitor.close();
  }

  // Leave the store as it was found.
  await page.getByRole("button", { name: "Published" }).click();
  await page.getByRole("menuitem", { name: "Unpublish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to draft" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  await deleteCat(page, "Charlotte");
});
