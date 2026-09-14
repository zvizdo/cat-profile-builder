import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { describeOperation, type EditOperation } from "@/core/profile/operations";
import type { Block, ProfileDocument } from "@/core/profile/schema";
import { EnhanceCompare } from "@/ui/builder/EnhanceCompare";
import type { ReadyPhoto } from "@/ui/builder/enhance-state";
import { DOC } from "./canvas-fixtures";
import { EditorHarness } from "./blocks/harness";
import { CAT, photo } from "./media-fixtures";

// The before/after view (T045; FR-052, FR-053): the original and the enhanced result at
// the same crop under one divider, a keyboard toggle between the two, and two answers —
// `Use enhanced` is exactly one `replace_image` on the placement it was opened from,
// `Keep original` (and Escape) dispatches nothing. On a placed enhanced photo the label
// row offers `revert to original`: one `replace_image` back to the source, in that
// placement alone.

const ENHANCED: ReadyPhoto = {
  ...photo("menhaaaa", "cat-1.jpg", {
    enhancement: { sourceMediaId: CAT.id, recipe: "auto-v1" },
    revisions: { clean: "f6e5d4c3b2" },
    createdAt: "2026-09-10T12:05:00.000Z",
  }),
  cleanUrl: "/media/profiles/abcdefgh/media/menhaaaa/clean.f6e5d4c3b2.jpg",
};
const ORIGINAL: ReadyPhoto = { ...CAT, cleanUrl: ENHANCED.cleanUrl.replace("menhaaaa", CAT.id) };

const HERO_ID = "heroaaaaaaaa";
const HERO_DOC: ProfileDocument = {
  ...DOC,
  blocks: [{ id: HERO_ID, type: "hero", mediaId: CAT.id }],
};

function renderCompare(overrides: Partial<Parameters<typeof EnhanceCompare>[0]> = {}) {
  const onApply = vi.fn<(op: EditOperation) => void>();
  const onClose = vi.fn();
  render(
    <EnhanceCompare
      original={ORIGINAL}
      enhanced={ENHANCED}
      placement={{ blockId: HERO_ID }}
      describe={(op) => describeOperation(HERO_DOC, op, [CAT, ENHANCED])}
      onApply={onApply}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onApply, onClose };
}

/** The enhanced layer: the image that the divider clips. */
function enhancedLayer(): HTMLElement {
  const img = screen.getByRole("dialog").querySelector('img[data-layer="enhanced"]');
  if (!(img instanceof HTMLElement)) throw new Error("no enhanced layer");
  return img;
}

describe("EnhanceCompare", () => {
  it("is a dialog that says what the recipe does, with both photos at the same crop", () => {
    renderCompare();
    const dialog = screen.getByRole("dialog", { name: "Use the enhanced photo in the hero?" });
    expect(dialog).toHaveAccessibleDescription(/nowhere else on the page/);
    expect(dialog).toHaveAccessibleDescription(/stays in your library either way/);
    const images = dialog.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", ORIGINAL.cleanUrl);
    expect(images[1]).toHaveAttribute("src", ENHANCED.cleanUrl);
    expect(images[0]).toHaveStyle({ objectPosition: "50% 50%" });
    expect(images[1]).toHaveStyle({ objectPosition: "50% 50%" });
    // Half and half to start: the divider sits in the middle and neither side is chosen.
    expect(screen.getByRole("slider", { name: "Divider" })).toHaveValue("50");
    expect(screen.getByRole("radio", { name: "Original" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "Enhanced" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("button", { name: "Keep original" })).toHaveFocus();
  });

  it("toggles between the two from the keyboard: arrows move and check, Space and Enter check", async () => {
    const user = userEvent.setup();
    renderCompare();
    const original = screen.getByRole("radio", { name: "Original" });
    const enhanced = screen.getByRole("radio", { name: "Enhanced" });
    // Back from `Keep original`: the divider, then — with neither checked — the first option.
    await user.tab({ shift: true });
    expect(screen.getByRole("slider", { name: "Divider" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(original).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(enhanced).toHaveFocus();
    expect(enhanced).toHaveAttribute("aria-checked", "true");
    expect(enhancedLayer()).toHaveStyle({ clipPath: "inset(0 0 0 0%)" });
    expect(screen.getByRole("slider", { name: "Divider" })).toHaveValue("0");
    await user.keyboard("{ArrowLeft}");
    expect(original).toHaveFocus();
    expect(original).toHaveAttribute("aria-checked", "true");
    expect(enhancedLayer()).toHaveStyle({ clipPath: "inset(0 0 0 100%)" });
    expect(screen.getByRole("slider", { name: "Divider" })).toHaveValue("100");
    // Space and Enter check the focused option without moving.
    enhanced.focus();
    await user.keyboard(" ");
    expect(enhanced).toHaveAttribute("aria-checked", "true");
    original.focus();
    await user.keyboard("{Enter}");
    expect(original).toHaveAttribute("aria-checked", "true");
    // Only the checked option is in the Tab order.
    expect(original).toHaveAttribute("tabindex", "0");
    expect(enhanced).toHaveAttribute("tabindex", "-1");
  });

  it("drags the divider: the original shows left of it under its chip, the result right of it, and neither option is checked between the ends", () => {
    renderCompare();
    const divider = screen.getByRole("slider", { name: "Divider" });
    fireEvent.change(divider, { target: { value: "30" } });
    // The divider stands 30% from the left: the enhanced layer's left 30% is cut away, so
    // the original shows there — under the chip nearest x = 0, which says so.
    expect(enhancedLayer()).toHaveStyle({ clipPath: "inset(0 0 0 30%)" });
    expect(divider).toHaveAttribute("aria-valuetext", "70% enhanced");
    const chips = screen.getByRole("dialog").querySelectorAll("[aria-hidden] ");
    const left = Array.from(chips).find((chip) => chip.classList.contains("left-8"));
    const right = Array.from(chips).find((chip) => chip.classList.contains("right-8"));
    expect(left).toHaveTextContent("original");
    expect(right).toHaveTextContent("enhanced");
    expect(screen.getByRole("radio", { name: "Original" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "Enhanced" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("Use enhanced dispatches exactly one replace_image with the new id, then closes", async () => {
    const user = userEvent.setup();
    const { onApply, onClose } = renderCompare();
    await user.click(screen.getByRole("button", { name: "Use enhanced" }));
    expect(onApply).toHaveBeenCalledExactlyOnceWith({
      op: "replace_image",
      blockId: HERO_ID,
      mediaId: ENHANCED.id,
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("carries the slot for a gallery or day placement", async () => {
    const user = userEvent.setup();
    const { onApply } = renderCompare({ placement: { blockId: "galleryaaaaa", slot: 2 } });
    await user.click(screen.getByRole("button", { name: "Use enhanced" }));
    expect(onApply).toHaveBeenCalledExactlyOnceWith({
      op: "replace_image",
      blockId: "galleryaaaaa",
      mediaId: ENHANCED.id,
      slot: 2,
    });
  });

  it("Keep original takes focus on open and answers from Space; Tab reaches Use enhanced, which answers from Enter (keyboard path)", async () => {
    const user = userEvent.setup();
    const { onApply, onClose } = renderCompare();
    expect(screen.getByRole("button", { name: "Keep original" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
    await user.tab();
    expect(screen.getByRole("button", { name: "Use enhanced" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onApply).toHaveBeenCalledExactlyOnceWith({
      op: "replace_image",
      blockId: HERO_ID,
      mediaId: ENHANCED.id,
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("Keep original and Escape close without dispatching anything", async () => {
    const user = userEvent.setup();
    const { onApply, onClose } = renderCompare();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Keep original" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
  });
});

const HERO = { id: HERO_ID, type: "hero", mediaId: CAT.id } satisfies Block;
const ENHANCED_HERO = { ...HERO, mediaId: ENHANCED.id } satisfies Block;

describe("Enhance on a placed photo", () => {
  it("enhance on the hero's label row runs the enhancement, shows processing meanwhile, then opens the compare", async () => {
    const user = userEvent.setup();
    // The library's `enhance`, held open until the test lands the new record.
    let onEnhanced: (asset: AssetView) => void = () => undefined;
    let settle: (ok: boolean) => void = () => undefined;
    const onEnhance = vi.fn((mediaId: string, landed: (asset: AssetView) => void) => {
      onEnhanced = landed;
      return new Promise<boolean>((resolve) => {
        settle = resolve;
      });
    });
    const ops: EditOperation[] = [];
    const { rerender } = render(
      <EditorHarness
        block={HERO}
        assets={[CAT]}
        onEnhance={onEnhance}
        onApply={(op) => ops.push(op)}
      />,
    );
    await user.click(screen.getByRole("button", { name: "enhance" }));
    expect(onEnhance).toHaveBeenCalledWith(CAT.id, expect.any(Function));
    // In flight: the action reads `processing` and is disabled — no spinner.
    const busy = screen.getByRole("button", { name: "processing" });
    expect(busy).toBeDisabled();
    // The library now holds the new record; the editor sees it through `assets`.
    rerender(
      <EditorHarness
        block={HERO}
        assets={[CAT, ENHANCED]}
        onEnhance={onEnhance}
        onApply={(op) => ops.push(op)}
      />,
    );
    await act(async () => {
      onEnhanced(ENHANCED);
      settle(true);
    });
    const dialog = screen.getByRole("dialog", { name: "Use the enhanced photo in the hero?" });
    expect(screen.getByRole("button", { name: "enhance" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Use enhanced" }));
    expect(ops).toEqual([{ op: "replace_image", blockId: HERO_ID, mediaId: ENHANCED.id }]);
    expect(screen.queryByRole("dialog")).toBeNull();
    // The placement is now the enhanced photo: the row offers revert, not enhance.
    expect(screen.getByRole("button", { name: "revert to original" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "enhance" })).toBeNull();
  });

  it("revert to original dispatches one replace_image back to the source, in this placement", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(
      <EditorHarness
        block={ENHANCED_HERO}
        assets={[CAT, ENHANCED]}
        onApply={(op) => ops.push(op)}
      />,
    );
    await user.click(screen.getByRole("button", { name: "revert to original" }));
    expect(ops).toEqual([{ op: "replace_image", blockId: HERO_ID, mediaId: CAT.id }]);
    expect(screen.getByRole("button", { name: "enhance" })).toBeInTheDocument();
  });

  it("offers neither action when the source of an enhanced photo is gone, nor on an empty slot", () => {
    render(<EditorHarness block={ENHANCED_HERO} assets={[ENHANCED]} />);
    expect(screen.queryByRole("button", { name: "revert to original" })).toBeNull();
    expect(screen.queryByRole("button", { name: "enhance" })).toBeNull();
  });

  it("a gallery cell carries enhance in its own row under the controls, not over the photo, and reverts its own slot only", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    const gallery = {
      id: "galleryaaaaa",
      type: "gallery",
      mediaIds: [CAT.id, ENHANCED.id, CAT.id],
    } satisfies Block;
    render(
      <EditorHarness block={gallery} assets={[CAT, ENHANCED]} onApply={(op) => ops.push(op)} />,
    );
    const enhance = screen.getAllByRole("button", { name: "enhance" });
    expect(enhance).toHaveLength(2);
    // The photo keeps its one chip; the action sits outside the slot's box.
    expect(screen.getAllByRole("button", { name: "replace photo" })).toHaveLength(3);
    for (const button of enhance) expect(button.closest(".group\\/slot")).toBeNull();
    await user.click(screen.getByRole("button", { name: "revert to original" }));
    expect(ops).toEqual([
      { op: "replace_image", blockId: "galleryaaaaa", mediaId: CAT.id, slot: 1 },
    ]);
    expect(screen.getAllByRole("button", { name: "enhance" })).toHaveLength(3);
  });
});
