import type { Page } from "@playwright/test";

// A visitor is anyone with no cookies: what the public site serves them is read from a
// fresh browser context that shares nothing with the signed-in volunteer's.

/** The status and served HTML of `path`, from a context that carries no cookies. */
export async function servedTo(
  page: Page,
  path: string,
): Promise<{ status: number; html: string }> {
  const context = await page.context().browser()?.newContext();
  if (context === undefined) throw new Error("no browser");
  try {
    const visitor = await context.newPage();
    const response = await visitor.goto(path);
    const html = await visitor.content();
    return { status: response?.status() ?? 0, html };
  } finally {
    await context.close();
  }
}
