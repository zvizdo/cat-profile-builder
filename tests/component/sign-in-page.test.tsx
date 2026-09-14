import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SignInPage, { dynamic } from "@/app/sign-in/page";
import type { PublishedRow } from "@/core/ports";
import { manifestFor, MAXIMAL } from "./profile/fixtures";

// The sign-in page's logic is what it does with `next` and what its photo panel shows
// (hi-fi 4b): the mark, the live count sentence and a live cat's photo — or the design's
// own photo while nothing is published. The Sign out control (FR-005) is on the list
// page's bar, asserted in builder/pages.test.tsx.

const listPublished = vi.fn<() => Promise<PublishedRow[]>>();
vi.mock("@/adapters/container", () => ({
  getContainer: () => ({ profileStore: { listPublished: () => listPublished() } }),
}));

function published(pid: string, name: string, publishedAt: string): PublishedRow {
  const doc = { ...MAXIMAL, id: pid, name };
  return { pid, doc: { ...doc, publishedAt, slug: name.toLowerCase(), media: manifestFor(doc) } };
}

async function renderSignIn(
  query: Record<string, string | string[] | undefined>,
  rows: PublishedRow[] = [],
) {
  listPublished.mockResolvedValueOnce(rows);
  render(await SignInPage({ searchParams: Promise.resolve(query) }));
}

describe("SignInPage", () => {
  it("is read per request, so `next build` never prerenders it against an empty environment", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("renders the title, the shared-account sentence and the form in a main landmark", async () => {
    await renderSignIn({});
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "One shared account for everyone who writes cat profiles. Ask a coordinator if you don't have it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByText("Forgotten the password? Ask a coordinator.")).toBeInTheDocument();
    expect(document.querySelector('input[name="next"]')).toBeNull();
  });

  it("says how long a sign-in lasts in the mono reading voice, not the dense chrome size (F28 review #9)", async () => {
    await renderSignIn({});
    const sentence = screen.getByText("Stays signed in for 30 days");
    expect(sentence.className).toMatch(/(^|\s)tracking-normal(\s|$)/);
    expect(sentence.className).not.toMatch(/(^|\s)text-ui-dense(\s|$)/);
  });

  it("shows the mark, the design's photo and the zero sentence while nothing is published", async () => {
    await renderSignIn({});
    expect(screen.getByRole("img", { name: "South County Cats" })).toHaveAttribute(
      "src",
      "/logo-white.png",
    );
    expect(screen.getByText("No cats are on a page yet.")).toBeInTheDocument();
    const photo = screen.getByRole("img", { name: /window hammock/ });
    expect(photo).toHaveAttribute("src", expect.stringContaining("sign-in-fallback.jpg"));
    expect(photo).toHaveStyle({ objectPosition: "48% 45%" });
  });

  it("shows the most recently published cat's photo and counts the live cats", async () => {
    await renderSignIn({}, [
      published("aaaaaaaa", "Charlotte", "2026-09-01T00:00:00.000Z"),
      published("bbbbbbbb", "Milo", "2026-09-10T00:00:00.000Z"),
    ]);
    expect(screen.getByText("2 cats are waiting on a page.")).toBeInTheDocument();
    // The manifest's photo, with the manifest's alt; not the design's fallback.
    expect(screen.getByRole("img", { name: /Photo/ })).toHaveAttribute(
      "src",
      expect.stringContaining("kx3f7q2m"),
    );
    expect(screen.queryByRole("img", { name: /window hammock/ })).toBeNull();
  });

  it("says one cat in the singular", async () => {
    await renderSignIn({}, [published("aaaaaaaa", "Charlotte", "2026-09-01T00:00:00.000Z")]);
    expect(screen.getByText("1 cat is waiting on a page.")).toBeInTheDocument();
  });

  it("hands a string next to the form", async () => {
    await renderSignIn({ next: "/builder/abcdefgh" });
    expect(document.querySelector('input[name="next"]')).toHaveValue("/builder/abcdefgh");
  });

  it("ignores a repeated next", async () => {
    await renderSignIn({ next: ["/builder", "/other"] });
    expect(document.querySelector('input[name="next"]')).toBeNull();
  });
});
