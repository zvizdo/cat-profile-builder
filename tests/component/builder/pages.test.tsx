import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/actions/_lib/guard";
import type { LoadedDraft, ProfileSummary } from "@/app/actions/_lib/profiles";
import BuilderIdPage, { generateMetadata } from "@/app/(builder)/builder/[id]/page";
import BuilderPage, { dynamic as builderDynamic } from "@/app/(builder)/builder/page";

// The two server components of the list and the builder shell (T018, T024). The actions
// are faked at the module boundary; what is asserted is what each page does with the
// answer — above all that an unreadable draft renders one sentence and nothing else
// (FR-018) — and that the list's one bar (hi-fi 4a) carries the mark, `Cats`, the count,
// New cat and Sign out (FR-005).

const actions = {
  list: vi.fn<() => Promise<ActionResult<{ profiles: ProfileSummary[] }>>>(),
  load: vi.fn<(id: string) => Promise<ActionResult<LoadedDraft>>>(),
};
vi.mock("@/app/actions/profiles", () => ({
  listProfiles: () => actions.list(),
  loadDraft: (id: string) => actions.load(id),
  createProfile: vi.fn(),
  deleteProfile: vi.fn(),
}));
vi.mock("@/app/actions/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const DOCUMENT: LoadedDraft["document"] = {
  schemaVersion: 1,
  id: "abcdefgh",
  name: "Charlotte",
  blocks: [],
  theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
  updatedAt: "2026-09-10T12:00:00.000Z",
};

describe("BuilderPage", () => {
  it("is read per request, so `next build` never prerenders it against an empty environment", () => {
    expect(builderDynamic).toBe("force-dynamic");
  });

  it("renders the list the action answers with", async () => {
    actions.list.mockResolvedValueOnce({
      ok: true,
      profiles: [
        {
          id: "abcdefgh",
          name: "Charlotte",
          line: "",
          thumbnailUrl: null,
          state: "draft",
          updatedAt: "2026-09-10T12:00:00.000Z",
        },
      ],
    });
    render(await BuilderPage());
    expect(screen.getByRole("heading", { level: 1, name: "Cats" })).toBeInTheDocument();
    expect(screen.getByText("1 · 0 published")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Charlotte/ })).toHaveAttribute(
      "href",
      "/builder/abcdefgh",
    );
  });

  it("carries the list's one bar: the mark, the count, New cat and a Sign out button that submits a form", async () => {
    actions.list.mockResolvedValueOnce({ ok: true, profiles: [] });
    render(await BuilderPage());
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("presentation")).toHaveAttribute("src", "/logo.png");
    expect(within(bar).getByRole("heading", { level: 1, name: "Cats" })).toBeInTheDocument();
    expect(within(bar).getByText("0 · 0 published")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "New cat" })).toBeInTheDocument();
    const button = within(bar).getByRole("button", { name: "Sign out" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).not.toBeNull();
  });

  it("shows the action's sentence instead of an empty list when it fails", async () => {
    actions.list.mockResolvedValueOnce({
      ok: false,
      error: { code: "upstream", message: "The storage service didn't respond." },
    });
    render(await BuilderPage());
    expect(screen.getByRole("alert")).toHaveTextContent("The storage service didn't respond.");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New cat" })).toBeNull();
    expect(screen.queryByText(/published/)).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
  });
});

describe("BuilderIdPage", () => {
  const params = Promise.resolve({ id: "abcdefgh" });

  it("hands the draft to the builder shell: topbar name, canvas, rail, helper slot", async () => {
    actions.load.mockResolvedValueOnce({
      ok: true,
      document: DOCUMENT,
      assets: [],
      state: "draft",
      url: null,
    });
    render(await BuilderIdPage({ params }));
    expect(actions.load).toHaveBeenCalledWith("abcdefgh");
    expect(screen.getByRole("heading", { level: 1, name: "Charlotte" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Canvas" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Media" })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "CATalyst AI Assistant" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All cats /" })).toHaveAttribute("href", "/builder");
  });

  it("titles the tab with the cat's name", async () => {
    actions.load.mockResolvedValueOnce({
      ok: true,
      document: DOCUMENT,
      assets: [],
      state: "draft",
      url: null,
    });
    expect(await generateMetadata({ params })).toEqual({ title: "Charlotte · Builder" });
  });

  it("calls a cat with no name yet Unnamed cat", async () => {
    actions.load.mockResolvedValueOnce({
      ok: true,
      document: { ...DOCUMENT, name: "" },
      assets: [],
      state: "draft",
      url: null,
    });
    render(await BuilderIdPage({ params }));
    expect(screen.getByRole("heading", { level: 1, name: "Unnamed cat" })).toBeInTheDocument();
  });

  it("renders exactly one sentence and an empty canvas for an unreadable draft (FR-018)", async () => {
    actions.load.mockResolvedValueOnce({
      ok: false,
      error: { code: "invalid", message: "This profile couldn't be read." },
    });
    render(await BuilderIdPage({ params }));
    const main = screen.getByRole("main");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "This profile couldn't be read.",
    );
    expect(screen.getByRole("region", { name: "Canvas" })).toBeEmptyDOMElement();
    expect(main.textContent).toBe("This profile couldn't be read.");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("reports any other failure as an alert, not as the page's heading", async () => {
    actions.load.mockResolvedValueOnce({
      ok: false,
      error: { code: "upstream", message: "The storage service didn't respond." },
    });
    render(await BuilderIdPage({ params }));
    expect(screen.getByRole("alert")).toHaveTextContent("The storage service didn't respond.");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Canvas" })).not.toBeInTheDocument();
  });

  it("is a 404 for an id no cat has", async () => {
    actions.load.mockResolvedValueOnce({
      ok: false,
      error: { code: "not_found", message: "There's no cat with that id." },
    });
    await expect(BuilderIdPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
