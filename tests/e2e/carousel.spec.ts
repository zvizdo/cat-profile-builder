import { expect, test, type Page } from "@playwright/test";
import {
  axeViolations,
  checkBoundaries,
  decodeQr,
  removeSeeded,
  seedCats,
  type SeededCat,
} from "./_lib";

// The carousel (T042; FR-061–FR-064, FR-067–FR-069, FR-084, FR-088, SC-005): twenty live
// cats and two archived ones are seeded through the real pipeline; `/carousel` shows the
// twenty and loops them, pauses on hover and on Space, opens the profile on a click,
// carries a scannable SVG QR of the cat's URL on every beat, never skips the single-photo
// cat, cuts the clip at the hold, and passes axe — once as it moves, once under reduced
// motion. One worker shares the store, so the seeded cats are removed at the end.

const FRAME = { width: 1920, height: 1080 };

let seeded: SeededCat[] = [];
let live: SeededCat[] = [];

test.describe.serial("/carousel with twenty live cats", () => {
  test.beforeAll(() => {
    seeded = seedCats(20, 2);
    live = seeded.filter((cat) => cat.status === "published");
    expect(live).toHaveLength(20);
    expect(seeded).toHaveLength(22);
  });

  test.afterAll(async () => {
    await removeSeeded(seeded);
  });

  test.use({ viewport: FRAME });

  /** The frame link, the one `<a>` the whole picture is. */
  function frame(page: Page) {
    return page.locator("a[aria-labelledby]");
  }

  function stage(page: Page) {
    return page.locator("[data-beat]");
  }

  /**
   * Pauses the clock (Space) so arrows can page without the beat moving underneath, and
   * waits for the first beat's entrance to land — the frame freezes fully revealed.
   */
  async function openPaused(page: Page, query = ""): Promise<void> {
    await page.goto(`/carousel${query}`);
    await expect(stage(page)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    await expect(stage(page)).toHaveAttribute("data-frozen", "true");
  }

  test("the twenty live cats appear, most recently published first; the archived two never do", async ({
    page,
  }) => {
    await openPaused(page);
    await expect(page.getByText("01 / 20")).toBeVisible();
    // No counter text ("Photo N of N", "Loop N") anywhere on the frame (user request).
    await expect(page.getByText(/Photo \d+ of \d+|Loop \d+/)).toHaveCount(0);
    const names: string[] = [];
    for (let i = 0; i < 20; i++) {
      names.push(await page.getByRole("heading", { level: 1 }).innerText());
      await page.keyboard.press("ArrowRight");
    }
    // Newest first: the seed publishes in order, so the last live cat published comes first.
    expect(names).toEqual([...live].reverse().map((cat) => cat.name));
    for (const cat of seeded.filter((c) => c.status === "archived")) {
      expect(names).not.toContain(cat.name);
    }
    // Twenty presses wrap: back to the first cat, on the second loop.
    await expect(page.getByText("01 / 20")).toBeVisible();
  });

  test("advances by itself at the hold and loops; the DOM never grows", async ({ page }) => {
    await page.goto("/carousel?hold=4");
    await expect(page.getByText("01 / 20")).toBeVisible();
    await expect(page.getByText("02 / 20")).toBeVisible({ timeout: 6000 });
    await expect(stage(page)).toHaveAttribute("data-beat", "b");
    // From the second beat on both layers hold a picture; the count never moves again.
    const nodes = await page.evaluate(() => document.querySelectorAll("*").length);
    await expect(page.getByText("03 / 20")).toBeVisible({ timeout: 6000 });
    await expect(stage(page)).toHaveAttribute("data-beat", "a");
    expect(await page.evaluate(() => document.querySelectorAll("*").length)).toBe(nodes);
    await expect(page.getByText("04 / 20")).toBeVisible({ timeout: 6000 });
    expect(await page.evaluate(() => document.querySelectorAll("*").length)).toBe(nodes);
  });

  test("a moving pointer pauses, a still one resumes after 3 s, leaving resumes; Space; ← →", async ({
    page,
  }) => {
    await page.goto("/carousel?hold=8");
    await expect(stage(page)).toHaveAttribute("data-paused", "false");
    await page.mouse.move(900, 500);
    await page.mouse.move(960, 540);
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    const before = await page.getByRole("heading", { level: 1 }).innerText();
    await page.waitForTimeout(2000);
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    // Three seconds without movement and the loop goes on by itself.
    await expect(stage(page)).toHaveAttribute("data-paused", "false", { timeout: 2500 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(before);
    await page.mouse.move(1000, 560);
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    // The frame fills the viewport, so the pointer cannot be moved off it; React derives
    // a leave from `pointerout` with nothing under the pointer, the same as leaving the window.
    await stage(page).dispatchEvent("pointerout");
    await expect(stage(page)).toHaveAttribute("data-paused", "false");

    await page.keyboard.press("Space");
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("02 / 20")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText("01 / 20")).toBeVisible();
    await page.getByRole("button", { name: "Next cat" }).click();
    await expect(page.getByText("02 / 20")).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(stage(page)).toHaveAttribute("data-paused", "false");
  });

  test("fits a 1440×900 laptop whole: the frame is centred and every control is on screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/carousel");
    await expect(stage(page)).toBeVisible();
    const rect = await stage(page).evaluate((el) => el.getBoundingClientRect().toJSON());
    expect(rect.x).toBeCloseTo(0, 0);
    expect(rect.width).toBeCloseTo(1440, 0);
    expect(rect.height).toBeCloseTo(810, 0);
    // 16:9 in a 16:10 screen: 45px of night above and below, the frame centred.
    expect(rect.y).toBeCloseTo(45, 0);
    for (const name of ["Previous cat", "Pause", "Next cat"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
      expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    }
    const open = await page.getByRole("link", { name: /^Open .*'s page$/ }).boundingBox();
    expect(open!.x + open!.width).toBeLessThanOrEqual(1440);
    expect(open!.y + open!.height).toBeLessThanOrEqual(900);
    const qr = await page.getByRole("img", { name: /^Scan/ }).boundingBox();
    expect(qr!.x + qr!.width).toBeLessThanOrEqual(1440);
  });

  test("a click on the frame opens that cat's page; so does the open control", async ({ page }) => {
    await openPaused(page);
    const href = await frame(page).getAttribute("href");
    const name = await page.getByRole("heading", { level: 1 }).innerText();
    expect(href).toBe(live.find((cat) => cat.name === name)?.url);
    await expect(page.getByRole("link", { name: `Open ${name}'s page` })).toHaveAttribute(
      "href",
      href ?? "",
    );
    await page.mouse.click(960, 300);
    await page.waitForURL(href ?? "");
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  });

  test("every beat carries an SVG QR, level H, 240px, whose payload is the cat's URL", async ({
    page,
  }) => {
    await openPaused(page);
    for (let i = 0; i < 3; i++) {
      const name = await page.getByRole("heading", { level: 1 }).innerText();
      const qr = page.getByRole("img", { name: `Scan — ${name}'s page` });
      expect(await qr.evaluate((node) => node.tagName)).toBe("svg");
      const box = await qr.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(240);
      expect(box?.height).toBeGreaterThanOrEqual(240);
      // Level H: a version-1 symbol holds 21 modules a side; any level-H symbol of these
      // URLs is at least 29 — a 240px box keeps every module above 4px.
      const modules = Number((await qr.getAttribute("viewBox"))?.split(" ")[2] ?? "0");
      expect(modules).toBeGreaterThanOrEqual(21);
      expect(240 / modules).toBeGreaterThanOrEqual(4);
      expect(decodeQr(await qr.screenshot())).toBe(live.find((cat) => cat.name === name)?.url);
      await page.keyboard.press("ArrowRight");
      // The next beat plays its entrance, then freezes fully revealed.
      await expect(stage(page)).toHaveAttribute("data-frozen", "false");
      await expect(stage(page)).toHaveAttribute("data-frozen", "true");
    }
  });

  test("the single-photo cat shows its one photo on every loop and holds its whole turn", async ({
    page,
  }) => {
    await openPaused(page, "?hold=4");
    const goToSolo = async (): Promise<void> => {
      for (let i = 0; i < 21; i++) {
        if ((await page.getByRole("heading", { level: 1 }).innerText()) === "Solo") return;
        await page.keyboard.press("ArrowRight");
      }
      throw new Error("Solo never came round");
    };
    await goToSolo();
    const first = await page
      .locator("[data-role='incoming'] [data-slat] > div")
      .first()
      .evaluate((el) => el.style.backgroundImage);
    await page.keyboard.press("ArrowRight");
    await goToSolo();
    expect(
      await page
        .locator("[data-role='incoming'] [data-slat] > div")
        .first()
        .evaluate((el) => el.style.backgroundImage),
    ).toBe(first);
    // Resumed, Solo keeps the frame for the whole hold — not skipped, not cut short.
    await page.keyboard.press("Space");
    await page.waitForTimeout(3000);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Solo");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Solo", { timeout: 3000 });
  });

  test("the 15s clip plays muted, inline, and is cut at the hold", async ({ page }) => {
    await openPaused(page, "?hold=4");
    // No "Loop N" text survives to key off, so count Clip's own appearances instead: the
    // second one is its second loop.
    let clipTurns = 0;
    for (let i = 0; i < 45; i++) {
      const name = await page.getByRole("heading", { level: 1 }).innerText();
      if (name === "Clip") {
        clipTurns++;
        if (clipTurns === 2) break;
      }
      await page.keyboard.press("ArrowRight");
    }
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clip");
    const video = page.locator("video");
    await expect(video).toHaveAttribute("playsinline", "");
    await expect(video).toHaveAttribute("loop", "");
    expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await page.keyboard.press("Space");
    // Sample until the beat ends and the clip leaves the frame; it never passes the hold.
    let max = 0;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(250);
      const t = await page.evaluate(() => document.querySelector("video")?.currentTime ?? -1);
      if (t < 0) break;
      max = Math.max(max, t);
    }
    expect(max).toBeGreaterThan(1);
    expect(max).toBeLessThanOrEqual(4);
  });

  test("axe finds nothing, moving", async ({ page }) => {
    await page.goto("/carousel");
    await expect(stage(page)).toBeVisible();
    // Judge the frame fully revealed: past the entrance, then frozen.
    await page.waitForTimeout(2500);
    await page.keyboard.press("Space");
    const { violations, passes } = await axeViolations(page);
    process.stdout.write(`axe /carousel: ${passes} rules passed, ${violations.length} violated\n`);
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });

  test("axe finds nothing under reduced motion, where nothing moves and arrows page", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/carousel?hold=4");
    await expect(stage(page)).toHaveAttribute("data-reduced", "true");
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.getByText("01 / 20")).toBeVisible();
    await page.waitForTimeout(5000);
    await expect(page.getByText("01 / 20")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("02 / 20")).toBeVisible();
    // Nothing moves by itself, so no pause is offered, and the beat bar sits at rest.
    await expect(page.getByRole("button", { name: /Pause|Resume/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next cat" })).toBeVisible();
    const { violations, passes } = await axeViolations(page);
    process.stdout.write(
      `axe /carousel (reduced motion): ${passes} rules passed, ${violations.length} violated\n`,
    );
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
});

// F62: since 6d23165 the two media layers painted in DOM order rather than by role, so on
// every parity `a` beat the incoming layer's wipe or playing clip sat under the outgoing
// layer's fully open picture — a visitor watching the TV never saw the new cat's photo or
// clip, only the previous one held under the new name. Solo (no clip) and Clip (a photo
// and a 15s clip, its `pickMedia` cycling photo/video every other loop) alternate every
// beat, so over 8 automatic boundaries Clip is reached four times and, since its own loop
// count advances once per visit, exactly two of those four are its video turn — the "beat
// after a clip" case (the video paused, outgoing) falls right after each of them.
test.describe.serial("/carousel — the incoming layer paints on top (F62)", () => {
  let seeded: SeededCat[] = [];

  test.beforeAll(() => {
    seeded = seedCats(2, 0);
  });

  test.afterAll(async () => {
    await removeSeeded(seeded);
  });

  test.use({ viewport: FRAME });

  test("over 8 beats at hold=3, the incoming layer is always on top and always shows the cat named in <h1>; two of the eight are the clip", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/carousel?hold=3");
    await expect(page.locator("[data-beat]")).toBeVisible();
    const { videoBeats } = await checkBoundaries(page, 8);
    expect(videoBeats).toBe(2);
  });

  test("same, with /media/ throttled by 1.5s: the preload lands the file before the wipe needs it", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.route("**/media/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto("/carousel?hold=3");
    await expect(page.locator("[data-beat]")).toBeVisible();
    await checkBoundaries(page, 8, { requireLoaded: true });
  });
});

test.describe("/carousel with nothing live", () => {
  test("shows the empty rotation, and axe finds nothing", async ({ page }) => {
    await page.goto("/carousel");
    await expect(
      page.getByRole("heading", { level: 1, name: "Nothing in the rotation" }),
    ).toBeVisible();
    await expect(page.getByText("No cats are on the carousel right now.")).toBeVisible();
    const { violations } = await axeViolations(page);
    expect(violations).toEqual([]);
  });
});
