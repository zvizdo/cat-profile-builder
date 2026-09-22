import { expect, test } from "@playwright/test";
import { buildCat, CAT_1, deleteCat, frame, newCat, pick, runAxe, signIn, upload } from "./_lib";

// T036 (contracts/helper-protocol.md; FR-032, FR-039): the helper panel wired end to end
// through the real Next.js server — no mocked `fetch` here, unlike the component tests —
// over the e2e run's one shared fake model (`FAKE_MODEL_SCENARIO` defaults to `noop`,
// playwright.config.ts's `webServer` sets no other; the scripted multi-turn scenarios
// (build-profile-happy, build-proposal, abort-mid-turn, truncated) need their own process
// with a different `FAKE_MODEL_SCENARIO` and are driven by hand instead — see the task's
// Browser check). This journey only needs the locked → ready gate and one real round
// trip to prove the wiring: the request reaches `/api/helper/chat`, streams back, and
// lands as a message the volunteer can read.

test("the helper panel unlocks on the first photo and answers a real request", async ({ page }) => {
  await signIn(page);
  await newCat(page);

  const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
  await expect(helper.getByText("Add one photo and I can help.")).toBeVisible();
  await expect(helper.getByPlaceholder("Ask for a change…")).toHaveCount(0);

  await upload(page, ["cat-1.jpg"]);

  await expect(helper.getByText("Add one photo and I can help.")).toHaveCount(0);
  const composer = helper.getByPlaceholder("Ask for a change…");
  await expect(composer).toBeVisible();
  await expect(helper.getByRole("button", { name: "Write a bio" })).toBeVisible();

  await helper.getByRole("button", { name: "Tidy the order" }).click();
  await expect(helper.getByText("I can help once there is a photo.")).toBeVisible({
    timeout: 15_000,
  });

  await runAxe(page);

  // Leave the store as it was found: the list journey counts cats.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Unnamed cat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("article")).toHaveCount(0);
});

// F46 (F28 review #1): between 768 and 1179px CATalyst is the 52px tab, and opening it
// lays the panel over the canvas — the canvas keeps its width — closed again by Escape
// with focus back on the tab.
test("at 1024 the helper is a tab that opens over the canvas and closes on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page);
  await newCat(page);
  await upload(page, ["cat-1.jpg"]);

  const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
  const open = helper.getByRole("button", { name: "open CATalyst" });
  await expect(open).toBeVisible();
  await expect(helper).toHaveCSS("width", "52px");
  const canvasWidth = await page.locator("main").evaluate((el) => el.getBoundingClientRect().width);
  await runAxe(page);

  // Opened from the keyboard, focus follows to the toggle that took the tab's place
  // (F27's rule; a pointer press lands on the landmark itself).
  await open.focus();
  await page.keyboard.press("Enter");
  const composer = helper.getByPlaceholder("Ask for a change…");
  await expect(composer).toBeVisible();
  await expect(helper.getByRole("button", { name: "collapse CATalyst" })).toBeFocused();
  // Over the canvas, not beside it: the panel is the docked width, the canvas unchanged.
  const body = page.locator("[data-helper-body]");
  await expect(body).toHaveCSS("position", "absolute");
  await expect(body).toHaveCSS("width", "360px");
  expect(await page.locator("main").evaluate((el) => el.getBoundingClientRect().width)).toBe(
    canvasWidth,
  );
  await runAxe(page);

  await page.keyboard.press("Escape");
  await expect(composer).toBeHidden();
  await expect(helper.getByRole("button", { name: "open CATalyst" })).toBeFocused();

  await deleteCat(page, "Unnamed cat");
});

// F9: the whole profile is read-only while the helper is mid-turn. `noop`'s own round
// trip is too fast to catch reliably, so this one route holds `/api/helper/chat` open
// for a moment — the network layer, not the fake model itself, so it is still the
// journey's own shared scenario and server (Browser check's own note above stands).
test("the profile locks while a turn is in flight and unlocks the instant it ends", async ({
  page,
}) => {
  await signIn(page);
  await newCat(page);
  await upload(page, ["cat-1.jpg"]);

  const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
  const canvas = page.getByRole("region", { name: "Canvas" });
  const addSection = page.getByRole("button", { name: "+ add section" });

  await page.route("**/api/helper/chat", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  await helper.getByRole("button", { name: "Tidy the order" }).click();

  await expect(canvas).toHaveAttribute("aria-busy", "true");
  await expect(addSection).toBeDisabled();
  await runAxe(page);

  await expect(helper.getByText("I can help once there is a photo.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(canvas).not.toHaveAttribute("aria-busy", "true");
  await expect(addSection).toBeEnabled();

  await deleteCat(page, "Unnamed cat");
});

// F49 (F28 review #8; comp 3a; F25's slot order kept, §3.1/§3.5): the proposal card, the
// receipt and the failure box sit right under the reply they belong to. Before this fix
// `MessageList` carried `flex-1`, so on a short thread the void inside the scrollable list
// pushed every one of those three ~330px down to the composer instead. `edit-proposals`
// (T035 controller ruling 4) gives one destructive card and, once applied, a receipt —
// both proven here against the exact scripted scenario `generate-edit-undo.spec.ts` already
// exercises for its behaviour, this time for its distance from what it answers.
test("the proposal card and the receipt sit right under the reply they belong to, not ~330px away at the composer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().setExtraHTTPHeaders({ "x-fake-scenario": "edit-proposals" });
  await signIn(page);
  await buildCat(page, { name: "Nora" });

  const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
  const request = "Move the video above the gallery, and shorten the bio a little.";
  await helper.getByPlaceholder("Ask for a change…").fill(request);
  await page.keyboard.press("Enter");

  // The reorder is additive and applies at once, with no bubble of its own — the last
  // thing in the list before the card is still the volunteer's own request. The
  // destructive shorten waits right under it.
  const lastRequest = helper.getByText(request);
  await expect(lastRequest).toBeVisible();
  const cardFrame = helper
    .getByText("Proposed · 1 operation")
    .locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' rounded-panel ')]",
    );
  await expect(cardFrame).toBeVisible({ timeout: 15_000 });

  const requestBox = await lastRequest.boundingBox();
  const cardBox = await cardFrame.boundingBox();
  if (requestBox === null || cardBox === null) throw new Error("no bounding box");
  expect(cardBox.y).toBeLessThanOrEqual(requestBox.y + requestBox.height + 32);

  // Apply it: the model's own closing reply lands as a bubble, and the turn's receipt
  // ("Applied — …") sits directly under that reply, not at the composer either. The
  // receipt's own frame (`edge-blue …`, TurnSummary.tsx) carries 12px of its own padding
  // above the sentence, so the frame — not the sentence's text line — is what is measured
  // against the reply, the same way the card above is measured by its frame, not its text.
  await helper.getByRole("button", { name: "Apply" }).click();
  const reply = helper.getByText(
    "Reordered the sections and shortened the bio — take a look at the card.",
  );
  await expect(reply).toBeVisible({ timeout: 15_000 });
  const receiptFrame = helper
    .getByText(/^Applied — /)
    .locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' edge-blue ')]",
    );
  await expect(receiptFrame).toBeVisible({ timeout: 15_000 });

  const replyBox = await reply.boundingBox();
  const receiptBox = await receiptFrame.boundingBox();
  if (replyBox === null || receiptBox === null) throw new Error("no bounding box");
  expect(receiptBox.y).toBeLessThanOrEqual(replyBox.y + replyBox.height + 32);

  await runAxe(page);
  await deleteCat(page, "Nora");
});

// F58 (user feedback 2026-09-13: "you Apply or deny but you don't really know what you
// are applying"): the card shows the text it will replace and the text it will put
// there. `text-proposals` cards a tagline (the two-line form: the old struck, the new
// under it, in place of the `5 → 9 words` count) and then a bio (the word diff as prose
// under the row, the `N → M words` count kept beside the sentence). Both are read from
// the page's own document and the tool call's input, so the values here are exactly what
// `buildCat` typed and what the scenario proposes.
test("the proposal card shows the tagline it replaces and the one it puts there, both above the composer; the bio card shows its word diff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().setExtraHTTPHeaders({ "x-fake-scenario": "text-proposals" });
  await signIn(page);
  await buildCat(page, { name: "Nora" });

  const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
  const composer = helper.getByPlaceholder("Ask for a change…");
  await composer.fill("Give her a better tagline.");
  await page.keyboard.press("Enter");

  const card = helper.getByText("Proposed · 1 operation");
  await expect(card).toBeVisible({ timeout: 15_000 });
  const struck = helper.locator("del", { hasText: "A negotiator, not a complainer." });
  const added = helper.locator("ins", {
    hasText: "Follows you room to room, then settles on the nearest lap",
  });
  await expect(struck).toBeVisible();
  await expect(added).toBeVisible();
  await expect(struck).toHaveCSS("text-decoration-line", "line-through");
  await expect(helper.getByText(/\d+ → \d+ words/)).toHaveCount(0);
  // Both lines sit above Apply, and Apply above the composer: the decision and what it
  // decides are in one view.
  const addedBox = await added.boundingBox();
  const composerBox = await composer.boundingBox();
  const applyBox = await helper.getByRole("button", { name: "Apply" }).boundingBox();
  if (addedBox === null || composerBox === null || applyBox === null) {
    throw new Error("no bounding box");
  }
  expect(addedBox.y + addedBox.height).toBeLessThan(applyBox.y);
  expect(applyBox.y + applyBox.height).toBeLessThan(composerBox.y);
  await runAxe(page);

  await helper.getByRole("button", { name: "Apply" }).click();
  await expect(helper.getByText("That's the tagline settled.")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("region", { name: "Facts" }).getByRole("textbox", { name: "Tagline" }),
  ).toHaveValue("Follows you room to room, then settles on the nearest lap");

  // The bio: the count stays on the row; the diff reads as the paragraphs themselves.
  await composer.fill("Make the bio read better.");
  await page.keyboard.press("Enter");
  await expect(helper.getByText("Rewrite the bio.")).toBeVisible({ timeout: 15_000 });
  await expect(helper.getByText(/^\d+ → \d+ words$/)).toBeVisible();
  const diff = helper.locator("[data-diff]");
  await expect(diff.locator("del", { hasText: "laundromat" })).toBeVisible();
  await expect(diff.locator("ins", { hasText: "follows you from room to room" })).toBeVisible();
  await expect(diff.locator("p")).toHaveCount(2);
  await expect(
    diff.getByText("Removed words are struck through; added words are underlined."),
  ).toHaveClass(/sr-only/);
  await runAxe(page);

  await helper.getByRole("button", { name: "Not this" }).click();
  await expect(helper.getByText("Left as it was. Nothing on your page changed.")).toBeVisible();
  await deleteCat(page, "Nora");
});

// F59 (the memo's §3, "image changes"): the same feedback F58 answered for text — "you
// Apply or deny but you don't really know what you are applying" — for a photo swap and
// a removal. `image-proposals` cards a hero `replace_image` (the current photo and the
// proposed one side by side) and then, once the page also carries a quote with its own
// photo, a `remove_block` on it (the quote's own line struck, with its photo beside it).
test("the proposal card shows the current and proposed hero photo side by side; the removal card shows its own line and photo struck", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().setExtraHTTPHeaders({ "x-fake-scenario": "image-proposals" });
  await signIn(page);
  await buildCat(page, { name: "Nora" });

  // A quote with its own photo — `buildCat`'s own cat has none — so the removal card
  // also has a face to draw.
  const tiles = page.getByRole("region", { name: "Add section" });
  await tiles.getByRole("button", { name: "Quote", exact: true }).click();
  const quote = frame(page, /^QUOTE/);
  await quote.getByRole("button", { name: "Pick a photo" }).click();
  await pick(page, CAT_1, "Use photo");
  await quote.getByRole("textbox", { name: "Quote" }).fill("She purrs at the kettle.");
  await page.keyboard.press("Enter");

  const heroImg = frame(page, /^HERO/).getByRole("img");
  const quoteImg = quote.getByRole("img");
  const heroBefore = await heroImg.getAttribute("src");
  const quotePhoto = await quoteImg.getAttribute("src");

  const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
  const composer = helper.getByPlaceholder("Ask for a change…");
  await composer.fill("Give her a better hero photo.");
  await page.keyboard.press("Enter");

  const card = helper.getByText("Proposed · 1 operation");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(helper.getByText("Replace the photo")).toBeVisible();
  await expect(helper.getByRole("img")).toHaveCount(2);
  await expect(helper.getByRole("img").first()).toHaveAttribute("src", heroBefore ?? "");
  await expect(helper.locator("del")).toHaveCount(1);
  await expect(helper.getByText(/\d+ → \d+ photos/)).toHaveCount(0);
  await runAxe(page);

  await helper.getByRole("button", { name: "Apply" }).click();
  await expect(helper.getByText("That's her hero photo.")).toBeVisible({ timeout: 15_000 });
  await expect(heroImg).not.toHaveAttribute("src", heroBefore ?? "");

  // The removal: the quote's own line struck, its photo beside it.
  await composer.fill("Remove the quote.");
  await page.keyboard.press("Enter");
  await expect(helper.getByText("Remove the quote.")).toBeVisible({ timeout: 15_000 });
  const removalDel = helper.locator("del", { hasText: "She purrs at the kettle." });
  await expect(removalDel).toBeVisible();
  await expect(removalDel).toHaveCSS("text-decoration-line", "line-through");
  await expect(helper.getByRole("img")).toHaveAttribute("src", quotePhoto ?? "");
  await runAxe(page);

  await helper.getByRole("button", { name: "Apply" }).click();
  await expect(helper.getByText("That's the quote gone.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: /^QUOTE/ })).toHaveCount(0);

  await deleteCat(page, "Nora");
});

// F65: a standalone "Write a bio" on a page with a photo and no bio looks first (the
// scenario reads the outline and media and views the photo), asks one question that points
// at the photos, and writes only once it is answered. The answer goes by the Send button,
// not Enter — the button's one end-to-end proof.
test("Write a bio asks a question about the photos first, and the answer sent with the Send button writes the bio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().setExtraHTTPHeaders({ "x-fake-scenario": "bio-interview" });
  await signIn(page);
  await newCat(page);
  await upload(page, ["cat-1.jpg"]);

  const helper = page.getByRole("complementary", { name: "CATalyst AI Assistant" });
  await helper.getByRole("button", { name: "Write a bio" }).click();
  await expect(
    helper.getByText(
      "I can see her settled on a windowsill in the photos. Is that her favourite spot, and what does she do there?",
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-block-type='bio']")).toHaveCount(0);

  const send = helper.getByRole("button", { name: "Send" });
  await expect(send).toBeDisabled();
  await helper
    .getByPlaceholder("Ask for a change…")
    .fill("Yes, the sill is hers. She chirps at pigeons.");
  await expect(send).toBeEnabled();
  await send.click();

  await expect(helper.getByText("That's the bio written.")).toBeVisible({ timeout: 15_000 });
  await expect(frame(page, /^BIO/)).toContainText(
    "The windowsill is hers from the first light, and she chirps at every pigeon that lands outside.",
  );
  await runAxe(page);

  await deleteCat(page, "Unnamed cat");
});
