import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/actions/_lib/guard";
import type { LoadedDraft } from "@/app/actions/_lib/profiles";
import type { Lookup } from "@/app/(public)/cats/[slugAndId]/_lib/lookup";
import PreviewPage, {
  generateMetadata as previewMetadata,
} from "@/app/(builder)/builder/[id]/preview/page";
import NotFound from "@/app/(public)/cats/[slugAndId]/not-found";
import PublicPage, { generateMetadata } from "@/app/(public)/cats/[slugAndId]/page";
import { CAT } from "../builder/media-fixtures";
import { manifestFor, MAXIMAL, stubMatchMedia, stubPlayback } from "./fixtures";

// The two routes over the one renderer (contracts/server-boundary.md → Pages): the public
// page 404s, 308s or renders from the lookup alone and names no id in its metadata; the
// preview renders the draft through the same page under a slim signed-in bar.

const lookup = vi.fn<() => Promise<Lookup>>();
vi.mock("@/app/(public)/cats/[slugAndId]/_lib/lookup", () => ({
  lookupPublished: () => lookup(),
}));
const load = vi.fn<(id: string) => Promise<ActionResult<LoadedDraft>>>();
vi.mock("@/app/actions/profiles", () => ({ loadDraft: (id: string) => load(id) }));
vi.mock("@/adapters/container", () => ({ getContainer: () => ({ profileStore: {} }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const PUBLISHED = {
  ...MAXIMAL,
  publishedAt: "2026-09-10T12:00:00.000Z",
  slug: "charlotte",
  media: manifestFor(MAXIMAL),
};
const params = Promise.resolve({ slugAndId: "charlotte-kx3f7q2m" });

beforeEach(() => {
  stubMatchMedia(false);
  stubPlayback();
});
afterEach(() => vi.restoreAllMocks());

describe("/cats/[slugAndId]", () => {
  it("renders the published document", async () => {
    lookup.mockResolvedValue({ kind: "found", document: PUBLISHED });
    render(await PublicPage({ params }));
    expect(screen.getByRole("heading", { level: 1, name: "Charlotte" })).toBeInTheDocument();
    expect(screen.queryByText(/preview/i)).toBeNull();
  });

  it("is a 404 without a published document", async () => {
    lookup.mockResolvedValue({ kind: "not-found" });
    await expect(PublicPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is a permanent redirect for a stale slug", async () => {
    lookup.mockResolvedValue({ kind: "redirect", to: "/cats/charlotte-kx3f7q2m" });
    await expect(PublicPage({ params })).rejects.toThrow("NEXT_REDIRECT:/cats/charlotte-kx3f7q2m");
  });

  it("titles the page with the name and describes it with the display line, no ids", async () => {
    lookup.mockResolvedValue({ kind: "found", document: PUBLISHED });
    const metadata = await generateMetadata({ params });
    expect(metadata).toEqual({
      title: "Charlotte",
      description: "Loves sunbeams and gentle chin scratches.",
    });
    expect(JSON.stringify(metadata)).not.toContain("kx3f7q2m");
  });

  it("has no metadata for a page that will not render", async () => {
    lookup.mockResolvedValue({ kind: "not-found" });
    expect(await generateMetadata({ params })).toEqual({});
  });
});

describe("not-found", () => {
  it("says the cat is not listed and links back to the index, with no footer", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "This cat isn't listed right now.",
    );
    expect(screen.getByRole("link", { name: "See the cats looking for a home" })).toHaveAttribute(
      "href",
      "/cats",
    );
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });
});

describe("/builder/[id]/preview", () => {
  const params = Promise.resolve({ id: "kx3f7q2m" });

  it("renders the draft as the public page under the preview bar", async () => {
    load.mockResolvedValue({
      ok: true,
      document: MAXIMAL,
      assets: [CAT],
      state: "draft",
      url: null,
    });
    render(await PreviewPage({ params }));
    expect(screen.getByText("Preview · this is how the page looks once published")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to the builder" })).toHaveAttribute(
      "href",
      "/builder/kx3f7q2m",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Charlotte" })).toBeInTheDocument();
    expect(screen.getAllByText("photo").length).toBeGreaterThan(0);
    expect(await previewMetadata({ params })).toEqual({ title: "Charlotte · Preview" });
  });

  it("is a 404 for an id no cat has", async () => {
    load.mockResolvedValue({
      ok: false,
      error: { code: "not_found", message: "There's no cat with that id." },
    });
    await expect(PreviewPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the action's sentence for any other failure", async () => {
    load.mockResolvedValue({
      ok: false,
      error: { code: "invalid", message: "This profile couldn't be read." },
    });
    render(await PreviewPage({ params }));
    expect(screen.getByRole("alert")).toHaveTextContent("This profile couldn't be read.");
    expect(await previewMetadata({ params })).toEqual({ title: "Preview" });
  });
});
