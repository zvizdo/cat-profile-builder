import { expect, test, type Page } from "@playwright/test";
import { removeSeeded, seedCats, type SeededCat } from "./_lib";

// The device-pixel-snapped stage fit (F64 in specs/001-cat-profile-builder/tasks.md):
// a fractional-device-pixel stage edge is what made
// the frame's `overflow: hidden` clip flicker on the phone under the media layers'
// compositor animation. use-stage-fit.ts measures `.page` and snaps the stage's scale and
// offset to the device-pixel grid (stage-fit.ts), switching `.stage` to `data-fit="snapped"`
// once it has. `/carousel` and `/kiosk` share the same stage (Carousel.tsx), so one page
// stands in for both. One live cat is enough — the fit only needs a stage to be on screen.

let seeded: SeededCat[] = [];

/** The one `[data-beat]` stage, the same locator carousel.spec.ts uses. */
function stage(page: Page) {
  return page.locator("[data-beat]");
}

/**
 * True within a real browser's floating-point noise of a whole number. The brief's 1e-6
 * is what `fitStage`'s own arithmetic gives (proven in stage-fit.test.ts); a *rendered*
 * `getBoundingClientRect()` cannot get that close, measured directly: Chromium composites
 * `scale`/`translate` through a float32 matrix, so a value near 1920 or 1080 carries
 * ~1.2e-4 CSS px of rounding (1920 · 2⁻²³) before it is even multiplied by `dpr` — this
 * spec's own probe measured 6.1e-5 CSS px (390×844@3's width). 1e-3 device pixels stays
 * three orders of magnitude above that noise floor and five below the smallest offset the
 * investigation found visible (H2c's 1.5-device-pixel line; H2d's exact 1 was clean) — so
 * it still fails on any error large enough to matter and never on the render engine's own
 * rounding.
 */
function expectWhole(value: number): void {
  expect(Math.abs(value - Math.round(value))).toBeLessThan(1e-3);
}

/**
 * Waits for the hook's measurement to land, then the stage's box in device pixels
 * (`getBoundingClientRect()` times `dpr`) — never `innerWidth`/`innerHeight`, the same
 * reasoning use-stage-fit.ts follows.
 */
async function snappedDevicePxRect(
  page: Page,
  dpr: number,
): Promise<{ left: number; top: number; width: number; height: number }> {
  await expect(stage(page)).toHaveAttribute("data-fit", "snapped");
  const box = await stage(page).evaluate((el) => el.getBoundingClientRect().toJSON());
  return {
    left: box.x * dpr,
    top: box.y * dpr,
    width: box.width * dpr,
    height: box.height * dpr,
  };
}

test.describe.serial("the carousel stage's device-pixel fit (F64)", () => {
  test.beforeAll(() => {
    seeded = seedCats(1, 0);
  });

  test.afterAll(async () => {
    await removeSeeded(seeded);
  });

  test.describe("390×844 at dpr 3 — an iPhone-class phone, portrait", () => {
    test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });

    test("every edge lands on a whole device pixel and the frame keeps its 16:9 shape", async ({
      page,
    }) => {
      await page.goto("/carousel");
      const rect = await snappedDevicePxRect(page, 3);
      expectWhole(rect.left);
      expectWhole(rect.top);
      expectWhole(rect.width);
      expectWhole(rect.height);
      expect(rect.width / rect.height).toBeCloseTo(16 / 9, 5);
      // Pins .stage's `transition: none` (F64 review N2) deterministically: without it,
      // globals.css's blanket reduced-motion `transition-duration: 0.01ms !important`
      // turns the data-fit flip into two brief CSSTransitions that carousel.spec.ts's
      // "axe finds nothing under reduced motion" only caught 4 times in 5 (a 0.01ms
      // transition is often gone by the time that test's getAnimations() runs).
      expect(await stage(page).evaluate((el) => getComputedStyle(el).transitionProperty)).toBe(
        "none",
      );
    });
  });

  test.describe("844×390 at dpr 3 — the same phone, landscape", () => {
    test.use({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 });

    test("every edge lands on a whole device pixel and the frame keeps its 16:9 shape", async ({
      page,
    }) => {
      await page.goto("/carousel");
      const rect = await snappedDevicePxRect(page, 3);
      expectWhole(rect.left);
      expectWhole(rect.top);
      expectWhole(rect.width);
      expectWhole(rect.height);
      expect(rect.width / rect.height).toBeCloseTo(16 / 9, 5);
    });
  });

  test.describe("1440×900 at dpr 2 — a 16:10 laptop: the fit is exactly scale 0.75", () => {
    test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

    test("the frame sits at (0, 45) in CSS pixels, 1440×810", async ({ page }) => {
      await page.goto("/carousel");
      await expect(stage(page)).toHaveAttribute("data-fit", "snapped");
      const box = await stage(page).evaluate((el) => el.getBoundingClientRect().toJSON());
      expect(box.x).toBeCloseTo(0, 5);
      expect(box.y).toBeCloseTo(45, 5);
      expect(box.width).toBeCloseTo(1440, 5);
      expect(box.height).toBeCloseTo(810, 5);
    });
  });
});
