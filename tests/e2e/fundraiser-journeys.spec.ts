import { expect, test, type Page } from "@playwright/test";
import { axeViolations } from "./_lib";
import { settled } from "./_lib/fundraiser";

// The fundraiser display as a whole (spec 002, T020; quickstart 3, 6, 8, 10, 11, 12, 15): the
// journeys a person makes across the amounts, the headline, a reload and a second window; the
// boxes of the four figures held still while each session opens (FR-013); a touch run through
// the soft keyboard (scenario 15); zero axe violations in every state the page can be in; the
// keyboard-only walkthrough (scenario 11); and the two routes around it. What the narrower
// specs already prove (the five-shape check, the address round trip, the held arrangement at
// several heights) is not repeated here.

const SPRING = "/fundraiser?headline=Spring%20Vet%20Fund&raised=6500&goal=10000";
const EDIT = "Edit the amount raised and the goal";

const raisedField = (page: Page) => page.getByRole("textbox", { name: "Amount raised" });
const goalField = (page: Page) => page.getByRole("textbox", { name: "Goal" });
const headlineField = (page: Page) => page.getByRole("textbox", { name: "Headline" });
const thermometerButton = (page: Page) => page.getByRole("button", { name: EDIT });

/** Two animation frames: long enough for a "just closed" flag to clear, and no longer. */
function twoFrames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );
}

/** What a person reads on the display. */
async function read(page: Page) {
  await expect(page.getByRole("meter", { name: "Fundraising progress" })).toBeVisible();
  await settled(page);
  return {
    headline: await page.locator("h1").innerText(),
    raised: await page.locator("[data-raised]").innerText(),
    goal: await page.locator("[data-goal-line]").innerText(),
    spoken: await page.getByRole("meter").getAttribute("aria-valuetext"),
  };
}

/** Fails on any axe violation, naming the rules and where they fired. */
async function expectNoViolations(page: Page): Promise<void> {
  const { violations } = await axeViolations(page);
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

test.describe("a whole journey: amounts and headline, a reload, a second window", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("both edits are in the address and every window shows them", async ({ page, browser }) => {
    await page.goto(SPRING);
    expect(await read(page)).toMatchObject({ headline: "Spring Vet Fund", raised: "$6,500" });

    // Amounts first, by the keyboard path a person would use: Enter on a field confirms.
    await thermometerButton(page).hover();
    await raisedField(page).fill("7,200");
    await goalField(page).fill("9,000");
    await page.keyboard.press("Enter");
    await expect(raisedField(page)).toHaveCount(0);
    await expect(page.locator("[data-raised]")).toHaveText("$7,200");

    // Then the headline, by the pointer.
    await page.getByRole("button", { name: "Spring Vet Fund" }).click();
    await headlineField(page).fill("Winter Warm Fund");
    await page.keyboard.press("Enter");
    await expect(headlineField(page)).toHaveCount(0);
    await expect(page.locator("h1")).toHaveText("Winter Warm Fund");

    // The address now carries all three values, and nothing else.
    const query = new URL(page.url()).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      headline: "Winter Warm Fund",
      raised: "7200",
      goal: "9000",
    });
    const edited = await read(page);
    expect(edited).toEqual({
      headline: "Winter Warm Fund",
      raised: "$7,200",
      goal: expect.stringContaining("$9,000"),
      spoken: "$7,200 raised of a $9,000 goal, 80 percent",
    });

    await page.reload();
    expect(await read(page)).toEqual(edited);

    const other = await browser.newContext();
    try {
      const second = await other.newPage();
      await second.goto(page.url());
      expect(await read(second)).toEqual(edited);
      // The second window is its own page: an edit there does not reach the first.
      await second.getByRole("button", { name: "Winter Warm Fund" }).click();
      await headlineField(second).fill("Another Fund");
      await second.keyboard.press("Enter");
      await expect(second.locator("h1")).toHaveText("Another Fund");
      await expect(page.locator("h1")).toHaveText("Winter Warm Fund");
    } finally {
      await other.close();
    }
  });
});

/** What must not move when either session opens (FR-013): the four figures and the drawing. */
const FIGURES = {
  headline: "h1",
  raised: "[data-raised]",
  goal: "[data-goal-line]",
  thermometer: "[role=meter]",
  fill: "[data-fill]",
};

async function figureBoxes(page: Page): Promise<Record<string, number[]>> {
  return page.evaluate((selectors) => {
    const out: Record<string, number[]> = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no ${name}`);
      const b = element.getBoundingClientRect();
      out[name] = [b.x, b.y, b.width, b.height];
    }
    return out;
  }, FIGURES);
}

function expectBoxesHeld(before: Record<string, number[]>, after: Record<string, number[]>): void {
  for (const [name, box] of Object.entries(before)) {
    box.forEach((value, i) => {
      expect(
        Math.abs((after[name]?.[i] ?? Number.NaN) - value),
        `${name}[${["x", "y", "w", "h"][i]}] moved`,
      ).toBeLessThanOrEqual(0.5);
    });
  }
}

test.describe("no layout shift when a session opens (FR-013)", () => {
  for (const [width, height] of [
    [1920, 1080],
    [390, 844],
  ] as const) {
    test(`${width}x${height}: hovering the thermometer, then pressing the headline, moves no figure`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto(SPRING);
      await settled(page);
      const closed = await figureBoxes(page);

      await thermometerButton(page).hover();
      await expect(raisedField(page)).toBeVisible();
      await settled(page);
      expectBoxesHeld(closed, await figureBoxes(page));

      // Away from the thermometer, the hover preview closes and the figures are as they were.
      await page.mouse.move(3, 3);
      await expect(raisedField(page)).toHaveCount(0);
      await settled(page);
      expectBoxesHeld(closed, await figureBoxes(page));

      await page.getByRole("button", { name: "Spring Vet Fund" }).click();
      await expect(headlineField(page)).toBeFocused();
      await settled(page);
      expectBoxesHeld(closed, await figureBoxes(page));
    });
  }

  test("the check can fail: boxes that did move are reported", () => {
    const before = { goal: [0, 0, 100, 20] };
    expect(() => expectBoxesHeld(before, { goal: [0, 1, 100, 20] })).toThrow();
    expect(() => expectBoxesHeld(before, { goal: [0.4, 0.4, 100, 20] })).not.toThrow();
  });
});

test.describe("scenario 15 on a touch screen, through the soft keyboard", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  /** The centred stack: the thermometer sits below the goal line. */
  async function isStack(page: Page): Promise<boolean> {
    const meter = await page.getByRole("meter").boundingBox();
    const goal = await page.locator("[data-goal-line]").boundingBox();
    return (meter?.y ?? 0) >= (goal?.y ?? 0) + (goal?.height ?? 0) - 1;
  }

  test("tap, tap a field, the keyboard opens, type, tap Done: a stack throughout, applied on the first tap", async ({
    page,
  }) => {
    await page.goto(SPRING);
    expect(await isStack(page)).toBe(true);

    // The first tap is the open; no hover exists, and nothing takes focus yet.
    await thermometerButton(page).tap();
    await expect(raisedField(page)).toBeVisible();
    await expect(raisedField(page)).not.toBeFocused();
    expect(await isStack(page)).toBe(true);

    // The second tap takes the field; the keyboard rises and the visible height shrinks to a
    // wider-than-tall window, which would flip a plain media query.
    await raisedField(page).tap();
    await expect(raisedField(page)).toBeFocused();
    await page.setViewportSize({ width: 390, height: 340 });
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("7,200");
    await expect(raisedField(page)).toHaveValue("7,200");
    await expect(goalField(page)).toBeVisible();
    expect(await isStack(page)).toBe(true);

    const done = page.getByRole("button", { name: "Done" });
    const at = await done.boundingBox();
    expect((at?.y ?? 0) + (at?.height ?? 0)).toBeLessThanOrEqual(340);
    expect(at?.height ?? 0).toBeGreaterThanOrEqual(44);
    await done.tap();

    await expect(raisedField(page)).toHaveCount(0);
    await expect(page.locator("[data-raised]")).toHaveText("$7,200");
    expect(new URL(page.url()).searchParams.get("raised")).toBe("7200");

    // With the keyboard gone and the session over, the hold is let go.
    await expect(page.locator("[data-shape]")).not.toHaveAttribute("data-arrangement", /.+/);
  });

  test("a tap on the headline opens it focused; the keyboard shrink keeps the stack; Done applies it", async ({
    page,
  }) => {
    await page.goto(SPRING);
    await page.getByRole("button", { name: "Spring Vet Fund" }).tap();
    await expect(headlineField(page)).toBeFocused();
    await page.setViewportSize({ width: 390, height: 340 });
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Touch Fund");
    expect(await isStack(page)).toBe(true);
    await page.getByRole("button", { name: "Done" }).tap();
    await expect(page.locator("h1")).toHaveText("Touch Fund");
    expect(new URL(page.url()).searchParams.get("headline")).toBe("Touch Fund");
  });
});

test.describe("zero axe violations (SC-005)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the editing view", async ({ page }) => {
    await page.goto(SPRING);
    await read(page);
    await expectNoViolations(page);
  });

  test("the starting state with its hint", async ({ page }) => {
    await page.goto("/fundraiser");
    await expect(
      page.getByText("Hover, tap or Tab to the thermometer to set your goal."),
    ).toBeVisible();
    await expectNoViolations(page);
  });

  test("with the amount fields open, and with the headline field open", async ({ page }) => {
    await page.goto(SPRING);
    await thermometerButton(page).click();
    await expect(raisedField(page)).toBeVisible();
    await expectNoViolations(page);
    await page.keyboard.press("Escape");
    await expect(raisedField(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Spring Vet Fund" }).click();
    await expect(headlineField(page)).toBeVisible();
    await expectNoViolations(page);
  });

  test("with a refusal shown, for an amount and for the headline", async ({ page }) => {
    await page.goto(SPRING);
    await thermometerButton(page).click();
    await raisedField(page).fill("abc");
    await page.keyboard.press("Enter");
    const alert = page.locator("[data-edit-row] [role=alert]");
    await expect(alert).not.toBeEmpty();
    await expectNoViolations(page);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Spring Vet Fund" }).click();
    await headlineField(page).fill("");
    await page.keyboard.press("Enter");
    await expect(alert).not.toBeEmpty();
    await expectNoViolations(page);
  });

  test("in full screen", async ({ page }) => {
    await page.goto(SPRING);
    await page.getByRole("button", { name: /full screen/i }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await expect(page.getByRole("button")).toHaveCount(0);
    await expectNoViolations(page);
  });

  test("under reduced motion, in the editing view and with a field open", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SPRING);
    await read(page);
    expect(
      await page.locator("[data-fill]").evaluate((el) => getComputedStyle(el).transitionDuration),
      "reduced motion is really on",
    ).not.toBe("0.32s");
    await expectNoViolations(page);
    await thermometerButton(page).click();
    await expect(raisedField(page)).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("keyboard only (scenario 11)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Tab order is Full screen, headline, thermometer, raised, goal, Done; Done returns focus without reopening", async ({
    page,
  }) => {
    await page.goto(SPRING);
    await read(page);
    const order: [string, () => ReturnType<Page["locator"]>][] = [
      ["Full screen", () => page.getByRole("button", { name: "Full screen" })],
      ["headline", () => page.getByRole("button", { name: "Spring Vet Fund" })],
      ["thermometer", () => thermometerButton(page)],
      ["raised", () => raisedField(page)],
      ["goal", () => goalField(page)],
      ["Done", () => page.getByRole("button", { name: "Done" })],
    ];
    for (const [name, target] of order) {
      await page.keyboard.press("Tab");
      await expect(target(), `Tab lands on ${name}`).toBeFocused();
    }
    // The thermometer button opened the fields by taking focus, and they are the next stops.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(raisedField(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("8,000");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const done = page.getByRole("button", { name: "Done" });
    await expect(done).toBeFocused();
    // Focus is visibly marked on Done.
    expect(await done.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");

    await page.keyboard.press("Enter");
    await expect(raisedField(page)).toHaveCount(0);
    await expect(thermometerButton(page)).toBeFocused();
    await twoFrames(page);
    await expect(raisedField(page)).toHaveCount(0);
    await expect(page.locator("[data-raised]")).toHaveText("$8,000");
    expect(new URL(page.url()).searchParams.get("raised")).toBe("8000");
  });

  test("Escape with the thermometer button already focused closes it, and the next Tab-in opens it again", async ({
    page,
  }) => {
    await page.goto(SPRING);
    await thermometerButton(page).focus();
    await expect(raisedField(page)).toBeVisible();
    await expect(thermometerButton(page)).toBeFocused();

    // Focus never left the button, so a focus() on close fires no event: nothing may be held
    // back from the next real arrival.
    await page.keyboard.press("Escape");
    await expect(raisedField(page)).toHaveCount(0);
    await expect(thermometerButton(page)).toBeFocused();
    await twoFrames(page);
    await expect(raisedField(page)).toHaveCount(0);

    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Spring Vet Fund" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(thermometerButton(page)).toBeFocused();
    await expect(raisedField(page)).toBeVisible();
  });

  test("Escape from a field returns focus to the thermometer button and does not reopen it", async ({
    page,
  }) => {
    await page.goto(SPRING);
    await thermometerButton(page).focus();
    await page.keyboard.press("Tab");
    await expect(raisedField(page)).toBeFocused();
    await page.keyboard.type("1");
    await page.keyboard.press("Escape");
    await expect(raisedField(page)).toHaveCount(0);
    await expect(thermometerButton(page)).toBeFocused();
    await twoFrames(page);
    await expect(raisedField(page)).toHaveCount(0);
    await expect(page.locator("[data-raised]")).toHaveText("$6,500");
    expect(new URL(page.url()).searchParams.get("raised")).toBe("6500");
  });
});

test.describe("the routes around it", () => {
  test("/fundraiser answers 200 with no cookie, no redirect", async ({ request }) => {
    const response = await request.get("/fundraiser", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect(response.headers()["location"]).toBeUndefined();
  });

  test("/fundraiser in a browser with no cookie stays at its address", async ({
    page,
    context,
  }) => {
    expect(await context.cookies()).toEqual([]);
    const response = await page.goto("/fundraiser");
    expect(response?.status()).toBe(200);
    expect(response?.request().redirectedFrom()).toBeNull();
    expect(new URL(page.url()).pathname).toBe("/fundraiser");
    await expect(page.getByRole("meter", { name: "Fundraising progress" })).toBeVisible();
  });

  test("/kiosk still answers and draws its frame", async ({ page }) => {
    const response = await page.goto("/kiosk");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/kiosk");
    await expect(page.locator("main, [data-beat]").first()).toBeVisible();
  });
});
