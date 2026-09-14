import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MediaChange, RemovalPreview } from "@/core/profile/media-change";
import { photo } from "../builder/media-fixtures";
import { CARD, renderCard } from "./card-harness";

// F59 (the memo's §3, "image changes"): the same feedback F58 answered for text — "you
// Apply or deny but you don't really know what you are applying" — for a photo swap and
// a removal. `ProposalCard.tsx` picks the renderer by the operation's own kind: a
// `replace_image` or a gallery's `set_field mediaIds` draws `PhotoChange`, a
// `remove_block` draws `RemovalBlock` — never both, and never alongside a text `change`
// block (F58's own `change` prop is `null` for every operation these two answer).

const BEFORE = photo("media2aa", "cat-1.jpg", {
  alt: { text: "On the windowsill.", source: "model" },
});
const AFTER = photo("media2ab", "cat-2.jpg", { alt: { text: "Napping.", source: "model" } });

describe("ProposalCard — photo and removal previews (F59)", () => {
  it("draws PhotoChange's two faces for a replace_image card", () => {
    const media: MediaChange = {
      kind: "photo",
      label: "the hero",
      before: { mediaId: BEFORE.id, known: true },
      after: { mediaId: AFTER.id, known: true },
    };
    renderCard({
      card: { ...CARD, op: { op: "replace_image", blockId: "blockaaaaaaa", mediaId: AFTER.id } },
      media,
      assets: [BEFORE, AFTER],
    });
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAccessibleName("On the windowsill.");
    expect(images[1]).toHaveAccessibleName("Napping.");
  });

  it("draws PhotoChange's dropped and kept faces for a gallery's set_field mediaIds", () => {
    const media: MediaChange = {
      kind: "gallery",
      label: "the gallery",
      dropped: [{ mediaId: BEFORE.id, known: true }],
      kept: [{ mediaId: AFTER.id, known: true }],
    };
    const { container } = renderCard({
      card: {
        ...CARD,
        op: {
          op: "set_field",
          target: { kind: "block", blockId: "blockaaaaaad" },
          path: "mediaIds",
          value: [AFTER.id],
        },
      },
      media,
      assets: [BEFORE, AFTER],
    });
    expect(container.querySelector("del")).toHaveTextContent("On the windowsill.");
    expect(screen.getByText("Napping.")).toBeInTheDocument();
  });

  it("draws RemovalBlock's struck line and face for a remove_block card", () => {
    const removal: RemovalPreview = {
      label: "quote",
      text: "She purrs at the kettle.",
      face: { mediaId: BEFORE.id, known: true },
    };
    const { container } = renderCard({ removal, assets: [BEFORE] });
    const del = container.querySelector("del");
    expect(del).toHaveTextContent("She purrs at the kettle.");
    expect(screen.getByRole("img")).toHaveAttribute("src", BEFORE.cleanUrl);
  });

  it("draws neither renderer when the card has no image change", () => {
    const { container } = renderCard();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });
});
