import { expect, test, type Page } from "@playwright/test";

// Editing in place, proved in a real browser with the boxes it really laid out (spec 002, T017):
// opening and refusing never move anything (FR-013), the arrangement is held while a field is
// open and the soft keyboard shrinks the stage (display-layout.md, Known risk), and a mouse
// resting where the fields were does not bring them back.

const SPRING = "/fundraiser?headline=Spring%20Vet%20Fund&raised=6500&goal=10000";
const EDIT = "Edit the amount raised and the goal";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What must not move when a session opens or a refusal arrives. */
const WATCHED = {
  logo: "main img",
  headline: "h1",
  raised: "[data-raised]",
  goal: "[data-goal-line]",
  row: "[data-edit-row]",
  meter: "[role=meter]",
  fill: "[data-fill]",
  shape: "[data-shape]",
};

async function boxes(page: Page): Promise<Record<string, Rect>> {
  return page.evaluate((selectors) => {
    const out: Record<string, Rect> = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no ${name}`);
      const b = element.getBoundingClientRect();
      out[name] = { x: b.x, y: b.y, w: b.width, h: b.height };
    }
    return out;
  }, WATCHED);
}

/** The figures' own width follows the text typed in them; everything else, and their height, must not change. */
const FOLLOWS_TEXT = ["raised", "goal"];

function expectSame(a: Record<string, Rect>, b: Record<string, Rect>, typed = false): void {
  for (const name of Object.keys(a)) {
    const keys =
      typed && FOLLOWS_TEXT.includes(name)
        ? (["y", "h"] as const)
        : (["x", "y", "w", "h"] as const);
    for (const key of keys) {
      expect(b[name]?.[key], `${name}.${key}`).toBeCloseTo(a[name]?.[key] ?? NaN, 1);
    }
  }
}

async function openAmounts(page: Page): Promise<void> {
  // Pressed low on the drawing, where the bulb is: the whole thermometer is the button.
  const button = page.getByRole("button", { name: EDIT });
  const at = await button.boundingBox();
  await button.click({ position: { x: (at?.width ?? 2) / 2, y: (at?.height ?? 12) - 10 } });
  await expect(page.getByRole("textbox", { name: "Amount raised" })).toBeVisible();
}

const SHAPES = [
  [1920, 1080],
  [1024, 768],
  [390, 844],
  [320, 568],
] as const;

for (const [width, height] of SHAPES) {
  test.describe(`refusals do not move anything at ${width}x${height}`, () => {
    test.use({ viewport: { width, height } });

    test("opening, then both fields refused with the longest sentences", async ({ page }) => {
      await page.goto(SPRING);
      const closed = await boxes(page);
      await openAmounts(page);
      expectSame(closed, await boxes(page));
      const open = await boxes(page);
      const entries: [string, string][] = [
        ["abc", "abc"],
        ["-5", "100,000,000"],
        ["abc", "0"],
        ["", "abc"],
      ];
      for (const [raised, goal] of entries) {
        await page.getByRole("textbox", { name: "Amount raised" }).fill(raised);
        await page.getByRole("textbox", { name: "Goal" }).fill(goal);
        await page.keyboard.press("Enter");
        await expect(page.locator("[role=alert][class*=refusal]")).not.toBeEmpty();
        expectSame(open, await boxes(page), true);
        // The sentences sit inside the reserved row, none of them below it.
        const spill = await page.evaluate(() => {
          const row = document.querySelector("[data-edit-row]")?.getBoundingClientRect();
          const spans = [...document.querySelectorAll("[role=alert][class*=refusal] span")];
          const bottoms = spans.flatMap((s) => [...s.getClientRects()].map((r) => r.bottom));
          return Math.max(...bottoms) - (row?.bottom ?? 0);
        });
        expect(spill).toBeLessThanOrEqual(0.5);
      }
    });
  });
}

for (const [width, height, ratio] of [
  [1000, 935, 1.07],
  [1100, 917, 1.2],
] as const) {
  test(`opening a session at a ratio of ${ratio} (${width}x${height}) changes nothing`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(SPRING);
    const closed = await boxes(page);
    await openAmounts(page);
    expectSame(closed, await boxes(page));
    await page.keyboard.press("Escape");
    // A hover preview opens it too, and must not move anything either.
    const meter = await page.getByRole("meter").boundingBox();
    await page.mouse.move(3, 3);
    await page.mouse.move((meter?.x ?? 0) + 10, (meter?.y ?? 0) + 40);
    await expect(page.getByRole("textbox", { name: "Amount raised" })).toBeVisible();
    expectSame(closed, await boxes(page));
  });
}

/** Whether the page is drawn as the centred stack: the thermometer sits below the goal line. */
async function isStack(page: Page): Promise<boolean> {
  const b = await boxes(page);
  return (b["meter"]?.y ?? 0) >= (b["goal"]?.y ?? 0) + (b["goal"]?.h ?? 0) - 1;
}

test.describe("the held arrangement under the soft keyboard", () => {
  for (const [width, height, shrunk] of [
    [390, 844, 420],
    // 340 is wider than tall (1.15): the query alone would flip it, unlike 420 (0.93).
    [390, 844, 340],
    [320, 568, 250],
  ] as const) {
    test(`a ${width}x${height} phone with a field open stays a stack at ${shrunk} tall`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto(SPRING);
      await openAmounts(page);
      const field = page.getByRole("textbox", { name: "Amount raised" });
      await field.fill("7,2");
      expect(await isStack(page)).toBe(true);
      await page.setViewportSize({ width, height: shrunk });
      await expect(field).toHaveValue("7,2");
      await expect(page.getByRole("textbox", { name: "Goal" })).toBeVisible();
      expect(await isStack(page)).toBe(true);
      // Done is still on the stage and pressable.
      const done = await page.getByRole("button", { name: "Done" }).boundingBox();
      expect((done?.y ?? 0) + (done?.height ?? 0)).toBeLessThanOrEqual(shrunk);
    });
  }

  test("the same shrink with no session open does flip it, which is what the hold prevents", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(SPRING);
    expect(await isStack(page)).toBe(true);
    await page.setViewportSize({ width: 320, height: 250 });
    expect(await isStack(page)).toBe(false);
  });

  test("the hold is let go when the session ends", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(SPRING);
    await openAmounts(page);
    await page.setViewportSize({ width: 320, height: 250 });
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-shape]")).not.toHaveAttribute("data-arrangement", /.+/);
    expect(await isStack(page)).toBe(false);
  });
});

test("a mouse resting where the fields were does not bring them back after Enter", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(SPRING);
  const meter = await page.getByRole("meter").boundingBox();
  await page.mouse.move((meter?.x ?? 0) + 10, (meter?.y ?? 0) + 40);
  const raised = page.getByRole("textbox", { name: "Amount raised" });
  await expect(raised).toBeVisible();
  const at = await raised.boundingBox();
  await page.mouse.move((at?.x ?? 0) + 40, (at?.y ?? 0) + 40, { steps: 8 });
  await raised.click({ clickCount: 3 });
  await page.keyboard.type("7,200");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-raised]")).toHaveText("$7,200");
  await page.waitForTimeout(700);
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

// T026 (accessibility review F6): a one-line field is 18 to 22 px tall on a phone, under the
// 24 px WCAG 2.2 minimum. Its pointer area is drawn taller by a pseudo-element, which must not
// move a pixel (the "changes nothing" tests above cover that) and must send a press to the field.

/** Whether the element at a point belongs to the field with this accessible name. */
async function pointReaches(page: Page, x: number, y: number, label: string): Promise<boolean> {
  return page.evaluate(
    ({ px, py, name }) =>
      document
        .elementFromPoint(px, py)
        ?.closest("span")
        ?.querySelector("input")
        ?.getAttribute("aria-label") === name,
    { px: x, py: y, name: label },
  );
}

test.describe("the amount fields have a pointer area of at least 24px", () => {
  for (const [width, height] of [
    [390, 844],
    [320, 568],
  ] as const) {
    test(`at ${width}x${height} a press 11px above or below a field's centre reaches it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto(SPRING);
      await openAmounts(page);
      for (const name of ["Amount raised", "Goal"]) {
        const field = page.getByRole("textbox", { name });
        const at = await field.boundingBox();
        expect(at).not.toBeNull();
        const x = (at?.x ?? 0) + (at?.width ?? 0) / 2;
        const y = (at?.y ?? 0) + (at?.height ?? 0) / 2;
        expect(await pointReaches(page, x, y - 11, name), `${name} above`).toBe(true);
        expect(await pointReaches(page, x, y + 11, name), `${name} below`).toBe(true);
        await page.mouse.click(x, y + 11);
        await expect(field).toBeFocused();
      }
    });
  }
});
