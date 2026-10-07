import { expect, test, type Page } from "@playwright/test";
import { paintedFillShare, settled } from "./_lib/fundraiser";

// The page address as the whole of the state (spec 002, T018; quickstart 8 and 9): a confirmed
// edit is written with `replaceState`, so a reload or a copied link shows the same display and
// Back is not trapped; any address, however hostile, still gives a full page. Proved on the
// production build in a real browser.

const SPRING = "/fundraiser?headline=Spring%20Vet%20Fund&raised=6500&goal=10000";
const EDIT = "Edit the amount raised and the goal";
const HINT = "Hover, tap or Tab to the thermometer to set your goal.";
const DEFAULT_HEADLINE = "Help us reach our goal";

/** What a person reads on the display, plus how full the tube is painted. */
interface Shown {
  headline: string;
  raised: string;
  goal: string;
  meter: string;
  fill: number;
}

async function shown(page: Page): Promise<Shown> {
  const meter = page.getByRole("meter", { name: "Fundraising progress" });
  await expect(meter).toBeVisible();
  await settled(page);
  return {
    headline: (await page.locator("h1").textContent()) ?? "",
    raised: (await page.locator("[data-raised]").textContent()) ?? "",
    goal: /\$[\d,.]+/.exec((await page.locator("[data-goal-line]").textContent()) ?? "")?.[0] ?? "",
    meter: (await meter.getAttribute("aria-valuetext")) ?? "",
    fill: Math.round((await paintedFillShare(page)) * 100) / 100,
  };
}

/** Opens the amounts, types both, and presses Enter (the fields may stay open if refused). */
async function typeAmounts(page: Page, raised: string, goal: string): Promise<void> {
  const button = page.getByRole("button", { name: EDIT });
  const at = await button.boundingBox();
  await button.click({ position: { x: (at?.width ?? 2) / 2, y: (at?.height ?? 12) - 10 } });
  await page.getByRole("textbox", { name: "Amount raised" }).fill(raised);
  await page.getByRole("textbox", { name: "Goal" }).fill(goal);
  await page.keyboard.press("Enter");
}

/** {@link typeAmounts}, then waits for the fields to close (the edit was accepted). */
async function editAmounts(page: Page, raised: string, goal: string): Promise<void> {
  await typeAmounts(page, raised, goal);
  await expect(page.getByRole("textbox", { name: "Amount raised" })).toHaveCount(0);
}

test.describe("a confirmed edit is in the address (quickstart 8)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the address carries the edit, a reload and a second browser show the same display", async ({
    page,
    browser,
  }) => {
    await page.goto(SPRING);
    await editAmounts(page, "7,200", "10,000");
    await expect(page).toHaveURL(/raised=7200/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/fundraiser");
    expect(url.search).toBe("?headline=Spring%20Vet%20Fund&raised=7200&goal=10000");
    const before = await shown(page);
    expect(before).toMatchObject({ headline: "Spring Vet Fund", raised: "$7,200" });
    expect(before.fill).toBeCloseTo(0.72, 1);

    await page.reload();
    expect(await shown(page)).toEqual(before);

    const other = await browser.newContext();
    try {
      const second = await other.newPage();
      await second.goto(page.url());
      expect(await shown(second)).toEqual(before);
    } finally {
      await other.close();
    }
  });

  test("a changed goal with cents travels too", async ({ page }) => {
    await page.goto(SPRING);
    await editAmounts(page, "100", "2,500.50");
    expect(new URL(page.url()).search).toBe(
      "?headline=Spring%20Vet%20Fund&raised=100&goal=2500.50",
    );
    const before = await shown(page);
    await page.reload();
    expect(await shown(page)).toEqual(before);
    expect(before).toMatchObject({ raised: "$100", goal: "$2,500.50" });
  });

  test("a refused confirm, a cancel and a no-change confirm leave the address alone", async ({
    page,
  }) => {
    await page.goto(SPRING);
    const url = page.url();
    await typeAmounts(page, "7,200", "0");
    await expect(page.getByRole("alert").first()).not.toBeEmpty();
    expect(page.url()).toBe(url);
    await page.keyboard.press("Escape");
    expect(page.url()).toBe(url);
    await editAmounts(page, "6,500", "10,000");
    expect(page.url()).toBe(url);
  });

  test("three edits add no history entry and Back leaves the page as it normally would", async ({
    page,
  }) => {
    await page.goto("/fundraiser?headline=Before&raised=1&goal=10");
    await page.goto(SPRING);
    const length = await page.evaluate(() => window.history.length);
    for (const raised of ["7,000", "7,100", "7,200"]) await editAmounts(page, raised, "10,000");
    expect(await page.evaluate(() => window.history.length)).toBe(length);
    expect(new URL(page.url()).search).toContain("raised=7200");
    await page.goBack();
    await expect(page).toHaveURL(/headline=Before/);
    await expect(page.locator("h1")).toHaveText("Before");
  });

  test("editing writes no cookie and nothing to storage", async ({ page, context }) => {
    await page.goto(SPRING);
    await editAmounts(page, "7,200", "10,000");
    await expect(page).toHaveURL(/raised=7200/);
    const stored = await page.evaluate(async () => ({
      cookie: document.cookie,
      local: localStorage.length,
      session: sessionStorage.length,
      databases: (await indexedDB.databases()).length,
    }));
    expect(stored).toEqual({ cookie: "", local: 0, session: 0, databases: 0 });
    expect(await context.cookies()).toEqual([]);
  });
});

/** Every bad address of quickstart 9, and what each bad value must fall back to, alone. */
const BAD = [
  { query: "?raised=abc", headline: DEFAULT_HEADLINE, raised: "$0", goal: "$5,000" },
  { query: "?goal=-1&raised=1000", headline: DEFAULT_HEADLINE, raised: "$1,000", goal: "$5,000" },
  { query: "?goal=0&raised=1000", headline: DEFAULT_HEADLINE, raised: "$1,000", goal: "$5,000" },
  { query: "?headline=%3Cscript%3E", headline: "<script>", raised: "$0", goal: "$5,000" },
  { query: "?raised=1e9&goal=2000", headline: DEFAULT_HEADLINE, raised: "$0", goal: "$2,000" },
  {
    query: "?headline=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&raised=500&goal=1000",
    headline: "<img src=x onerror=alert(1)>",
    raised: "$500",
    goal: "$1,000",
  },
  {
    query: "?headline=%E2%80%8B%E2%80%8B",
    headline: DEFAULT_HEADLINE,
    raised: "$0",
    goal: "$5,000",
  },
  {
    query: `?headline=${"a".repeat(10_000)}`,
    headline: "a".repeat(60),
    raised: "$0",
    goal: "$5,000",
  },
  { query: "?raised=1,23&goal=0x10", headline: DEFAULT_HEADLINE, raised: "$0", goal: "$5,000" },
  {
    query: "?raised=99999999999999999999",
    headline: DEFAULT_HEADLINE,
    raised: "$0",
    goal: "$5,000",
  },
  {
    query: "?raised=5&raised=9000&goal=",
    headline: DEFAULT_HEADLINE,
    raised: "$5",
    goal: "$5,000",
  },
] as const;

test.describe("any address gives a full page (quickstart 9)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const bad of BAD) {
    test(`${bad.query.slice(0, 60)}`, async ({ page }) => {
      const dialogs: string[] = [];
      page.on("dialog", (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      });
      const response = await page.goto(`/fundraiser${bad.query}`);
      expect(response?.status()).toBe(200);
      const display = await shown(page);
      expect(display).toMatchObject({ headline: bad.headline, raised: bad.raised, goal: bad.goal });
      // The headline is words: no element inside it, and nothing the address wrote came alive.
      // In the editing view the h1 holds one button (its own words) and nothing else.
      expect(await page.locator("h1 > :not(button), h1 button > *").count()).toBe(0);
      expect(await page.locator("h1 > button").count()).toBe(1);
      expect(await page.locator("main img[onerror], main script, img[src='x']").count()).toBe(0);
      await expect(page.getByRole("button", { name: "Full screen" })).toBeVisible();
      await page.waitForTimeout(200);
      expect(dialogs).toEqual([]);
    });
  }

  test("an address with no values shows the starting state and the hint", async ({ page }) => {
    await page.goto("/fundraiser");
    expect(await shown(page)).toMatchObject({
      headline: DEFAULT_HEADLINE,
      raised: "$0",
      goal: "$5,000",
    });
    await expect(page.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
    await expect(page.getByText(HINT)).toBeVisible();
  });
});
