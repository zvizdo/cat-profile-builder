import { expect, test } from "@playwright/test";
import { removeSeeded, seedCats, type SeededCat } from "./_lib";

// The frame-rate proof (ADR-009; SC-003, Waiver 2): twenty live cats, `/carousel` at
// 1920×1080, `requestAnimationFrame` sampled for ten seconds. The number is printed and
// attached on every run; it is asserted (≥ 30) only under `FPS_GATE=1`, because headless
// CI Chromium paints the clip-path wipes on the CPU and would fail for the wrong reason.
// The binding measurement is `FPS_GATE=1 pnpm test:e2e --grep fps` on a machine with a GPU.

const SECONDS = 10;
const FLOOR = 30;

let seeded: SeededCat[] = [];

test.describe("fps", () => {
  test.beforeAll(() => {
    seeded = seedCats(20, 0);
    expect(seeded).toHaveLength(20);
  });

  test.afterAll(async () => {
    await removeSeeded(seeded);
  });

  test.use({ viewport: { width: 1920, height: 1080 } });

  test("the carousel holds its frame rate with twenty cats", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto("/carousel?hold=4");
    await expect(page.getByText("01 / 20")).toBeVisible();
    // Let the first beat's images arrive before the clock starts.
    await page.waitForTimeout(1000);
    const frames = await page.evaluate(
      (seconds) =>
        new Promise<number>((done) => {
          let count = 0;
          const start = performance.now();
          const tick = (): void => {
            count++;
            if (performance.now() - start < seconds * 1000) requestAnimationFrame(tick);
            else done(count);
          };
          requestAnimationFrame(tick);
        }),
      SECONDS,
    );
    const fps = frames / SECONDS;
    const line = `fps: ${fps.toFixed(1)} over ${SECONDS}s at 1920×1080 with 20 cats (gate ${process.env.FPS_GATE === "1" ? "on" : "off"})`;
    process.stdout.write(`${line}\n`);
    await testInfo.attach("fps", { body: line, contentType: "text/plain" });
    if (process.env.FPS_GATE === "1") expect(fps).toBeGreaterThanOrEqual(FLOOR);
  });
});
