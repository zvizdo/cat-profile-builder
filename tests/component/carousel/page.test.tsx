import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CarouselCat } from "@/core/carousel/roster";
import CarouselPage from "@/app/(public)/carousel/page";
import { stubMatchMedia, stubPlayback } from "../profile/fixtures";
import { ROSTER } from "./fixtures";

// `/carousel?hold=` (server-boundary.md → Pages; FR-089): the roster from the store and
// the hold from the address, clamped by `parseHold`, into the one carousel.

const roster = vi.fn<() => Promise<CarouselCat[]>>();
vi.mock("@/app/api/_lib/carousel", () => ({ loadRoster: () => roster() }));
vi.mock("@/adapters/container", () => ({ getContainer: () => ({}) }));

function stage(): HTMLElement {
  const root = document.querySelector("[data-beat]");
  if (root === null) throw new Error("no stage");
  return root as HTMLElement;
}

beforeEach(() => {
  stubMatchMedia(false);
  stubPlayback();
});
afterEach(() => vi.restoreAllMocks());

describe("/carousel", () => {
  it("renders the live roster at the default eight-second hold", async () => {
    roster.mockResolvedValue(ROSTER);
    render(await CarouselPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
    expect(stage().style.getPropertyValue("--hold")).toBe("8s");
  });

  it("takes ?hold= and clamps it: 12 holds 12, 99 behaves as 20, abc as 8", async () => {
    roster.mockResolvedValue(ROSTER);
    for (const [hold, expected] of [
      ["12", "12s"],
      ["99", "20s"],
      ["abc", "8s"],
    ]) {
      const { unmount } = render(await CarouselPage({ searchParams: Promise.resolve({ hold }) }));
      expect(stage().style.getPropertyValue("--hold")).toBe(expected);
      unmount();
    }
  });

  it("shows the empty rotation when nothing is live", async () => {
    roster.mockResolvedValue([]);
    render(await CarouselPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Nothing in the rotation" }),
    ).toBeInTheDocument();
  });
});
