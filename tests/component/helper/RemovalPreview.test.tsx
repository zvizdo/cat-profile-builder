import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RemovalPreview } from "@/core/profile/media-change";
import { RemovalBlock } from "@/ui/helper/RemovalPreview";
import { photo } from "../builder/media-fixtures";

// F59 (review round 1, S2/N4): a `remove_block` card draws the section's own one-line
// preview struck through — the same line `read_outline` writes (`blockPreview`, core) —
// with its photo, when it has exactly one, struck beside it. The line reads in the
// ledger's own mono voice; the photo dims the same way `PhotoChange.tsx`'s leaving face
// does — "what leaves" should read the same on both cards.

const PHOTO = photo("media2ac", "cat-1.jpg", {
  alt: { text: "She purrs at the kettle.", source: "model" },
});

describe("RemovalBlock", () => {
  it("draws the block's own line struck through, with its photo when it has one", () => {
    const preview: RemovalPreview = {
      label: "quote",
      text: "She purrs at the kettle.",
      face: { mediaId: PHOTO.id, known: true },
    };
    const { container } = render(<RemovalBlock preview={preview} assets={[PHOTO]} />);
    const del = container.querySelector("del");
    expect(del).toHaveTextContent("She purrs at the kettle.");
    expect(del).toHaveClass("line-through");
    expect(del?.querySelector(".sr-only")).toHaveTextContent("was:");
    // S2: the ledger's own mono voice, not the panel's base text.
    expect(del?.querySelector(".text-mono-label")).toHaveTextContent("She purrs at the kettle.");
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", PHOTO.cleanUrl);
    // N4: "what leaves" dims the same way on both cards — the image only, never the
    // struck line (which is already at full contrast).
    expect(img.closest(".opacity-60")).not.toBeNull();
  });

  it("draws no face for a section with none, several, or a written list", () => {
    const preview: RemovalPreview = { label: "bio", text: "She purrs at the kettle.", face: null };
    render(<RemovalBlock preview={preview} assets={[PHOTO]} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("draws a striped face, never a broken image, for a photo the library has since lost", () => {
    const preview: RemovalPreview = {
      label: "hero",
      text: "no longer in the library",
      face: { mediaId: "media2ag", known: false },
    };
    render(<RemovalBlock preview={preview} assets={[]} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
  });
});
