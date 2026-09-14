import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CatsPage from "@/app/(public)/cats/page";
import type { PublishedRow } from "@/core/ports";
import { EMPTY_INDEX, INDEX_INTRO, INDEX_KICKER } from "@/ui/profile/IndexPage";
import { manifestFor, MAXIMAL } from "./profile/fixtures";

// The public index (FR-090): the live cats as linked cards — photo, name, line — most
// recently published first, from `listPublished()` alone; the one sentence when there
// are none; nothing internal in the markup.

const listPublished = vi.fn<() => Promise<PublishedRow[]>>();
vi.mock("@/adapters/container", () => ({
  getContainer: () => ({ profileStore: { listPublished: () => listPublished() } }),
}));

function published(pid: string, name: string, publishedAt: string): PublishedRow {
  const doc = { ...MAXIMAL, id: pid, name };
  return { pid, doc: { ...doc, publishedAt, slug: name.toLowerCase(), media: manifestFor(doc) } };
}

describe("/cats", () => {
  it("renders the empty sentence with a main landmark when nothing is live", async () => {
    listPublished.mockResolvedValue([]);
    render(await CatsPage());
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cats looking for a home");
    expect(screen.getByText(EMPTY_INDEX)).toBeInTheDocument();
    expect(screen.getByText(INDEX_KICKER)).toBeInTheDocument();
    expect(screen.queryByText(INDEX_INTRO)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("photo coming")).toBeNull();
  });

  it("lists every live cat as one link — photo, name, line — newest first, with no ids in the text", async () => {
    listPublished.mockResolvedValue([
      published("aaaaaaaa", "Charlotte", "2026-09-01T00:00:00.000Z"),
      published("bbbbbbbb", "Milo", "2026-09-10T00:00:00.000Z"),
    ]);
    const { container } = render(await CatsPage());
    const cards = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    const [milo, charlotte] = cards as [HTMLElement, HTMLElement];
    const link = within(milo).getByRole("link");
    expect(link).toHaveAttribute("href", "/cats/milo-bbbbbbbb");
    expect(link).toHaveTextContent("Milo");
    expect(link).toHaveTextContent("Loves sunbeams and gentle chin scratches.");
    expect(within(milo).getByRole("img")).toHaveAttribute("alt", expect.stringMatching(/Photo/));
    expect(within(charlotte).getByRole("link")).toHaveAttribute("href", "/cats/charlotte-aaaaaaaa");
    expect(screen.getByRole("link", { name: "South County Cats" })).toHaveAttribute(
      "href",
      "/cats",
    );
    const html = container.innerHTML;
    for (const block of MAXIMAL.blocks) expect(html).not.toContain(block.id);
    expect(html).not.toContain("updatedAt");
    expect(html).not.toContain("publishedAt");
  });

  it("opens like a profile section — the mark in the bar, a kicker, the title, one sentence", async () => {
    listPublished.mockResolvedValue([
      published("aaaaaaaa", "Charlotte", "2026-09-01T00:00:00.000Z"),
    ]);
    render(await CatsPage());
    const wordmark = screen.getByRole("link", { name: "South County Cats" });
    expect(wordmark).toHaveAttribute("href", "/cats");
    expect(wordmark).toHaveAttribute("aria-current", "page");
    expect(within(wordmark).getByRole("img", { name: "South County Cats" })).toBeInTheDocument();
    expect(screen.getByText(INDEX_KICKER)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cats looking for a home");
    expect(screen.getByText(INDEX_INTRO)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_INDEX)).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("draws the card as the system's card: 4:3 on stripes, a still photo, the name at the display floor", async () => {
    listPublished.mockResolvedValue([
      published("aaaaaaaa", "Charlotte", "2026-09-01T00:00:00.000Z"),
    ]);
    render(await CatsPage());
    const card = within(screen.getByRole("listitem")).getByRole("link");
    const photo = within(card).getByRole("img");
    expect(photo.className).not.toMatch(/transition|scale/);
    expect(photo.parentElement).toHaveClass("aspect-[4/3]", "stripes");
    expect(screen.getByText("Charlotte")).toHaveClass("text-index-name", "font-display");
    expect(screen.getByText("Loves sunbeams and gentle chin scratches.")).toHaveClass(
      "line-clamp-2",
    );
    expect(card.className).not.toMatch(/scale|shadow/);
  });
});
