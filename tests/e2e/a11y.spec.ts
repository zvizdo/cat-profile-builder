import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  axeViolations,
  buildCat,
  draftSaved,
  deleteCat,
  frame,
  newCat,
  publishCat,
  signIn,
} from "./_lib";

// The accessibility sweep (SC-005, FR-068; ADR-012): axe on every page Story 1 puts in
// front of a person, each with a full cat on it, and zero violations on each. One cat is
// built and published once for the whole sweep; the pages are visited as the volunteer
// (signed in) or as a visitor (a context with no cookies), at the desktop width and, for
// the builder, at a phone's 390px. Each test prints the count of rules axe passed,
// found nothing to judge for, or could not decide, so a run shows what was checked.

let id = "";
let volunteer: Page;
let session: BrowserContext | undefined;

test.describe.serial("axe on every Story 1 page", () => {
  test.beforeAll(async ({ browser }) => {
    // axe needs a page in its own context, not the browser's default one.
    session = await browser.newContext();
    volunteer = await session.newPage();
    await signIn(volunteer);
    id = await buildCat(volunteer, { name: "Charlotte" });
    // F50 (F28 review #2): the sweep needs a needs section on the page it judges — that
    // block's `01`/`02` index was the axe `color-contrast` violation the review found.
    await volunteer
      .getByRole("region", { name: "Add section" })
      .getByRole("button", { name: "Needs", exact: true })
      .click();
    const needs = frame(volunteer, /^NEEDS/);
    await needs.getByRole("textbox", { name: "Card 1 title" }).fill("A quiet room");
    await volunteer.keyboard.press("Enter");
    await needs.getByRole("textbox", { name: "Card 1 text" }).fill("Somewhere calm to settle in.");
    await volunteer.keyboard.press("Enter");
    await draftSaved(volunteer);
    await publishCat(volunteer);
  });

  test.afterAll(async () => {
    // A `beforeAll` that failed before the cat was published leaves nothing to take down.
    if (id === "") {
      await session?.close();
      return;
    }
    await volunteer.goto(`/builder/${id}`);
    await volunteer.getByRole("button", { name: "Published" }).click();
    await volunteer.getByRole("menuitem", { name: "Unpublish" }).click();
    await volunteer.getByRole("dialog").getByRole("button", { name: "Move to draft" }).click();
    await expect(volunteer.getByRole("button", { name: "Publish" })).toBeVisible();
    await deleteCat(volunteer, "Charlotte");
    await session?.close();
  });

  /** Runs axe on `page` and prints the rule counts under `label`; fails on any violation. */
  async function sweep(page: Page, label: string): Promise<void> {
    const { violations, byRule, passes, incomplete, inapplicable } = await axeViolations(page);
    process.stdout.write(
      `axe ${label}: ${passes} rules passed, ${inapplicable} not applicable, ${incomplete} undecided, ${violations.length} violated${
        violations.length === 0 ? "" : ` (${JSON.stringify(byRule)})`
      }\n`,
    );
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  }

  test("/sign-in", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await sweep(page, "/sign-in");
  });

  test("/builder — the list with a live cat", async () => {
    await volunteer.goto("/builder");
    await expect(volunteer.getByRole("article").filter({ hasText: "Charlotte" })).toBeVisible();
    await sweep(volunteer, "/builder");
  });

  test("/builder/{id} — the full builder", async () => {
    await volunteer.goto(`/builder/${id}`);
    // 5 from buildCat (hero, bio, gallery, video, day) plus the needs section beforeAll adds.
    await expect(volunteer.locator("[data-block-type]")).toHaveCount(6);
    await sweep(volunteer, "/builder/{id}");
  });

  test("/builder/{id} at 390px — the phone builder", async () => {
    // F44: below 768px the builder is the one-column phone builder — Facts/Theme
    // collapsed, blocks with the phone label row, Media and CATalyst as bottom-bar
    // drawers that open Full sheets. Zero violations on the canvas and inside each sheet.
    await volunteer.setViewportSize({ width: 390, height: 844 });
    await volunteer.goto(`/builder/${id}`);
    const drawers = volunteer.getByRole("navigation", { name: "Drawers" });
    await expect(drawers.getByRole("button", { name: "Media" })).toBeVisible();
    await sweep(volunteer, "/builder/{id} @390 — canvas");

    await drawers.getByRole("button", { name: "Media" }).click();
    await expect(volunteer.getByRole("dialog")).toBeVisible();
    await sweep(volunteer, "/builder/{id} @390 — Media sheet");
    await volunteer.keyboard.press("Escape");
    await expect(volunteer.getByRole("dialog")).toHaveCount(0);

    await drawers.getByRole("button", { name: "CATalyst" }).click();
    await expect(volunteer.getByRole("dialog", { name: "CATalyst AI Assistant" })).toBeVisible();
    await sweep(volunteer, "/builder/{id} @390 — CATalyst sheet");
    await volunteer.keyboard.press("Escape");
    await expect(volunteer.getByRole("dialog")).toHaveCount(0);

    await volunteer.setViewportSize({ width: 1280, height: 720 });
  });

  // F12: the ghost `remove card` action inside a Needs block's fieldset (and the gallery's
  // `Remove photo`, found the same way) read the *themed* paper/card colour inside the
  // canvas's `.theme-scope`, and clay fell under 4.5:1 on Sand and Night — see
  // `NeedsEditor.tsx`'s and `GalleryCell.tsx`'s own comments for the fix (`theme-chrome`).
  // Its own cat, since it edits the theme and canvas state the shared "Charlotte" above
  // must not carry into the later tests in this file.
  test("/builder/{id} — a Needs block on Sand", async ({ page }) => {
    await signIn(page);
    await newCat(page);
    const facts = page.getByRole("region", { name: "Facts" });
    await facts.getByRole("textbox", { name: "Name" }).fill("Sandy");
    await page.keyboard.press("Enter");
    await page
      .getByRole("region", { name: "Add section" })
      .getByRole("button", { name: "Needs", exact: true })
      .click();
    const needs = frame(page, /^NEEDS/);
    await needs.getByRole("textbox", { name: "Card 1 title" }).fill("A quiet room");
    await page.keyboard.press("Enter");
    await needs.getByRole("textbox", { name: "Card 1 text" }).fill("Somewhere calm to settle in.");
    await page.keyboard.press("Enter");

    await page.getByRole("radio", { name: "Sand" }).click();
    await expect(page.locator(".theme-scope")).toHaveCSS("background-color", "rgb(227, 214, 194)");
    // Focusing `remove card` also reveals BlockShell's own hover/focus-only duplicate +
    // remove row (`group-focus-within`), so one sweep judges both clay actions at once.
    await needs.getByRole("button", { name: "remove card" }).focus();
    await sweep(page, "/builder/{id} — Needs on Sand @1280");

    // Phone mode (< 768px) has no block editors of its own (FR-091) — the Needs card
    // shows only in the read-only preview — so there is no `remove card` to focus here;
    // axe judges the phone page as a whole, the same as the @390 case above.
    await page.setViewportSize({ width: 390, height: 844 });
    await sweep(page, "/builder/{id} — Needs on Sand @390");
    await page.setViewportSize({ width: 1280, height: 720 });

    await deleteCat(page, "Sandy");
  });

  test("/builder/{id}/preview", async () => {
    await volunteer.goto(`/builder/${id}/preview`);
    await expect(volunteer.getByRole("heading", { level: 1, name: "Charlotte" })).toBeVisible();
    await sweep(volunteer, "/builder/{id}/preview");
  });

  test("/cats — the public index", async ({ page }) => {
    await page.goto("/cats");
    await expect(page.getByRole("link", { name: /Charlotte/ })).toBeVisible();
    await sweep(page, "/cats");
  });

  test("/cats/{slug-id} — the public page", async ({ page }) => {
    const response = await page.goto(`/cats/charlotte-${id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Charlotte" })).toBeVisible();
    await sweep(page, "/cats/{slug-id}");
  });

  test("the 404 for a cat that is not listed", async ({ page }) => {
    const response = await page.goto("/cats/nobody-zzzzzzzz");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "This cat isn't listed right now.",
    );
    await sweep(page, "404");
  });
});
