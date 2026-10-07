import { expect, test, type Page } from "@playwright/test";
import {
  EPS,
  describe,
  inside,
  measure,
  outsideStage,
  overlapsFound,
  paintedFillShare,
  settled,
  type Box,
} from "./_lib/fundraiser";

// The fundraiser display (spec 002, T014): `/fundraiser` on the production build, proved the
// way a person would meet it. It needs no sign-in, no store and no seeding; the whole state is
// in the address. Five groups of checks:
//
//   (a) the shape check (SC-004, FR-007): five screens and six phone shapes over the three
//       worst cases, measured with bounding boxes, never by eye;
//   (b) full screen: the button, the display state and the way back (FR-010 to FR-012);
//   (c) reduced motion: the fill's real transition duration, parsed to seconds (FR-008);
//   (d) thermometer accuracy: the fill, the tag and the lit paws against the true share of the
//       scale box (SC-002);
//   (e) nothing stored: no cookie, no storage (FR-022).
//
// Set FUNDRAISER_SHOTS to a directory to also save one screenshot per shape of the first worst
// case (a way to look at the result; nothing is written unless the variable is set).

/**
 * The only collapsed (visually hidden) texts allowed under the font floor: words that are spoken
 * and never read. Anything else that collapses to a pixel still has to meet the floor.
 */
const SPOKEN_ONLY = new Set(["Edit headline"]);

const WIDE_HEADLINE = "W".repeat(60);

/**
 * The worst cases of the quickstart's five-shape check, by name, address and the text the
 * percentage tag must read, plus a blank address so the starting hint is measured too.
 */
const CASES = [
  {
    name: "60 wide letters with $99,999,999.99 both",
    query: `headline=${WIDE_HEADLINE}&raised=99999999.99&goal=99999999.99`,
    tag: "100% ($100M)",
  },
  {
    name: "a 1-cent goal, the largest percentage",
    query: "goal=0.01&raised=99999999.99",
    tag: "999%+ ($100M)",
  },
  {
    name: "the 65% sample",
    query: "headline=Spring%20Vet%20Fund&raised=6500&goal=10000",
    tag: "65% ($6.5K)",
  },
  { name: "a blank address with the starting hint", query: "", tag: "0% ($0)" },
] as const;

/** The address of a case; a blank one has no question mark at all. */
function addressOf(query: string): string {
  return query === "" ? "/fundraiser" : `/fundraiser?${query}`;
}

/** The screens (display-layout.md, the quickstart) and the phone shapes (Short screens). */
const SHAPES = [
  { name: "16:9", width: 1920, height: 1080 },
  { name: "16:10", width: 1920, height: 1200 },
  { name: "4:3", width: 1024, height: 768 },
  { name: "21:9", width: 2560, height: 1080 },
  { name: "9:16", width: 1080, height: 1920 },
  { name: "phone 320x568", width: 320, height: 568 },
  { name: "phone 360x640", width: 360, height: 640 },
  { name: "phone 375x667", width: 375, height: 667 },
  { name: "phone 390x844", width: 390, height: 844 },
  { name: "phone on its side 667x375", width: 667, height: 375 },
  { name: "phone on its side 844x390", width: 844, height: 390 },
] as const;

for (const shape of SHAPES) {
  test.describe(`shape check: ${shape.name} (${shape.width}x${shape.height})`, () => {
    test.use({ viewport: { width: shape.width, height: shape.height } });

    for (const [index, worst] of CASES.entries()) {
      test(`${worst.name}: nothing scrolls, clips, overlaps or falls under the floor`, async ({
        page,
      }) => {
        await page.goto(addressOf(worst.query));
        await expect(page.getByRole("meter", { name: "Fundraising progress" })).toBeVisible();
        await expect(page.locator("[data-tag-track]")).toHaveText(worst.tag);
        await settled(page);

        const shots = process.env["FUNDRAISER_SHOTS"];
        if (shots && index === 0) {
          await page.screenshot({ path: `${shots}/${shape.width}x${shape.height}.png` });
        }

        const m = await measure(page);
        const viewport: Box = { left: 0, top: 0, right: shape.width, bottom: shape.height };

        // No scrollbar: the page is no larger than the window, and the stage hides nothing it clipped.
        expect(m.viewport).toEqual({ width: shape.width, height: shape.height });
        expect(m.page.scrollWidth, "page scrollWidth").toBeLessThanOrEqual(shape.width);
        expect(m.page.scrollHeight, "page scrollHeight").toBeLessThanOrEqual(shape.height);
        expect(m.stage.scrollWidth, "stage scrollWidth").toBeLessThanOrEqual(m.stage.clientWidth);
        expect(m.stage.scrollHeight, "stage scrollHeight").toBeLessThanOrEqual(
          m.stage.clientHeight,
        );
        expect(m.stage.box).toEqual(viewport);

        // Every line of text, and the logo, the goal line and the button, lie inside the stage.
        expect(m.texts.length).toBeGreaterThan(8);
        expect(outsideStage(m.texts, m.stage.box)).toEqual([]);
        for (const box of [m.logo, m.button, m.goalLine, m.goalFigure, ...m.meterParts]) {
          expect(box).not.toBeNull();
          if (box)
            expect(inside(box, m.stage.box), `box ${describe(box)} inside the stage`).toBe(true);
        }

        // Nothing overlaps: the left group, the thermometer (tube, bulb, tag, paws), the button and its note.
        expect(overlapsFound(m)).toEqual([]);

        // The four paws sit at least 4px apart (display-layout.md, Short screens).
        expect(m.paws).toHaveLength(4);
        expect(m.pawIcon).toBeGreaterThan(0);
        for (let i = 1; i < m.paws.length; i += 1) {
          const lower = m.paws[i - 1];
          const upper = m.paws[i];
          if (lower && upper) {
            expect(
              lower.top - upper.bottom,
              `gap between paw ${i} and paw ${i + 1}`,
            ).toBeGreaterThanOrEqual(4);
          }
        }

        // Every text at or above max(10px, 2.4cqmin). The stage is the viewport, so 1cqmin is 1% of the shorter side.
        const floor = Math.max(10, 0.024 * Math.min(shape.width, shape.height));
        const small = m.texts
          .filter((t) => (!t.hidden || !SPOKEN_ONLY.has(t.text)) && t.fontSize < floor - 0.01)
          .map((t) => `"${t.text.slice(0, 20)}" ${t.fontSize}px < ${floor}px`);
        expect(small).toEqual([]);
      });
    }
  });
}

// Carried over from the T012 review: the goal figure is deliberately not stepped down, so
// `$99,999,999.99` must wrap inside the narrowest stack rather than leave the stage.
test.describe("the goal line at the narrowest stack", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("$99,999,999.99 stays inside the stage and wraps instead of overflowing", async ({
    page,
  }) => {
    await page.goto(`/fundraiser?${CASES[0].query}`);
    const goalLine = page.locator("[data-goal-line]");
    await expect(goalLine).toContainText("$99,999,999.99");
    await settled(page);
    const box = await goalLine.boundingBox();
    const figure = await goalLine.locator("b").boundingBox();
    expect(box).not.toBeNull();
    expect(figure).not.toBeNull();
    if (!box || !figure) return;
    for (const b of [box, figure]) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(320 + EPS);
      expect(b.y + b.height).toBeLessThanOrEqual(568 + EPS);
    }
    expect(await goalLine.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
});

/** The text a viewer reads and the meter's spoken value, to compare before and after. */
async function readFigures(page: Page): Promise<Record<string, string | null>> {
  return {
    headline: await page.getByRole("heading", { level: 1 }).textContent(),
    raised: await page.locator("[data-raised]").textContent(),
    goalLine: await page.locator("[data-goal-line]").textContent(),
    spoken: await page
      .getByRole("meter", { name: "Fundraising progress" })
      .getAttribute("aria-valuetext"),
    now: await page
      .getByRole("meter", { name: "Fundraising progress" })
      .getAttribute("aria-valuenow"),
  };
}

test.describe("full screen", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  // Headless Chromium honours `requestFullscreen()` from a real click (research R12 asked us
  // to confirm it), so this drives the real API and no stub is needed. It does NOT act on
  // Escape (it has no window manager to take the key), so the way back is
  // `document.exitFullscreen()`, which fires the same `fullscreenchange` Escape would.
  test("the button enters, the controls are absent, and leaving restores the same numbers", async ({
    page,
  }) => {
    await page.goto("/fundraiser?headline=Spring%20Vet%20Fund&raised=6500&goal=10000");
    const button = page.getByRole("button", { name: /full screen/i });
    await expect(button).toBeVisible();
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    const before = await readFigures(page);
    expect(before["spoken"]).toBe("$6,500 raised of a $10,000 goal, 65 percent");

    await button.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    // Absent, not hidden: nothing is left to take focus or to be read out.
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(await readFigures(page)).toEqual(before);
    const m = await pageExtents(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
    expect(m.scrollHeight).toBeLessThanOrEqual(m.innerHeight);

    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
    await expect(button).toBeVisible();
    // Both live regions are back, each found by what it is: the Full screen note stands beside
    // the button, the hidden "Updated:" line is the page's own (T017).
    await expect(button.locator("xpath=preceding-sibling::*[@role='status']")).toHaveCount(1);
    await expect(page.locator("main > [role=status]")).toHaveCount(1);
    expect(await readFigures(page)).toEqual(before);
  });

  test("the starting hint goes with the controls and returns after", async ({ page }) => {
    await page.goto("/fundraiser");
    const hint = page.getByText("Hover, tap or Tab to the thermometer to set your goal.");
    const figures = await readFigures(page);
    expect(figures["raised"]).toBe("$0");
    await expect(hint).toBeVisible();

    await page.getByRole("button", { name: /full screen/i }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await expect(hint).toHaveCount(0);
    expect(await readFigures(page)).toEqual(figures);

    await page.evaluate(() => document.exitFullscreen());
    await expect(hint).toBeVisible();
  });
});

/** The page's scroll extents against its window, read in the browser. */
function pageExtents(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
}

/**
 * A computed duration as seconds. Never compare the strings: Chromium writes 320ms as `0.32s`
 * and the reduced-motion rule's 0.01ms in a different form (`1e-05s`), so the number and its
 * unit are read and converted.
 */
function seconds(duration: string): number {
  const first = duration.split(",")[0]?.trim() ?? "";
  const match = /^(-?[\d.]+(?:e-?\d+)?)(ms|s)$/i.exec(first);
  if (!match?.[1] || !match[2]) throw new Error(`not a duration: "${duration}"`);
  const value = Number.parseFloat(match[1]);
  return match[2].toLowerCase() === "ms" ? value / 1000 : value;
}

/** The three elements that carry the transform transitions: the fill's mask and gradient, and the tag's track. */
const MOTION = ["[data-fill]", "[data-fill] > div", "[data-tag-track]"] as const;

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("the fill and tag glide for the panel duration, and arrive at once under reduced motion", async ({
    page,
  }) => {
    await page.goto("/fundraiser?raised=6500&goal=10000");
    await expect(page.getByRole("meter", { name: "Fundraising progress" })).toBeVisible();
    const read = async (selector: string) =>
      seconds(
        await page.locator(selector).evaluate((el) => getComputedStyle(el).transitionDuration),
      );

    for (const selector of MOTION) expect(await read(selector), selector).toBeCloseTo(0.32, 2);

    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const selector of MOTION)
      expect(await read(selector), selector).toBeLessThanOrEqual(0.001);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const selector of MOTION) expect(await read(selector), selector).toBeCloseTo(0.32, 2);
  });

  test("a page opened under reduced motion starts with the short duration", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/fundraiser?raised=6500&goal=10000");
    const duration = await page
      .locator("[data-fill]")
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(seconds(duration)).toBeLessThanOrEqual(0.001);
  });
});

// SC-002: the fill is within 1% of the true share of the scale box. The scale box is the tube,
// which is `fillClip` (the `overflow: hidden` element that parents the fill). The fill is a
// transform reveal of two layers: the mask is as tall as the clip and is moved up by
// `(1 - level)` of its own height, and the gradient inside it is moved down by the same amount
// so the colour stays pinned to the tube. What is painted is where the clip, the mask AND the
// gradient overlap, so the test reads all three boxes through getBoundingClientRect and takes
// that overlap's height as the fill's painted height, with no knowledge of `--level` or the
// stylesheet. A gradient that lost its counter-move would still leave the mask box right, so
// the pinned colour is checked too (the gradient covers the clip's whole height), and the
// pixel test below paints the tube and finds the edge in the picture itself. The tag is checked
// the same way (its centre sits on the fill line) and so are the paws (lit exactly when their
// share is met).
test.describe("thermometer accuracy (SC-002)", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  const GOAL = 10000;
  const SWEEP = [0, 1, 25, 33.3, 50, 65, 99, 100, 120];

  for (const percent of SWEEP) {
    test(`${percent}% of the goal fills ${Math.min(percent, 100)}% of the scale box`, async ({
      page,
    }) => {
      const raised = (GOAL * percent) / 100;
      await page.goto(`/fundraiser?raised=${raised}&goal=${GOAL}`);
      await expect(page.getByRole("meter", { name: "Fundraising progress" })).toBeVisible();
      await settled(page);

      const m = await page.evaluate(() => {
        const mask = document.querySelector("[data-fill]");
        const clip = mask?.parentElement;
        const gradient = mask?.firstElementChild;
        const tag = document.querySelector("[data-tag-track]")?.firstElementChild;
        if (!mask || !clip || !gradient || !tag) {
          throw new Error("the fill, its gradient, its clip or the tag is missing");
        }
        const c = clip.getBoundingClientRect();
        const f = mask.getBoundingClientRect();
        const g = gradient.getBoundingClientRect();
        const t = tag.getBoundingClientRect();
        return {
          clipTop: c.top,
          clipBottom: c.bottom,
          clipHeight: c.height,
          visible: Math.max(
            0,
            Math.min(f.bottom, g.bottom, c.bottom) - Math.max(f.top, g.top, c.top),
          ),
          // How far the gradient has drifted from the tube it must stay pinned to.
          gradientDrift: Math.max(Math.abs(g.top - c.top), Math.abs(g.bottom - c.bottom)),
          tagCentre: (t.top + t.bottom) / 2,
          paws: Array.from(document.querySelectorAll("[data-paw]")).map((p) => {
            const r = p.getBoundingClientRect();
            return { centre: (r.top + r.bottom) / 2, lit: p.getAttribute("data-lit") };
          }),
        };
      });

      const share = Math.min(percent / 100, 1);
      expect(m.clipHeight).toBeGreaterThan(300);
      expect(Math.abs(m.visible / m.clipHeight - share)).toBeLessThanOrEqual(0.01);
      expect(m.gradientDrift / m.clipHeight).toBeLessThanOrEqual(0.01);
      expect(Math.abs((m.clipBottom - m.tagCentre) / m.clipHeight - share)).toBeLessThanOrEqual(
        0.01,
      );
      // Each paw is centred on its share (25, 50, 75, goal) and lit exactly when that share is met.
      const litCount = [25, 50, 75, 100].filter((at) => percent >= at).length;
      expect(m.paws.filter((p) => p.lit === "true")).toHaveLength(litCount);
      for (const [i, paw] of m.paws.entries()) {
        const at = [0.25, 0.5, 0.75, 1][i] ?? Number.NaN;
        expect(Math.abs((m.clipBottom - paw.centre) / m.clipHeight - at)).toBeLessThanOrEqual(0.01);
      }
    });
  }
});

// The picture itself: the tube is photographed and the fill's edge is found in the pixels,
// independent of every box and transform above. Three levels, one pixel of slack on top of 1%.
test.describe("thermometer accuracy in the picture (SC-002)", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  for (const percent of [25, 50, 80]) {
    test(`${percent}% paints ${percent}% of the tube`, async ({ page }) => {
      await page.goto(`/fundraiser?raised=${percent * 100}&goal=10000`);
      await expect(page.getByRole("meter", { name: "Fundraising progress" })).toBeVisible();
      await settled(page);
      const height = (await page.locator("[data-fill]").locator("..").boundingBox())?.height ?? 0;
      expect(height).toBeGreaterThan(300);
      const share = await paintedFillShare(page);
      expect(Math.abs(share - percent / 100)).toBeLessThanOrEqual(0.01 + 1 / height);
    });
  }
});

test.describe("nothing is stored (FR-022)", () => {
  test("no cookie, no storage after load, full screen or a reload", async ({ page, context }) => {
    const response = await page.goto(
      "/fundraiser?headline=Spring%20Vet%20Fund&raised=6500&goal=10000",
    );
    expect(response?.headers()["set-cookie"]).toBeUndefined();
    await expect(page.getByRole("meter", { name: "Fundraising progress" })).toBeVisible();

    const stored = () =>
      page.evaluate(() => ({
        cookie: document.cookie,
        local: localStorage.length,
        session: sessionStorage.length,
      }));
    expect(await stored()).toEqual({ cookie: "", local: 0, session: 0 });
    expect(await context.cookies()).toEqual([]);

    await page.getByRole("button", { name: /full screen/i }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await page.reload();
    await expect(page.getByRole("meter", { name: "Fundraising progress" })).toBeVisible();
    expect(await stored()).toEqual({ cookie: "", local: 0, session: 0 });
    expect(await context.cookies()).toEqual([]);
  });
});
