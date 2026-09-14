import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { runAxe, signIn } from "./_lib";
import { E2E_DATA_DIR } from "./global-setup";

// The profile list journey (T018; FR-005, FR-018, FR-028, FR-092) against the production
// build over the filesystem store, so the store on disk can be counted and corrupted by
// hand. One test, in order: the list is shared state, and `fullyParallel` would otherwise
// let another worker see this cat.

const PROFILES_DIR = resolve(E2E_DATA_DIR, "private/profiles");
const UNREADABLE = "This profile couldn't be read.";

async function profileFolders(): Promise<string[]> {
  return readdir(PROFILES_DIR).catch(() => []);
}

test("a volunteer creates a cat, sees it listed, reads a corrupted draft's one sentence, deletes it and signs out", async ({
  page,
}) => {
  await page.goto("/builder");
  await expect(page).toHaveURL("/sign-in?next=/builder");
  await signIn(page);

  // Empty shelter: the 58px bar with its count, the sentence, the tile, no cards.
  await expect(page.getByRole("heading", { level: 1, name: "Cats" })).toBeVisible();
  await expect(page.getByRole("banner").locator("> div")).toHaveCSS("min-height", "58px");
  await expect(page.getByText("0 · 0 published")).toBeVisible();
  await expect(
    page.getByText("No cats listed yet. Start with the one who needs a home soonest."),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await runAxe(page);
  const foldersBefore = await profileFolders();

  // New cat → the builder shell for an unnamed draft.
  await page.getByRole("button", { name: "+ new cat" }).click();
  await expect(page).toHaveURL(/\/builder\/[a-z2-7]{8}$/);
  const id = new URL(page.url()).pathname.split("/").pop() ?? "";
  await expect(page.getByRole("heading", { level: 1, name: "Unnamed cat" })).toBeVisible();
  const canvas = page.getByRole("region", { name: "Canvas" });
  // F1: every profile already has an empty hero, fixed at the top — nothing else yet.
  await expect(canvas.locator("[data-block-type]")).toHaveCount(1);
  await expect(
    canvas.getByRole("region", { name: "HERO · full-bleed photo + name" }),
  ).toBeVisible();
  await expect(canvas.getByRole("button", { name: "+ add section" })).toBeVisible();
  await runAxe(page);
  expect((await profileFolders()).length).toBe(foldersBefore.length + 1);

  // Back to the list: the count, one card, DRAFT, edited just now.
  await page.goBack();
  await expect(page).toHaveURL("/builder");
  await expect(page.getByText("1 · 0 published")).toBeVisible();
  const card = page.getByRole("article", { name: "Unnamed cat" });
  await expect(card).toHaveCount(1);
  await expect(card.getByText("DRAFT")).toBeVisible();
  await expect(card.getByText("edited just now")).toBeVisible();
  await expect(card.getByRole("link")).toHaveAttribute("href", `/builder/${id}`);

  // Neither hovering the tile nor moving through history creates a draft.
  await page.getByRole("button", { name: "+ new cat" }).hover();
  await page.getByRole("button", { name: "New cat", exact: true }).hover();
  await page.goForward();
  await expect(page).toHaveURL(`/builder/${id}`);
  await page.goBack();
  await expect(page).toHaveURL("/builder");
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(1);
  expect((await profileFolders()).length).toBe(foldersBefore.length + 1);

  // A corrupted draft on disk renders exactly one sentence and nothing partial (FR-018).
  // Removing the hero is exactly such a corruption (F1: every draft has one, fixed at
  // `blocks[0]`) — hand-editing it out is refused the same way any other broken shape is.
  const draftFile = resolve(PROFILES_DIR, id, "draft.json");
  const original = await readFile(draftFile, "utf8");
  const withoutHero = { ...(JSON.parse(original) as Record<string, unknown>), blocks: [] };
  await writeFile(draftFile, JSON.stringify(withoutHero));
  await page.goto(`/builder/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(UNREADABLE);
  await expect(page.getByRole("main")).toHaveText(UNREADABLE);
  await runAxe(page);
  await writeFile(draftFile, original);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Unnamed cat" })).toBeVisible();

  // Delete asks first, naming what goes; Escape keeps; confirming empties the list.
  await page.goto("/builder");
  await page.getByRole("button", { name: "Delete Unnamed cat" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this unnamed cat?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "The draft and every photo in its library are removed. This can't be undone.",
  );
  await runAxe(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("article")).toHaveCount(1);

  await page.getByRole("button", { name: "Delete Unnamed cat" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(
    page.getByText("No cats listed yet. Start with the one who needs a home soonest."),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  expect((await profileFolders()).length).toBe(foldersBefore.length);

  // Sign out lands on /sign-in, and the guard turns the next visit away.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
  await page.goto("/builder");
  await expect(page).toHaveURL("/sign-in?next=/builder");
});

test("the draft route answers 401 in the one shape when signed out, and never creates a cat", async ({
  request,
}) => {
  const before = await profileFolders();
  const response = await request.put("/api/profiles/zzzzzzzz/draft", { data: {} });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({
    error: { code: "unauthorized", message: "Sign in to continue." },
  });
  expect(await profileFolders()).toEqual(before);
});
