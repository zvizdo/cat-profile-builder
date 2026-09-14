import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { checkTrim } from "@/core/media/validation";
import {
  buildCat,
  CAT_1,
  deleteCat,
  draftOnDisk,
  draftSaved,
  dragFrame,
  FAKE_DESCRIPTION,
  frame,
  openTile,
  order,
  pick,
  probe,
  PROFILES_DIR,
  publishedOnDisk,
  publishCat,
  referencedIds,
  refusedRemoval,
  runAxe,
  runAxeUnder,
  servedTo,
  signIn,
  upload,
} from "./_lib";
import { E2E_DATA_DIR } from "./global-setup";

// Quickstart §1, Story 1 (FR-055–FR-060, FR-074, FR-076–FR-079, FR-083, FR-085–FR-087,
// FR-090, FR-092), against the production build over the filesystem store and the real
// ffmpeg: one cat, built by hand, taken through every numbered step in order. The four
// tests share the cat and run serially; each signs in afresh, the way a volunteer would
// after a break. Axe runs on every page seen (a failing theme excepted — Waiver 3).
//
// Steps 11 (phone mode) and 12 (offline) have their own journeys — phone-mode.spec.ts and
// offline.spec.ts — and are not repeated here. Step 13's "Delete on the live cat" is a
// button the list never offers for a live cat (FR-092); the server's own `Unpublish
// first.` is a contract test (tests/contract/server-boundary.profiles.test.ts).

const PUBLIC_DIR = resolve(E2E_DATA_DIR, "public");
/** The trimmed clip's tile: ffprobe reads the cut as 9.9-something or 10 seconds. */
const TRIMMED_TILE = /^A tabby cat on a windowsill\., clip-20s\.mp4, 0:(09|10)$/;
const RENAMED_TILE = /^Charlotte pacing the hall, tail up\., clip-20s\.mp4, 0:(09|10)$/;

/** The two presets step 10 runs axe under, with the ground each takes at 0.5 / 0.5; Sand last. */
const GROUNDS = { Night: "rgb(10, 14, 18)", Sand: "rgb(227, 214, 194)" };

/**
 * Renames the cat in the facts and republishes. The live toast reads the name from the
 * document but its address from the server, so the new slug in it is what proves the
 * publish landed — a toast from an earlier publish would already carry the new name.
 */
async function rename(page: Page, name: string, id: string): Promise<void> {
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Published" }).click();
  await page.getByRole("menuitem", { name: "Republish" }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: `${name} is live at localhost:3100/cats/${name.toLowerCase()}-${id}.`,
    }),
  ).toBeVisible({ timeout: 15_000 });
}

/** Where `path` sends a visitor: asserts a 308 and answers its Location. */
async function redirectOf(page: Page, path: string): Promise<string> {
  const response = await page.request.get(path, { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  return response.headers().location ?? "";
}

test.describe.serial("Story 1: build and publish by hand (quickstart §1)", () => {
  let id = "";
  const url = () => `/cats/charlotte-${id}`;

  test("steps 1–6: sign in, build the cat, reorder from the keyboard, set the theme, reload, and publish", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // Step 1: the wrong password is one sentence; the right one lands on the list.
    await page.goto("/builder");
    await page.getByRole("textbox", { name: "Username" }).fill("volunteer");
    await page.getByLabel("Password").fill("wrong");
    await page.keyboard.press("Enter");
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "That username and password don't match.",
    );
    await signIn(page);
    await runAxe(page);

    // Step 2: three photos and the 2-second clip; step 3: hero, bio, gallery, video, day.
    id = await buildCat(page);
    expect(await order(page)).toEqual(["hero", "bio", "gallery", "video", "day"]);

    // Step 3: the clip dragged above the gallery with the mouse; then Move up from the
    // keyboard, and focus stays on the button that was pressed.
    await dragFrame(page, /^VIDEO/, /^GALLERY/);
    expect(await order(page)).toEqual(["hero", "bio", "video", "gallery", "day"]);
    await frame(page, /^VIDEO/)
      .getByRole("button", { name: "Drag to reorder" })
      .focus();
    await page.keyboard.press("Tab");
    await expect(frame(page, /^VIDEO/).getByRole("button", { name: "Move up" })).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await order(page)).toEqual(["hero", "video", "bio", "gallery", "day"]);
    await expect(frame(page, /^VIDEO/).getByRole("button", { name: "Move up" })).toBeFocused();
    await runAxe(page);

    // Step 6's refusals come first, on the passing theme, so axe can judge the panel:
    // no name → refused, and the panel puts focus in the name field; an empty photo
    // section → refused too, and the problem's button scrolls to the section.
    await page.getByRole("button", { name: "Publish" }).click();
    const panel = page.locator("main").getByRole("alert");
    await expect(panel).toContainText("One thing missing:");
    await expect(panel.getByRole("button", { name: "Give the cat a name." })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
    await runAxe(page);
    await page
      .getByRole("region", { name: "Add section" })
      .getByRole("button", { name: "Photo", exact: true })
      .click();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(panel).toContainText("Two things missing:");
    await panel.getByRole("button", { name: "The photo section has no photo." }).click();
    await expect(frame(page, /^PHOTO/)).toBeInViewport();
    await frame(page, /^PHOTO/)
      .getByRole("button", { name: "remove" })
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove section" }).click();
    await expect(frame(page, /^PHOTO/)).toHaveCount(0);
    await page.getByRole("textbox", { name: "Name" }).fill("Charlotte");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Charlotte");

    // Step 4: Sand; warmth to 1 warms the ground toward amber and the note still passes;
    // contrast to 0 and the note says publish will warn.
    const theme = page.getByRole("region", { name: "Theme" });
    const note = theme.getByRole("status");
    const warmth = page.getByRole("slider", { name: "warmth" });
    const contrast = page.getByRole("slider", { name: "contrast" });
    const sheet = page.locator(".theme-scope");
    await page.getByRole("radio", { name: "Sand" }).click();
    await expect(sheet).toHaveCSS("background-color", "rgb(227, 214, 194)");
    await expect(note).toHaveText("contrast check: passes AA");
    await warmth.focus();
    await page.keyboard.press("End");
    await expect(warmth).toHaveValue("1");
    await expect(sheet).toHaveCSS("background-color", "rgb(229, 217, 192)");
    await expect(note).toHaveText("contrast check: passes AA");
    await contrast.focus();
    await page.keyboard.press("Home");
    await expect(contrast).toHaveValue("0");
    await expect(note).toHaveText("contrast check: fails — publish will warn");
    await expect(theme.getByRole("button", { name: "Restore to passing" })).toBeVisible();
    await draftSaved(page);

    // Step 5: order and theme survive a reload.
    await page.reload();
    await expect(page.locator("[data-block-type]")).toHaveCount(5);
    expect(await order(page)).toEqual(["hero", "video", "bio", "gallery", "day"]);
    await expect(page.getByRole("radio", { name: "Sand" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("slider", { name: "warmth" })).toHaveValue("1");
    await expect(page.getByRole("slider", { name: "contrast" })).toHaveValue("0");

    // Step 6, the publish: the contrast question names what fails; `Restore to passing`
    // resets both sliders to 0.5 as one undoable edit, and the cat goes live.
    await page.getByRole("button", { name: "Publish" }).click();
    const question = page.getByRole("dialog", { name: "The text may be hard to read." });
    await expect(question).toContainText("Sand at this contrast is");
    await expect(question).toContainText("the floor is 4.5:1");
    await question.getByRole("button", { name: "Restore to passing" }).click();
    const toast = page.getByRole("status").filter({ hasText: `Charlotte is live at` });
    await expect(toast).toBeVisible({ timeout: 15_000 });
    await expect(toast).toContainText(`localhost:3100${url()}`);
    await expect(warmth).toHaveValue("0.5");
    await expect(contrast).toHaveValue("0.5");
    await page.locator("main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect(contrast).toHaveValue("0");
    await expect(warmth).toHaveValue("1");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(contrast).toHaveValue("0.5");
    await expect(page.getByRole("button", { name: "Published" })).toBeVisible();
    await runAxe(page);
  });

  test("steps 7–9: a visitor reads the page, a later edit changes nothing, the cat is listed, archived, restored and unpublished, and a used photo cannot be removed", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await signIn(page);

    // Step 8's files first, since step 7 reads them: `published.json` holds the manifest
    // — one entry per referenced id, each `src` a public media URL — and `draft.json`
    // holds only ids, no URL anywhere.
    const published = await publishedOnDisk(id);
    const { raw, doc } = await draftOnDisk(id);
    expect(published.slug).toBe("charlotte");
    expect(Object.keys(published.media).sort()).toEqual([...new Set(referencedIds(doc))].sort());
    for (const entry of Object.values(published.media)) {
      expect(entry.src).toMatch(new RegExp(`^/media/profiles/${id}/media/[a-z2-7]{8}/`));
    }
    expect(raw).not.toContain("/media/");
    expect(raw).not.toContain("src");

    // Step 7: a visitor with no cookies sees the page; the served HTML carries no block
    // id, no timestamp, no draft-only field — only the URL's own id.
    const visitor = await browser.newContext();
    const publicPage = await visitor.newPage();
    const response = await publicPage.goto(url());
    expect(response?.status()).toBe(200);
    expect(await visitor.cookies()).toEqual([]);
    await expect(publicPage.getByRole("heading", { level: 1, name: "Charlotte" })).toBeVisible();
    await expect(publicPage.getByRole("list", { name: "Facts" })).toContainText("3 years");
    // Both what the server sent and what the browser holds after hydration.
    const served = (await response?.text()) ?? "";
    const hydrated = await publicPage.content();
    for (const html of [served, hydrated]) {
      for (const block of published.blocks) expect(html).not.toContain(block.id);
      expect(html).not.toContain(published.updatedAt);
      expect(html).not.toContain(doc.updatedAt);
      for (const word of ["draft", "updatedAt", "publishedAt", "schemaVersion"]) {
        expect(html).not.toContain(word);
      }
      expect(html).toContain("laundromat");
    }
    await runAxe(publicPage);
    await visitor.close();

    // Step 8: an edit to the bio, not republished, changes nothing a visitor sees, and
    // `published.json` keeps its bytes.
    await page.goto(`/builder/${id}`);
    const bytesAtPublish = await readFile(resolve(PROFILES_DIR, id, "published.json"));
    const editor = frame(page, /^BIO/).getByRole("textbox", { name: "Bio" });
    await editor.click();
    await page.keyboard.press("End");
    await editor.pressSequentially(" She has opinions about breakfast.");
    // The bio writes once the typing pauses, and the autosave a second after that.
    await expect
      .poll(async () => (await draftOnDisk(id)).raw, { timeout: 10_000 })
      .toContain("opinions about breakfast");
    const unchanged = await servedTo(page, url());
    expect(unchanged.html).not.toContain("opinions about breakfast");
    expect(unchanged.html).toContain("laundromat");
    expect(
      (await readFile(resolve(PROFILES_DIR, id, "published.json"))).equals(bytesAtPublish),
    ).toBe(true);

    // /cats lists the cat with its photo and line.
    await page.goto("/cats");
    const card = page.getByRole("link", { name: /Charlotte/ });
    await expect(card).toHaveAttribute("href", url());
    await expect(card).toContainText("A negotiator, not a complainer.");
    await expect(card.getByRole("img")).toBeVisible();
    await runAxe(page);

    // Step 9, the live page: the hero's photo cannot leave the library; the refusal
    // names the cat and what frees it.
    await page.goto(`/builder/${id}`);
    await refusedRemoval(page, CAT_1, "Charlotte's live page uses this photo. Unpublish first.");
    await runAxe(page);

    // A renamed cat republishes under a new slug and the old address is a 308 to the new
    // one — both ways, so the cat ends where the later steps expect her.
    await rename(page, "Charlie", id);
    expect(await redirectOf(page, url())).toContain(`/cats/charlie-${id}`);
    await rename(page, "Charlotte", id);
    expect(await redirectOf(page, `/cats/charlie-${id}`)).toContain(url());

    // Archive: the URL is 404, the cat is gone from /cats, and the list marks it ARCHIVED
    // with no Delete on offer.
    const bytesBefore = await readFile(resolve(PROFILES_DIR, id, "published.json"));
    await page.getByRole("button", { name: "Published" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    const archiveQuestion = page.getByRole("dialog", { name: "Archive Charlotte?" });
    await expect(archiveQuestion).toContainText("Everything is kept exactly as it was.");
    await archiveQuestion.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("button", { name: "Archived" })).toBeVisible();
    expect((await servedTo(page, url())).status).toBe(404);
    await page.goto("/cats");
    await expect(page.getByRole("link", { name: /Charlotte/ })).toHaveCount(0);
    await page.goto("/builder");
    const listed = page.getByRole("article").filter({ hasText: "Charlotte" });
    await expect(listed).toContainText("ARCHIVED");
    await expect(page.getByRole("button", { name: "Delete Charlotte" })).toHaveCount(0);
    await runAxe(page);

    // Step 9, the archived page: still in use, and the refusal says what to do first.
    await page.goto(`/builder/${id}`);
    await refusedRemoval(
      page,
      CAT_1,
      "Charlotte's archived page uses this photo. Restore and unpublish first.",
    );

    // Restore: the exact previous page is back, byte for byte.
    await page.getByRole("button", { name: "Archived" }).click();
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await expect(page.getByRole("button", { name: "Published" })).toBeVisible();
    expect((await readFile(resolve(PROFILES_DIR, id, "published.json"))).equals(bytesBefore)).toBe(
      true,
    );
    expect((await servedTo(page, url())).status).toBe(200);
    await page.goto("/cats");
    await expect(page.getByRole("link", { name: /Charlotte/ })).toHaveCount(1);

    // Unpublish: asked first, in the shelter's words; then the page is a 404 in its
    // voice, and the toast offers Undo.
    await page.goto(`/builder/${id}`);
    await page.getByRole("button", { name: "Published" }).click();
    await page.getByRole("menuitem", { name: "Unpublish" }).click();
    const ask = page.getByRole("dialog", { name: "Take Charlotte off the site?" });
    await expect(ask).toContainText("Everything you wrote is kept as a draft.");
    await ask.getByRole("button", { name: "Move to draft" }).click();
    const undoToast = page.getByRole("status").filter({ hasText: "Charlotte is back to draft" });
    await expect(undoToast).toBeVisible();
    await expect(undoToast.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
    expect((await servedTo(page, url())).status).toBe(404);
    await expect(stat(resolve(PROFILES_DIR, id, "published.json"))).rejects.toThrow();
    const gone = await page.goto(url());
    expect(gone?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "This cat isn't listed right now.",
    );
    await runAxe(page);
  });

  test("step 10: the 20-second clip needs a trim, sixteen seconds is refused, ten regenerates the poster and description", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page);
    await page.goto(`/builder/${id}`);
    const rail = page.getByRole("complementary", { name: "Media" });

    // The tile says it needs a trim, and once the video section points at it, Publish
    // lists the trim as what is missing (readiness reads the referenced clip).
    await upload(page, ["clip-20s.mp4"]);
    const needsTrim = rail.getByRole("button", { name: "clip-20s.mp4, needs a trim" });
    await expect(needsTrim).toBeVisible();
    const video = frame(page, /^VIDEO/);
    await video.getByRole("button", { name: "replace clip" }).click();
    await pick(page, "clip-20s.mp4", "Use clip");
    await expect(video.getByText("needs a trim")).toBeVisible();
    await draftSaved(page);
    await page.getByRole("button", { name: "Publish" }).click();
    const panel = page.locator("main").getByRole("alert");
    // An untrimmed clip has no description yet either: it is written from the cut.
    await expect(panel).toContainText("Two things missing:");
    await expect(
      panel.getByRole("button", { name: "Trim clip-20s.mp4 to 15 seconds or less." }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Write a description for clip-20s.mp4." }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Dismiss" }).click();
    await expect(panel).toHaveCount(0);
    // Axe judges the frame with its actions showing, under Night and then Sand: the label
    // row keeps the chrome's colours, so the clay `remove` holds 4.5:1 on both. Focus on an
    // action is what shows the row; runAxe parks the pointer and waits out the fade.
    await runAxeUnder(page, GROUNDS, () => video.getByRole("button", { name: "remove" }).focus());

    // Trim to 16 s → refused in core's own words, and the button waits.
    await needsTrim.click();
    await rail.getByRole("button", { name: "Trim", exact: true }).click();
    const modal = page.getByRole("dialog", { name: /^That clip is 0:20\./ });
    await expect(modal).toBeVisible();
    await expect(modal.getByText("0:00 – 0:15 of 0:20 · muted · loops")).toBeVisible();
    const end = modal.getByRole("slider", { name: "End" });
    await end.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(end).toHaveValue("16");
    const refusal = checkTrim({ start: 0, end: 16, originalDurationSeconds: 20 });
    if (refusal.ok) throw new Error("expected core to refuse sixteen seconds");
    expect(refusal.message).toContain("15 seconds");
    await expect(modal.getByRole("status")).toHaveText(refusal.message);
    await expect(modal.getByRole("button", { name: "Use this stretch" })).toBeDisabled();
    await runAxe(page);

    // Trim to 10 s → the tile shows `processing`, then `ready` with a poster and the
    // regenerated description; the section reads the new trim line.
    for (let i = 0; i < 6; i += 1) await page.keyboard.press("Shift+ArrowLeft");
    await expect(end).toHaveValue("10");
    await expect(modal.getByText("0:00 – 0:10 of 0:20 · muted · loops")).toBeVisible();
    await expect(modal.getByRole("button", { name: "Use this stretch" })).toBeEnabled();
    const processing = rail.getByRole("button", { name: "clip-20s.mp4, processing" });
    await modal.getByRole("button", { name: "Use this stretch" }).click();
    await expect(modal).toHaveCount(0);
    await expect(processing).toBeVisible();
    const ready = rail.getByRole("button", { name: TRIMMED_TILE });
    await expect(ready).toBeVisible({ timeout: 60_000 });
    await expect(ready.locator("img")).toHaveAttribute("src", /poster\.[0-9a-f]{10}\.jpg$/);
    await expect(video.getByText("trim 0:00 – 0:10 of 0:20 · muted autoplay + loop")).toBeVisible();

    // The description on the tile: the fake's sentence, replaced by the volunteer's.
    await openTile(page, TRIMMED_TILE);
    const description = rail.getByRole("textbox", { name: "Description" });
    await expect(description).toHaveValue(FAKE_DESCRIPTION);
    await expect(rail.getByText("described automatically")).toBeVisible();
    await description.fill("Charlotte pacing the hall, tail up.");
    await page.keyboard.press("Enter");
    await expect(rail.getByText("written by a volunteer")).toBeVisible();
    await expect(rail.getByRole("button", { name: RENAMED_TILE })).toBeVisible();
    await runAxe(page);
    await draftSaved(page);
  });

  test("steps 13–14: the public clip is silent and loops; the live cat cannot be deleted; unpublish, then delete", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await signIn(page);
    await page.goto(`/builder/${id}`);
    const live = await publishCat(page);
    expect(live).toBe(`http://localhost:3100${url()}`);

    // Step 14: the published clip is the trimmed one, and ffprobe finds no audio stream.
    const published = await publishedOnDisk(id);
    const clips = Object.values(published.media).filter((entry) => entry.src.endsWith(".mp4"));
    expect(clips).toHaveLength(1);
    const src = clips[0]?.src ?? "";
    expect(src).toMatch(/\/web\.[0-9a-f]{10}\.mp4$/);
    const web = probe(resolve(PUBLIC_DIR, src.replace(/^\/media\//, "")));
    expect(web.streams).toEqual(["video"]);
    expect(Math.abs(web.duration - 10)).toBeLessThan(0.25);

    // On the page: muted, looping, one Pause and nothing that turns sound on.
    const visitor = await browser.newContext();
    const cat = await visitor.newPage();
    await cat.goto(url());
    const video = cat.locator("video");
    await video.scrollIntoViewIfNeeded();
    await expect(video).toHaveAttribute("src", src);
    await expect(video).toHaveJSProperty("muted", true);
    await expect(video).toHaveAttribute("loop");
    await expect(video).not.toHaveAttribute("controls");
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
    await cat.getByRole("button", { name: "Pause" }).click();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await expect(cat.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(cat.getByRole("button", { name: /sound|mute|volume/i })).toHaveCount(0);
    await expect(cat.getByText(/^0:(09|10) · no sound$/)).toBeVisible();
    await runAxe(cat);
    await visitor.close();

    // Step 13: the list offers no Delete on a live cat, nor on an archived one; after
    // Unpublish it does, and the folder goes with the cat.
    await page.goto("/builder");
    await expect(page.getByRole("article").filter({ hasText: "Charlotte" })).toContainText("LIVE");
    await expect(page.getByRole("button", { name: "Delete Charlotte" })).toHaveCount(0);
    await page.goto(`/builder/${id}`);
    await page.getByRole("button", { name: "Published" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("button", { name: "Archived" })).toBeVisible();
    await page.goto("/builder");
    await expect(page.getByRole("button", { name: "Delete Charlotte" })).toHaveCount(0);
    await page.goto(`/builder/${id}`);
    await page.getByRole("button", { name: "Archived" }).click();
    await page.getByRole("menuitem", { name: "Unpublish" }).click();
    const ask = page.getByRole("dialog", { name: "Take Charlotte off the site?" });
    await expect(ask).toContainText("this makes her a plain draft again");
    await ask.getByRole("button", { name: "Move to draft" }).click();
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
    await deleteCat(page, "Charlotte");
    await expect(stat(resolve(PROFILES_DIR, id))).rejects.toThrow();
  });
});
