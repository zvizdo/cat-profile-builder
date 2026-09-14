import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MediaChange } from "@/core/profile/media-change";
import { PhotoChange } from "@/ui/helper/PhotoChange";
import { photo } from "../builder/media-fixtures";

// F59 (the memo's §3, "image changes"; review round 1, S1/S2): the non-text half of
// F58's change block. A `replace_image` card draws the current photo above the proposed
// one — the shape `RemovalPreview.tsx`'s single face already has, each cropped on its
// own focal point (the rail's own `tileFace`) beside its own caption line, never
// squeezed under the 56px face — struck and dimmed for the one leaving, plain for the
// one arriving. No arrow: "was, then now" stacked vertically is F58's own two-line
// order. Every caption reads in the ledger's own mono voice at the ledger's own size. A
// gallery's dropped ids draw the same way, struck, above the kept ones, plain.

const BEFORE = photo("media2aa", "cat-1.jpg", {
  alt: { text: "On the windowsill.", source: "model" },
});
const AFTER = photo("media2ab", "cat-2.jpg", { alt: { text: "Napping.", source: "model" } });
const KEPT = photo("media2ac", "cat-3.jpg", { alt: { text: "In the sun.", source: "model" } });

describe("PhotoChange", () => {
  it("draws the current photo struck, the proposed one plain, each by its own alt text", () => {
    const change: MediaChange = {
      kind: "photo",
      label: "the hero",
      before: { mediaId: BEFORE.id, known: true },
      after: { mediaId: AFTER.id, known: true },
    };
    const { container } = render(<PhotoChange change={change} assets={[BEFORE, AFTER]} />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", BEFORE.cleanUrl);
    expect(images[0]).toHaveAccessibleName("On the windowsill.");
    expect(images[1]).toHaveAttribute("src", AFTER.cleanUrl);
    expect(images[1]).toHaveAccessibleName("Napping.");
    const del = container.querySelector("del");
    const ins = container.querySelector("ins");
    expect(del).toHaveTextContent("On the windowsill.");
    expect(del).toHaveClass("line-through");
    expect(ins).toHaveTextContent("Napping.");
    expect(del?.querySelector(".sr-only")).toHaveTextContent("was:");
    expect(ins?.querySelector(".sr-only")).toHaveTextContent("now:");
    // S1: no arrow, and no 56px caption column to wrap or overrun.
    expect(screen.queryByText("→")).not.toBeInTheDocument();
    expect(container.querySelector(".w-56")).toBeNull();
    // S2: the ledger's own mono voice (`MonoLabel variant="reading"`), not the panel's
    // base text.
    expect(del?.querySelector(".text-mono-label")).toHaveTextContent("On the windowsill.");
    expect(ins?.querySelector(".text-mono-label")).toHaveTextContent("Napping.");
  });

  it("draws a striped face, never a broken image, for an id the library has since lost", () => {
    const change: MediaChange = {
      kind: "photo",
      label: "the hero",
      before: { mediaId: "media2ag", known: false },
      after: { mediaId: AFTER.id, known: true },
    };
    const { container } = render(<PhotoChange change={change} assets={[AFTER]} />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(container.querySelector("del")).toHaveTextContent("no longer in the library");
    // N5: the striped word is the rail's own 10px floor (`STRIPES_WORD`), not the
    // ledger's 11px reading voice — it sits inside a 56px box, same as the rail's tile.
    expect(container.querySelector(".text-mono-floor")).toHaveTextContent("missing");
  });

  it("draws a gallery's dropped faces struck and the kept ones plain, one row", () => {
    const change: MediaChange = {
      kind: "gallery",
      label: "the gallery",
      dropped: [{ mediaId: BEFORE.id, known: true }],
      kept: [{ mediaId: KEPT.id, known: true }],
    };
    const { container } = render(<PhotoChange change={change} assets={[BEFORE, KEPT]} />);
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(container.querySelector("del")).toHaveTextContent("On the windowsill.");
    expect(container.querySelector("ins")).toBeNull();
    expect(screen.getByText("In the sun.")).toBeInTheDocument();
  });
});
