import { expect, test, type Page } from "@playwright/test";
import { axeViolations, checkBoundaries, removeSeeded, seedCats, type SeededCat } from "./_lib";

// The kiosk (T043; FR-063–FR-069, SC-005, SC-008): `/kiosk` is the carousel's frame —
// not a link here; the strip's "Open this cat" is the way to a profile — and nothing else;
// its controls are shown while the pointer moves or presses and fade after three still
// seconds, staying in the tab order; the keyboard works while they are faded; a clicked
// control does not pin them; a pause gives up after a minute without input; the
// five-minute poll lands a changed roster at a beat boundary and never before, following
// the cat on show so nothing repeats or is skipped; a poll that fails shows the offline
// sentence with the last good time; and axe finds nothing with the controls shown, faded,
// and under reduced motion. The poll and idle journeys run on Playwright's fake clock, so
// minutes pass in a moment. One worker shares the store, so the seeded cats are removed at
// the end.

const FRAME = { width: 1920, height: 1080 };
const POLL_MS = 5 * 60_000;
const IDLE_RESUME_MS = 60_000;

interface Cat {
  name: string;
  url: string;
}

let seeded: SeededCat[] = [];

function stage(page: Page) {
  return page.locator("[data-beat]");
}

function strip(page: Page) {
  return page.locator("[data-shown]");
}

/** Fails on any axe violation, printing the rule count under `label`. */
async function sweep(page: Page, label: string): Promise<void> {
  const { violations, passes } = await axeViolations(page);
  process.stdout.write(`axe ${label}: ${passes} rules passed, ${violations.length} violated\n`);
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

test.describe.serial("/kiosk with twenty live cats", () => {
  test.beforeAll(() => {
    seeded = seedCats(20, 2);
    expect(seeded.filter((cat) => cat.status === "published")).toHaveLength(20);
  });

  test.afterAll(async () => {
    await removeSeeded(seeded);
  });

  test.use({ viewport: FRAME });

  test("shows the frame and nothing else; the controls are faded until the pointer moves and fade again after 3 s", async ({
    page,
  }) => {
    await page.goto("/kiosk");
    await expect(page.getByText("01 / 20")).toBeVisible();
    // No counter text ("Photo N of N", "Loop N") anywhere on the frame (user request).
    await expect(page.getByText(/Photo \d+ of \d+|Loop \d+/)).toHaveCount(0);
    await expect(page.locator("header, nav, footer")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Carousel controls" })).toHaveCount(1);
    // The frame is not a link: the one link on the page is the strip's open control.
    await expect(page.locator("a[aria-labelledby]")).toHaveCount(0);
    await expect(page.getByRole("link")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /^Open .*'s page$/ })).toHaveAttribute(
      "href",
      /\/cats\//,
    );
    await expect(strip(page)).toHaveAttribute("data-shown", "false");
    await expect(strip(page)).toHaveCSS("opacity", "0");
    await page.mouse.move(900, 500);
    await page.mouse.move(960, 540);
    await expect(strip(page)).toHaveAttribute("data-shown", "true");
    await expect(strip(page)).toHaveCSS("opacity", "1");
    await sweep(page, "/kiosk (controls shown)");
    // axe parks the pointer at (0,0), which is a move; three still seconds later, faded.
    await expect(strip(page)).toHaveAttribute("data-shown", "false", { timeout: 4000 });
    await expect(strip(page)).toHaveCSS("opacity", "0");
    await sweep(page, "/kiosk (controls faded)");
  });

  test("a tap shows the controls; a click on the picture stays on the kiosk; a clicked control does not pin them", async ({
    page,
  }) => {
    await page.goto("/kiosk");
    await expect(page.getByText("01 / 20")).toBeVisible();
    await expect(strip(page)).toHaveAttribute("data-shown", "false");
    await stage(page).dispatchEvent("pointerdown", { pointerType: "touch", bubbles: true });
    await expect(strip(page)).toHaveAttribute("data-shown", "true");
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    await expect(strip(page)).toHaveAttribute("data-shown", "false", { timeout: 4000 });
    await page.mouse.click(960, 300);
    await expect(page).toHaveURL(/\/kiosk$/);
    await expect(page.getByText(/^\d\d \/ 20$/)).toBeVisible();
    await page.getByRole("button", { name: "Next cat" }).click();
    await expect(page.getByText("02 / 20")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next cat" })).toBeFocused();
    await expect(strip(page)).toHaveAttribute("data-shown", "true");
    // The pointer rests on the button; three still seconds later the strip fades anyway.
    await expect(strip(page)).toHaveAttribute("data-shown", "false", { timeout: 4000 });
    await expect(strip(page)).toHaveCSS("opacity", "0");
  });

  test("a pause gives up after a minute without input", async ({ page }) => {
    await page.clock.install();
    await page.goto("/kiosk");
    await expect(page.getByText("01 / 20")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("02 / 20")).toBeVisible();
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    await page.clock.runFor(IDLE_RESUME_MS - 1000);
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    await page.clock.runFor(1000);
    await expect(stage(page)).toHaveAttribute("data-paused", "false");
    await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(1);
    // Playing again: the beat the arrow opened runs out and the loop moves on.
    await page.clock.runFor(8500);
    await expect(page.getByText("02 / 20")).toHaveCount(0);
    await expect(stage(page)).toHaveAttribute("data-paused", "false");
  });

  test("the keyboard works while the controls are faded, and focus shows them again", async ({
    page,
  }) => {
    await page.goto("/kiosk");
    await expect(page.getByText("01 / 20")).toBeVisible();
    await expect(strip(page)).toHaveAttribute("data-shown", "false");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("02 / 20")).toBeVisible();
    await expect(strip(page)).toHaveAttribute("data-shown", "false");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText("01 / 20")).toBeVisible();
    await page.keyboard.press("Space");
    await expect(stage(page)).toHaveAttribute("data-paused", "false");
    // No frame link: the first Tab lands on the strip.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Previous cat" })).toBeFocused();
    await expect(strip(page)).toHaveAttribute("data-shown", "true");
    await expect(strip(page)).toHaveCSS("opacity", "1");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Pause" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Resume" })).toBeFocused();
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /^Open .*'s page$/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(strip(page)).toHaveAttribute("data-shown", "false");
  });

  /**
   * Opens the kiosk on the fake clock and reaches the second beat, where both layers hold
   * a picture; answers the live roster as `reshape` says from then on; runs the clock to
   * just short of the beat after the poll; and answers what is on show and what should
   * follow it in the OLD order — the cat after it that is still live.
   */
  async function pollWith(
    page: Page,
    reshape: (cats: Cat[], shown: string) => Cat[],
  ): Promise<{ nodes: number; shown: string; expectedNext: string }> {
    await page.clock.install();
    await page.goto("/kiosk");
    await expect(page.getByText("01 / 20")).toBeVisible();
    await page.clock.runFor(8500);
    await expect(page.getByText("02 / 20")).toBeVisible();
    const nodes = await page.evaluate(() => document.querySelectorAll("*").length);
    let old: Cat[] = [];
    let reshaped: Cat[] = [];
    // `page.clock.runFor` only fast-forwards the page's fake timers; it fires the poll's
    // `fetch` and returns without waiting for that fetch's real round trip to the dev
    // server to finish. On a loaded machine that round trip (through this route intercept)
    // can outlast a fixed wait, so the route handler signals its own completion here and
    // is awaited directly below, rather than polling `old.length` against a capped timeout.
    let routeDone!: () => void;
    let routeFailed!: (err: unknown) => void;
    const routeAnswered = new Promise<void>((resolve, reject) => {
      routeDone = resolve;
      routeFailed = reject;
    });
    await page.route("**/api/carousel", async (route) => {
      try {
        const response = await route.fetch();
        const body = (await response.json()) as { cats: Cat[] };
        old = body.cats;
        // The answer lands mid-beat: what is on show now is what the boundary steps from.
        reshaped = reshape(body.cats, await page.getByRole("heading", { level: 1 }).innerText());
        await route.fulfill({ response, json: { cats: reshaped } });
        routeDone();
      } catch (err) {
        // Reject so the test fails fast with the real cause, instead of `routeAnswered`
        // hanging unresolved until Playwright's own timeout.
        routeFailed(err);
        throw err;
      }
    });
    // On page.clock only a handful of beats fire per runFor (React re-arms the next beat on
    // a real task), so where the beat stands is read rather than computed: the poll has
    // answered, and the beat on show has most of its hold left.
    await page.clock.runFor(POLL_MS - 8000);
    await routeAnswered;
    expect(old).toHaveLength(20);
    const shown = await page.getByRole("heading", { level: 1 }).innerText();
    const live = new Set(reshaped.map((cat) => cat.name));
    const at = old.findIndex((cat) => cat.name === shown);
    const expectedNext =
      old.slice(at + 1).find((cat) => live.has(cat.name))?.name ?? reshaped[0]?.name ?? "";
    return { nodes, shown, expectedNext };
  }

  test("an unpublish lands at the next beat boundary, never mid-beat, and skips no cat; the DOM never grows", async ({
    page,
  }) => {
    const { nodes, shown, expectedNext } = await pollWith(page, (cats) => cats.slice(1));
    await expect(page.getByText(/\/ 20$/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(shown);
    await page.clock.runFor(2500);
    await expect(page.getByText(/\/ 20$/)).toBeVisible();
    await page.clock.runFor(6000);
    await expect(page.getByText(/\/ 19$/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(expectedNext);
    expect(await page.evaluate(() => document.querySelectorAll("*").length)).toBe(nodes);
  });

  test("an unpublish of the cat on show lands at the boundary on its former follower", async ({
    page,
  }) => {
    const { shown, expectedNext } = await pollWith(page, (cats, onShow) =>
      cats.filter((cat) => cat.name !== onShow),
    );
    await expect(page.getByText(/\/ 20$/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(shown);
    await page.clock.runFor(8500);
    await expect(page.getByText(/\/ 19$/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(expectedNext);
    expect(expectedNext).not.toBe(shown);
  });

  test("a publish lands at the next beat boundary and repeats no cat", async ({ page }) => {
    const { shown, expectedNext } = await pollWith(page, (cats) => [
      { ...cats[0], name: "Newcomer", url: `${cats[0]?.url}-new` } as Cat,
      ...cats,
    ]);
    await expect(page.getByText(/\/ 20$/)).toBeVisible();
    await page.clock.runFor(8500);
    await expect(page.getByText(/\/ 21$/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(expectedNext);
    expect(expectedNext).not.toBe(shown);
  });

  test("a poll that fails keeps the loop on yesterday's cats and dates the last good moment; the next success clears it", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(2026, 8, 12, 14, 2) });
    await page.goto("/kiosk");
    await expect(page.getByText("01 / 20")).toBeVisible();
    const note = page.getByRole("status");
    await expect(note).toBeEmpty();
    await page.route("**/api/carousel", (route) => route.abort());
    await page.clock.runFor(POLL_MS + 500);
    await expect(note).toContainText("The carousel keeps looping on yesterday's cats.");
    await expect(note).toContainText("Last updated 14:02");
    await expect(page.getByText(/\/ 20$/)).toBeVisible();
    // The loop goes on underneath.
    const before = await page.getByRole("heading", { level: 1 }).innerText();
    await page.clock.runFor(8000);
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(before);
    await sweep(page, "/kiosk (offline)");
    await page.unroute("**/api/carousel");
    await page.clock.runFor(POLL_MS);
    await expect(note).toBeEmpty();
  });

  test("axe finds nothing under reduced motion, where the controls simply stay and arrows page", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/kiosk?hold=4");
    await expect(stage(page)).toHaveAttribute("data-reduced", "true");
    await expect(strip(page)).toHaveAttribute("data-shown", "true");
    await expect(page.getByText("01 / 20")).toBeVisible();
    await page.waitForTimeout(5000);
    await expect(page.getByText("01 / 20")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("02 / 20")).toBeVisible();
    await expect(page.getByRole("button", { name: /Pause|Resume/ })).toHaveCount(0);
    await sweep(page, "/kiosk (reduced motion)");
    await expect(strip(page)).toHaveAttribute("data-shown", "true");
  });
});

// F62: the same paint-order bug the carousel spec covers, on the kiosk's own frame (not a
// link here, but the same two `[data-layer]` nodes and the same CSS). Solo (no clip) and
// Clip (a photo and a 15s clip) alternate every beat; over 8 automatic boundaries Clip's
// own loop count means exactly two of its four turns are the video.
test.describe.serial("/kiosk — the incoming layer paints on top (F62)", () => {
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
    await page.goto("/kiosk?hold=3");
    await expect(stage(page)).toBeVisible();
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
    await page.goto("/kiosk?hold=3");
    await expect(stage(page)).toBeVisible();
    await checkBoundaries(page, 8, { requireLoaded: true });
  });
});

test.describe("/kiosk with nothing live", () => {
  test("shows the empty rotation, and axe finds nothing", async ({ page }) => {
    await page.goto("/kiosk");
    await expect(
      page.getByRole("heading", { level: 1, name: "Nothing in the rotation" }),
    ).toBeVisible();
    await expect(page.getByText("No cats are on the carousel right now.")).toBeVisible();
    await expect(page.getByRole("group")).toHaveCount(0);
    await sweep(page, "/kiosk (empty)");
  });
});
