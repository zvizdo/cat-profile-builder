import { expect, test, type Page } from "@playwright/test";
import { buildCat, deleteCat, frame, newCat, runAxe, signIn, upload } from "./_lib";

// F34, "follow, then overview" (FR-042): as CATalyst's edits land the canvas follows them
// — each touched block scrolled to the centre of the view and its ring blinked — and when
// the turn ends the canvas returns to the first block touched. Every touched block wears
// `CATalyst · just now` until the volunteer's next edit, and the panel's "Applied — …"
// line is a change list whose labels scroll to and re-blink their block. Driven against
// the built app with the scripted fake model, like helper.spec.ts; the scenarios are
// `build-proposal` (two questions, a proposal ending "Want me to build this now?", a clear
// yes, then four blocks and the theme in one turn) and `edit-proposals` (one turn that
// moves a block and writes the bio, on the Paper preset, where axe can judge the tag and
// the change list at zero).

const JUST_NOW = "CATalyst · just now";

async function withScenario(page: Page, name: string): Promise<void> {
  await page.context().setExtraHTTPHeaders({ "x-fake-scenario": name });
}

/**
 * Whether the block's frame sits in the middle of the canvas's scroll view: its centre
 * within 48px of the view's, or — when the view cannot scroll that far (the block is at
 * the very top or bottom of the sheet, or taller than the view) — the frame covering the
 * view's centre or fully in view at the extreme the scroll clamped to.
 */
function centred(page: Page, type: string): Promise<boolean> {
  return page.evaluate((blockType) => {
    const main = document.querySelector("main");
    const el = document.querySelector(`[data-block-type="${blockType}"]`);
    if (main === null || el === null) return false;
    const view = main.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const mid = view.top + view.height / 2;
    if (Math.abs(box.top + box.height / 2 - mid) <= 48) return true;
    if (box.top <= mid && box.bottom >= mid) return true;
    const atTop = main.scrollTop <= 1;
    const atBottom = main.scrollTop + main.clientHeight >= main.scrollHeight - 1;
    return (atTop || atBottom) && box.top >= view.top && box.bottom <= view.bottom;
  }, type);
}

/** The `animation-name` the block's pulse ring runs under, or `null` without a ring. */
function ringAnimation(page: Page, type: string): Promise<string | null> {
  return page.evaluate((blockType) => {
    const ring = document.querySelector(`[data-block-type="${blockType}"] [data-pulse-ring]`);
    return ring === null ? null : getComputedStyle(ring).animationName;
  }, type);
}

test.describe("the canvas follows CATalyst (F34)", () => {
  test("a four-block turn: every touched block is tagged, the canvas returns to the first, a change line jumps to and blinks its block, and the tags clear on the next manual edit", async ({
    page,
  }) => {
    await withScenario(page, "build-proposal");
    await signIn(page);
    await newCat(page);
    await upload(page, ["cat-1.jpg"]);

    const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
    const canvas = page.getByRole("region", { name: "Canvas" });
    const blocks = page.locator("[data-block-type]");
    const composer = helper.getByPlaceholder("Ask for a change…");

    await helper.getByRole("button", { name: "Build the page" }).click();
    await expect(helper.getByText("What's her personality like")).toBeVisible();
    await composer.fill("Confident and a little bossy.");
    await page.keyboard.press("Enter");
    await expect(helper.getByText("Does she get along with other cats")).toBeVisible();
    await composer.fill("She's an only cat, no other pets.");
    await page.keyboard.press("Enter");
    await expect(helper.getByText("Want me to build this now?")).toBeVisible({ timeout: 15_000 });
    await composer.fill("Yes, build it.");
    await page.keyboard.press("Enter");

    // The turn adds a bio, a gallery, a needs section and a quote, then sets the theme.
    await expect(blocks).toHaveCount(5, { timeout: 15_000 });
    await expect(canvas).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
    await expect(helper.getByRole("button", { name: "Undo these" })).toBeVisible({
      timeout: 15_000,
    });

    // Overview: once the turn has ended the canvas comes back to the first block it
    // touched — the bio — and holds it in the middle of the view.
    await expect.poll(() => centred(page, "bio"), { timeout: 5_000 }).toBe(true);

    // Every touched block wears the tag; the hero, which the turn never touched, does not.
    for (const label of [/^BIO/, /^GALLERY/, /^NEEDS/, /^QUOTE/]) {
      await expect(frame(page, label).getByText(JUST_NOW)).toBeVisible();
    }
    await expect(frame(page, /^HERO/).getByText(JUST_NOW)).toHaveCount(0);

    // The change list: `quote` in the Applied line is a button that brings the quote to
    // the centre and blinks its ring; the sentence reads as it always did. This journey
    // never records a sex (F41), so the needs section reads with the neutral pronoun.
    const line = helper.getByText(/^Applied — /);
    await expect(line).toHaveText(
      'Applied — added bio, gallery, "What they need" section, quote; set theme Sand.',
    );
    await helper.getByRole("button", { name: "added quote" }).click();
    await expect.poll(() => ringAnimation(page, "quote")).toBe("ring-blink");
    await expect.poll(() => centred(page, "quote"), { timeout: 5_000 }).toBe(true);
    // The ring is a blink, not a state: it is gone once it has run.
    await expect.poll(() => ringAnimation(page, "quote"), { timeout: 5_000 }).toBeNull();

    // The volunteer's next edit — moving the quote up — clears every tag.
    await frame(page, /^QUOTE/)
      .getByRole("button", { name: "Move up" })
      .click();
    await expect(page.getByText(JUST_NOW)).toHaveCount(0);

    await deleteCat(page, "Unnamed cat");
  });

  test("a single-turn edit on Paper: each landed block is centred and tagged, reduced motion gets a still ring and no glide, and axe finds nothing", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await withScenario(page, "edit-proposals");
    await signIn(page);
    await newCat(page);
    await upload(page, ["cat-1.jpg"]);

    // Two sortable blocks, so the scenario's reorder actually moves one (the gallery
    // above the bio); the bio is empty, so writing it is additive and lands at once.
    const tiles = page.getByRole("region", { name: "Add section" });
    for (const name of ["Bio", "Gallery"]) {
      await tiles.getByRole("button", { name, exact: true }).click();
    }
    await expect(page.locator("[data-block-type]")).toHaveCount(3);

    const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
    await helper.getByPlaceholder("Ask for a change…").fill("Tidy the order and write the bio.");
    await page.keyboard.press("Enter");
    await expect(helper.getByRole("button", { name: "Undo these" })).toBeVisible({
      timeout: 15_000,
    });

    // The gallery moved first, so the canvas ends on it; both touched blocks are tagged.
    await expect.poll(() => centred(page, "gallery"), { timeout: 5_000 }).toBe(true);
    await expect(frame(page, /^GALLERY/).getByText(JUST_NOW)).toBeVisible();
    await expect(frame(page, /^BIO/).getByText(JUST_NOW)).toBeVisible();
    await expect(frame(page, /^HERO/).getByText(JUST_NOW)).toHaveCount(0);

    // Under reduced motion a change line still finds its block — at once, no glide —
    // and the ring stands still rather than blinking.
    await helper.getByRole("button", { name: "changed bio" }).click();
    await expect.poll(() => centred(page, "bio")).toBe(true);
    expect(await ringAnimation(page, "bio")).toBe("none");

    // Paper preset (the volunteer never changed it): the tag, the ring and the change
    // list all on screen, and nothing for axe to fault.
    await expect(page.getByRole("radio", { name: "Paper" })).toBeChecked();
    await runAxe(page);

    await deleteCat(page, "Unnamed cat");
  });

  // F34 review, finding 1, migrated for F44, then for F45's phone drawers. A chip (or,
  // with nothing on the canvas yet, the panel's own "Build the page") sends straight
  // into the Peek — the 48px `open CATalyst` bar — so the canvas stays visible for the
  // whole turn; a question raises the Half sheet (a `region`, not a dialog) with the
  // composer, `main`'s own box is the visible band above it, and closing or finishing a
  // turn drops back to Peek with the receipt as its line. This asserts the canvas never
  // goes behind a dialog while the turn runs, that each landed block is centred in
  // `main`'s band once the turn ends, and that every touched block carries the tag.
  test("on the phone the editable column follows each block, and the canvas is centred on the first once CATalyst returns to the peek", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await withScenario(page, "build-proposal");
    await signIn(page);
    const id = await newCat(page);
    try {
      await upload(page, ["cat-1.jpg"]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/builder/${id}`);

      const drawers = page.getByRole("navigation", { name: "Drawers" });
      const canvas = page.getByRole("region", { name: "Canvas" });

      // Nothing is on the canvas yet, so there is no chip to send from — the tab opens
      // Full, and its own "Build the page" chip is the send that drops it to Peek.
      await drawers.getByRole("button", { name: "CATalyst" }).click();
      const full = page.getByRole("dialog", { name: "CATalyst AI Assistant" });
      await full.getByRole("button", { name: "Build the page" }).click();

      // F45: the send drops Full at once — no dialog covers the canvas, which stays
      // visible while the turn runs (the F44 note above no longer holds).
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(canvas).toBeVisible();

      // The first question raises Half; the composer answers both questions in place.
      const half = page.getByRole("region", { name: "CATalyst AI Assistant" });
      const composer = half.getByPlaceholder("Ask for a change…");
      await expect(half.getByText("What's her personality like")).toBeVisible({
        timeout: 15_000,
      });
      await composer.fill("Confident and a little bossy.");
      await page.keyboard.press("Enter");
      await expect(half.getByText("Does she get along with other cats")).toBeVisible({
        timeout: 15_000,
      });
      await composer.fill("She's an only cat, no other pets.");
      await page.keyboard.press("Enter");
      await expect(half.getByText("Want me to build this now?")).toBeVisible({
        timeout: 15_000,
      });
      await composer.fill("Yes, build it.");
      await page.keyboard.press("Enter");

      // The proposal's yes ends the interview: Half drops to Peek at once, and the
      // canvas stays visible while the four blocks and the theme land behind it.
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(canvas).toBeVisible();
      await expect(page.locator("[data-block-type]")).toHaveCount(5, { timeout: 15_000 });
      await expect(canvas).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });

      const peek = page.getByRole("button", { name: "open CATalyst" });
      await expect(peek).toHaveText(/^Applied — added bio, gallery, .* set theme Sand\./, {
        timeout: 15_000,
      });

      // Overview: the canvas is back on the first block the turn touched — the bio —
      // centred in `main`'s visible band above the peek, and every touched block wears
      // the tag.
      await expect.poll(() => centred(page, "bio"), { timeout: 5_000 }).toBe(true);
      for (const label of [/^BIO/, /^GALLERY/, /^NEEDS/, /^QUOTE/]) {
        await expect(frame(page, label).getByText(JUST_NOW)).toBeVisible();
      }
      await expect(frame(page, /^HERO/).getByText(JUST_NOW)).toHaveCount(0);
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
      await deleteCat(page, "Unnamed cat");
    }
  });

  // F60 (design 2026-09-13 §4): the canvas reveals the block a pending card names — the
  // F34 scroll-and-ring, but *before* Apply, not only once it lands. `edit-proposals` cards
  // a bio shorten only once the bio already holds real text (describe.ts's `describeBio`:
  // an empty bio is additive), so this builds a full cat first.
  test("a pending card is scrolled to and rung before Apply, on the docked canvas", async ({
    page,
  }) => {
    await withScenario(page, "edit-proposals");
    await signIn(page);
    await buildCat(page, { name: "Charlotte" });

    const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
    await helper
      .getByPlaceholder("Ask for a change…")
      .fill("Move the video above the gallery, and shorten the bio a little.");
    await page.keyboard.press("Enter");

    // The reorder is additive and lands first, ahead of the card; once the card is up —
    // before Apply is ever clicked — the bio is already centred and its ring has blinked.
    await expect(page.getByText("Shorten the bio.")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => centred(page, "bio"), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => ringAnimation(page, "bio")).toBe("ring-blink");
    await expect.poll(() => ringAnimation(page, "bio"), { timeout: 5_000 }).toBeNull();

    await page.getByRole("button", { name: "Apply" }).click();
    await expect(helper.getByRole("button", { name: "Undo these" })).toBeVisible({
      timeout: 15_000,
    });

    await deleteCat(page, "Charlotte");
  });
});
