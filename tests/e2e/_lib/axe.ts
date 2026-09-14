import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// One accessibility check for every page a journey visits (ADR-012; SC-005): zero axe
// violations, judged once the page has settled. The pointer is parked off the page and
// the hover fade given its 300ms, and every running animation — a 320ms panel entrance,
// a toast — is awaited, because axe reads colours as painted and would otherwise judge a
// frame mid-fade rather than the page.

/** What one axe run found: the violations, their node counts by rule, and the rule tallies. */
export interface AxeReport {
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];
  /** Nodes in violation, by rule id. */
  byRule: Record<string, number>;
  /** Rules that passed on at least one node. */
  passes: number;
  /** Rules axe could not decide (it never fails a page on these). */
  incomplete: number;
  /** Rules with nothing on the page to judge. */
  inapplicable: number;
}

/** Runs axe on `page` once it has settled and answers what it found. */
export async function axeViolations(page: Page): Promise<AxeReport> {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await page.evaluate(() =>
    Promise.race([
      Promise.allSettled(
        document
          .getAnimations()
          // A looping animation never finishes; only the entrances are waited for.
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished),
      ),
      new Promise((done) => setTimeout(done, 2000)),
    ]),
  );
  const results = await new AxeBuilder({ page }).analyze();
  const byRule: Record<string, number> = {};
  for (const violation of results.violations) byRule[violation.id] = violation.nodes.length;
  return {
    violations: results.violations,
    byRule,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length,
  };
}

/** Fails on any axe violation, naming the rules that fired. */
export async function runAxe(page: Page): Promise<void> {
  const { violations } = await axeViolations(page);
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

/**
 * Runs axe under each theme preset in turn — the preset's radio is clicked and the sheet
 * awaited on `ground`, the ground the canvas takes at 0.5 / 0.5 — after `show` has put on
 * screen whatever is being judged (a frame's actions, say, which a click elsewhere hides).
 * The page is left on the last preset named.
 */
export async function runAxeUnder(
  page: Page,
  grounds: Record<string, string>,
  show: () => Promise<void>,
): Promise<void> {
  for (const [preset, ground] of Object.entries(grounds)) {
    await page.getByRole("radio", { name: preset }).click();
    await expect(page.locator(".theme-scope")).toHaveCSS("background-color", ground);
    await show();
    await runAxe(page);
  }
}
