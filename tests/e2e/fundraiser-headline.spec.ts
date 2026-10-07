import { expect, test, type Page } from "@playwright/test";
import {
  describe,
  inside,
  measure,
  outsideStage,
  overlaps,
  overlapsFound,
  settled,
  type Box,
} from "./_lib/fundraiser";

// Editing the headline in place (spec 002, T019; quickstart 6, SC-011), on the production build:
// the shape check of T014 re-run with the headline field open, the headline's trip through the
// address (a hostile one included), the keyboard path, and that opening the field moves nothing.

const WIDE_HEADLINE = "W".repeat(60);
const SPRING = "/fundraiser?headline=Spring%20Vet%20Fund&raised=6500&goal=10000";

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

/** The box of an element as the browser laid it out, or a thrown error naming what is missing. */
async function boxOf(page: Page, selector: string): Promise<Box> {
  return page.evaluate((css): Box => {
    const element = document.querySelector(css);
    if (!element) throw new Error(`no element matches ${css}`);
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, selector);
}

/** The headline's button, found by its words. */
const headlineButton = (page: Page, name: string) => page.getByRole("button", { name });
const headlineField = (page: Page) => page.getByRole("textbox", { name: "Headline" });

for (const shape of SHAPES) {
  test.describe(`shape check with the headline field open: ${shape.name}`, () => {
    test.use({ viewport: { width: shape.width, height: shape.height } });

    test("60 wide letters: inside the stage, no overlap, no scroll, nothing clipped in the field", async ({
      page,
    }) => {
      await page.goto(`/fundraiser?headline=${WIDE_HEADLINE}&raised=99999999.99&goal=99999999.99`);
      await expect(page.getByRole("meter", { name: "Fundraising progress" })).toBeVisible();
      await headlineButton(page, WIDE_HEADLINE).click();
      await expect(headlineField(page)).toBeFocused();
      await settled(page);

      const m = await measure(page);
      const stage: Box = { left: 0, top: 0, right: shape.width, bottom: shape.height };
      expect(m.page.scrollWidth, "page scrollWidth").toBeLessThanOrEqual(shape.width);
      expect(m.page.scrollHeight, "page scrollHeight").toBeLessThanOrEqual(shape.height);
      expect(m.stage.scrollWidth).toBeLessThanOrEqual(m.stage.clientWidth);
      expect(m.stage.scrollHeight).toBeLessThanOrEqual(m.stage.clientHeight);
      expect(outsideStage(m.texts, m.stage.box)).toEqual([]);
      expect(overlapsFound(m)).toEqual([]);

      // The field itself (the box the person is typing in), against the stage and the neighbours.
      const field = await boxOf(page, "[data-headline] textarea");
      expect(inside(field, stage), `field ${describe(field)} inside the stage`).toBe(true);
      const neighbours: [string, Box | null][] = [
        ["logo", m.logo],
        ["Full screen button", m.button],
        ...m.meterParts.map((box, i): [string, Box] => [`thermometer part ${i}`, box]),
      ];
      for (const [name, box] of neighbours) {
        expect(box).not.toBeNull();
        if (box) expect(overlaps(field, box), `${name} ${describe(box)} / field`).toBe(false);
      }

      // Nothing is hidden or slid inside the textarea: typing never scrolls it (a tight line height
      // made it scroll by the glyphs' own overshoot), and it is exactly the size of its hidden copy.
      await page.keyboard.press("End");
      await page.keyboard.type("W");
      await page.keyboard.press("Backspace");
      const inner = await headlineField(page).evaluate((el) => {
        const mirror = el.previousElementSibling?.getBoundingClientRect();
        const own = el.getBoundingClientRect();
        return {
          scrollTop: el.scrollTop,
          scrollLeft: el.scrollLeft,
          dw: own.width - (mirror?.width ?? Number.NaN),
          dh: own.height - (mirror?.height ?? Number.NaN),
        };
      });
      expect(inner.scrollTop, "textarea scrollTop").toBe(0);
      expect(inner.scrollLeft, "textarea scrollLeft").toBe(0);
      expect(Math.abs(inner.dw), "textarea width minus its copy's").toBeLessThanOrEqual(0.5);
      expect(Math.abs(inner.dh), "textarea height minus its copy's").toBeLessThanOrEqual(0.5);
      expect(await headlineField(page).inputValue()).toBe(WIDE_HEADLINE);
    });
  });
}

test.describe("the refusal sentence sits in the shared edit row", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("61 wide letters are refused in the edit row, and the row, the figures and the thermometer do not move", async ({
    page,
  }) => {
    await page.goto(`/fundraiser?headline=${WIDE_HEADLINE}&raised=99999999.99&goal=99999999.99`);
    await headlineButton(page, WIDE_HEADLINE).click();
    await settled(page);
    const before = {
      row: await boxOf(page, "[data-edit-row]"),
      raised: await boxOf(page, "[data-raised]"),
      meter: await boxOf(page, "[role=meter]"),
    };
    await headlineField(page).fill("W".repeat(61));
    await page.keyboard.press("Enter");
    const alert = page.locator("[data-edit-row] [role=alert]");
    await expect(alert).toHaveText("Keep the headline to 60 characters or fewer.");
    await expect(headlineField(page)).toHaveValue("W".repeat(61));
    await settled(page);
    expect(await boxOf(page, "[data-edit-row]")).toEqual(before.row);
    expect(await boxOf(page, "[data-raised]")).toEqual(before.raised);
    expect(await boxOf(page, "[role=meter]")).toEqual(before.meter);
    const sentence = await boxOf(page, "[data-edit-row] [role=alert]");
    expect(inside(sentence, await boxOf(page, "[data-edit-row]"))).toBe(true);
    expect(inside(sentence, { left: 0, top: 0, right: 320, bottom: 568 })).toBe(true);
    expect(new URL(page.url()).search).toContain(`headline=${WIDE_HEADLINE}`);
  });
});

test.describe("the headline travels in the address (quickstart 6 and 8)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("an edited headline is in the address, and a reload shows it", async ({ page }) => {
    await page.goto(SPRING);
    await headlineButton(page, "Spring Vet Fund").click();
    await headlineField(page).fill("Winter Vet Fund");
    await page.keyboard.press("Enter");
    await expect(headlineField(page)).toHaveCount(0);
    await expect(page.locator("h1")).toHaveText("Winter Vet Fund");
    expect(new URL(page.url()).search).toBe("?headline=Winter%20Vet%20Fund&raised=6500&goal=10000");
    await page.reload();
    await expect(page.locator("h1")).toHaveText("Winter Vet Fund");
    await expect(page.getByRole("meter")).toHaveAttribute("aria-valuenow", "6500");
  });

  test("a hostile headline typed into the field is shown as words, and the address round-trips", async ({
    page,
  }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    const typed = `<img src=x onerror=alert(1)> & "q" #1 ?a=b+c 50%`;
    await page.goto(SPRING);
    await headlineButton(page, "Spring Vet Fund").click();
    await headlineField(page).fill(typed);
    await page.keyboard.press("Enter");
    await expect(headlineField(page)).toHaveCount(0);
    await expect(page.locator("h1")).toHaveText(typed);
    expect(
      await page.locator("main img[onerror], main img[src='x'], h1 > :not(button)").count(),
    ).toBe(0);
    expect(new URL(page.url()).searchParams.get("headline")).toBe(typed);

    await page.reload();
    await expect(page.locator("h1")).toHaveText(typed);
    expect(new URL(page.url()).searchParams.get("headline")).toBe(typed);
    expect(await page.locator("main img[onerror], main img[src='x']").count()).toBe(0);
    await page.waitForTimeout(200);
    expect(dialogs).toEqual([]);
  });

  test("an emoji headline of 60 code points is accepted and round-trips", async ({ page }) => {
    const sixty = "🐈".repeat(60);
    await page.goto(SPRING);
    await headlineButton(page, "Spring Vet Fund").click();
    await headlineField(page).fill(sixty);
    await page.keyboard.press("Enter");
    await expect(page.locator("h1")).toHaveText(sixty);
    await page.reload();
    await expect(page.locator("h1")).toHaveText(sixty);
  });

  test("an empty or 61-character headline is refused and the address is untouched", async ({
    page,
  }) => {
    await page.goto(SPRING);
    const url = page.url();
    await headlineButton(page, "Spring Vet Fund").click();
    await headlineField(page).fill("");
    await page.keyboard.press("Enter");
    const alert = page.locator("[data-edit-row] [role=alert]");
    await expect(alert).toHaveText("The headline can't be empty.");
    await headlineField(page).fill("a".repeat(61));
    await page.keyboard.press("Enter");
    await expect(alert).toHaveText("Keep the headline to 60 characters or fewer.");
    expect(page.url()).toBe(url);
    await page.keyboard.press("Escape");
    await expect(page.locator("h1")).toHaveText("Spring Vet Fund");
    expect(page.url()).toBe(url);
  });
});

test.describe("keyboard only (quickstart 6)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Tab to the headline, Enter opens it, type, Enter commits, focus comes home", async ({
    page,
  }) => {
    await page.goto(SPRING);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Full screen" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(headlineButton(page, "Spring Vet Fund")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(headlineField(page)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Keyboard Fund");
    await page.keyboard.press("Enter");
    await expect(headlineField(page)).toHaveCount(0);
    await expect(headlineButton(page, "Keyboard Fund")).toBeFocused();
    await page.waitForTimeout(100);
    await expect(headlineField(page)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("headline")).toBe("Keyboard Fund");
  });

  test("Tab from the headline field reaches Done, Space commits, focus comes home", async ({
    page,
  }) => {
    await page.goto(SPRING);
    await headlineButton(page, "Spring Vet Fund").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Done Fund");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Done" })).toBeFocused();
    await expect(page.getByRole("textbox", { name: "Amount raised" })).toHaveCount(0);
    await page.keyboard.press("Space");
    await expect(headlineField(page)).toHaveCount(0);
    await expect(headlineButton(page, "Done Fund")).toBeFocused();
    await page.waitForTimeout(100);
    await expect(headlineField(page)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("headline")).toBe("Done Fund");
  });

  test("Space opens it, and Escape cancels, returns focus and does not reopen", async ({
    page,
  }) => {
    await page.goto(SPRING);
    await headlineButton(page, "Spring Vet Fund").focus();
    await page.keyboard.press("Space");
    await expect(headlineField(page)).toBeFocused();
    await page.keyboard.type("zzz");
    await page.keyboard.press("Escape");
    await expect(headlineField(page)).toHaveCount(0);
    await expect(headlineButton(page, "Spring Vet Fund")).toBeFocused();
    await page.waitForTimeout(150);
    await expect(headlineField(page)).toHaveCount(0);
    await expect(page.locator("h1")).toHaveText("Spring Vet Fund");
    expect(page.url()).toContain("headline=Spring%20Vet%20Fund");
  });
});

test.describe("opening the headline field moves nothing (SC-011)", () => {
  for (const [width, height] of [
    [1920, 1080],
    [1024, 768],
    [390, 844],
    [320, 568],
  ] as const) {
    test(`${width}x${height}: logo, label, figures, edit row and thermometer stay put`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto(SPRING);
      await settled(page);
      const parts = ["img", "[data-raised]", "[data-goal-line]", "[data-edit-row]", "[role=meter]"];
      const before = await Promise.all(parts.map((p) => boxOf(page, p)));
      const h1 = await boxOf(page, "h1");
      await headlineButton(page, "Spring Vet Fund").click();
      await expect(headlineField(page)).toBeFocused();
      await settled(page);
      const after = await Promise.all(parts.map((p) => boxOf(page, p)));
      expect(after).toEqual(before);
      const h1Open = await boxOf(page, "h1");
      expect(Math.abs(h1Open.left - h1.left)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(h1Open.top - h1.top)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(h1Open.bottom - h1.bottom)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(h1Open.right - h1.right)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("a headline of look-alike blanks can still be pressed", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a zero-width headline (U+034F) has a press area of at least 44px around it, and a press there opens it", async ({
    page,
  }) => {
    const blank = "\u034F";
    await page.goto(`/fundraiser?headline=${encodeURIComponent(blank)}`);
    await expect(page.locator("h1")).toHaveText(blank);
    const button = page.locator("h1 > button");
    const at = await button.boundingBox();
    expect(at).not.toBeNull();
    expect(at?.width, "the words themselves have no width").toBeLessThan(1);
    const centre = {
      x: (at?.x ?? 0) + (at?.width ?? 0) / 2,
      y: (at?.y ?? 0) + (at?.height ?? 0) / 2,
    };
    const hits = await page.evaluate(({ x, y }) => {
      const reach = (dx: number, dy: number): boolean =>
        document.elementFromPoint(x + dx, y + dy)?.closest("h1 > button") !== null;
      return {
        left: reach(-21, 0),
        right: reach(21, 0),
        above: reach(0, -21),
        below: reach(0, 21),
      };
    }, centre);
    expect(hits).toEqual({ left: true, right: true, above: true, below: true });
    await page.mouse.click(centre.x + 20, centre.y);
    await expect(headlineField(page)).toBeFocused();
  });
});

test.describe("the headline in full screen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the editing view has the button; full screen has plain text and no button", async ({
    page,
  }) => {
    await page.goto(SPRING);
    expect(await page.locator("h1 > button").count()).toBe(1);
    await page.getByRole("button", { name: "Full screen" }).click();
    await expect(page.getByRole("button")).toHaveCount(0);
    expect(await page.locator("h1 > *").count()).toBe(0);
    await expect(page.locator("h1")).toHaveText("Spring Vet Fund");
  });
});
