import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileDocument } from "@/core/profile/schema";
import { CatSexProvider } from "@/ui/builder/cat-sex";
import { FocalPicker } from "@/ui/builder/FocalPicker";
import { PHONE_QUERY } from "@/ui/builder/use-surface";
import { CAT, photo } from "./media-fixtures";

// The focal point picker (FR-011's crop position; hi-fi 7a, CONTENT.md → Focal point): a
// sheet with the clean photo, a click lands the point, arrows nudge 1 % and Shift 10 %
// inside 0..100, Reset returns the centre, the four derived crops follow live, and Save
// sends whole percentages exactly once. Escape and Cancel close without saving. F41: the
// body names the cat by pronoun, read from `useCatSex()`; outside a provider (every test
// here but the dedicated pronoun one) that reads as "they".

function renderPicker(asset = CAT, sex?: ProfileDocument["sex"]) {
  const onSave = vi.fn<(focal: { x: number; y: number }) => Promise<boolean>>();
  onSave.mockResolvedValue(true);
  const onClose = vi.fn();
  const { unmount } = render(
    <CatSexProvider sex={sex}>
      <FocalPicker asset={asset} catName="Charlotte" onSave={onSave} onClose={onClose} />
    </CatSexProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Where should the crop hold on?" });
  const picker = within(dialog).getByRole("button", { name: "Focal point" });
  return { onSave, onClose, dialog, picker, unmount };
}

/** `matchMedia` answering the phone query for a window `width` wide. */
function stubWidth(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === PHONE_QUERY && width < 768,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => vi.unstubAllGlobals());

/** Where each of the four derived crops is positioned. */
function positions(dialog: HTMLElement): string[] {
  const crops = within(dialog).getByRole("group", { name: "Derived crops · live" });
  return within(crops)
    .getAllByRole("presentation")
    .filter((img) => img instanceof HTMLImageElement)
    .map((img) => img.style.objectPosition);
}

describe("FocalPicker", () => {
  it("asks the question over the photo and describes the point to the picker", () => {
    const { dialog, picker } = renderPicker(
      photo("maaaaaaa", "cat-1.jpg", { focal: { x: 62, y: 40 } }),
    );
    expect(dialog).toHaveAccessibleDescription(
      "Click their face. Every crop on the site, the phone and the carousel is derived from this one point.",
    );
    expect(picker).toHaveAccessibleDescription("x 62%, y 40%");
    expect(within(dialog).getByText("Derived crops · live")).toBeInTheDocument();
    expect(within(dialog).getByText("Arrow keys nudge by 1%, shift by 10%")).toBeInTheDocument();
    for (const label of [
      "profile hero · 1440×840",
      "phone · 390×560",
      "list card · 4:3",
      "carousel · 1920×1080",
    ]) {
      expect(within(dialog).getByText(label)).toBeInTheDocument();
    }
    expect(positions(dialog)).toEqual(["62% 40%", "62% 40%", "62% 40%", "62% 40%"]);
  });

  it("names the cat by pronoun in the body — female, male, then unset as 'their' (F41)", () => {
    const { dialog: female, unmount } = renderPicker(CAT, "female");
    expect(female).toHaveAccessibleDescription(
      "Click her face. Every crop on the site, the phone and the carousel is derived from this one point.",
    );
    unmount();
    const { dialog: male } = renderPicker(CAT, "male");
    expect(male).toHaveAccessibleDescription(
      "Click his face. Every crop on the site, the phone and the carousel is derived from this one point.",
    );
  });

  it("nudges 1 % per arrow and 10 % with Shift, clamped to the edges", async () => {
    const user = userEvent.setup();
    const { picker, dialog } = renderPicker();
    picker.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowUp}");
    expect(picker).toHaveAccessibleDescription("x 53%, y 49%");
    await user.keyboard("{Shift>}{ArrowDown}{ArrowLeft}{/Shift}");
    expect(picker).toHaveAccessibleDescription("x 43%, y 59%");
    for (let i = 0; i < 6; i += 1) await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(picker).toHaveAccessibleDescription("x 0%, y 59%");
    expect(positions(dialog)).toEqual(["0% 59%", "0% 59%", "0% 59%", "0% 59%"]);
  });

  it("lands the point under a click, in whole percent", async () => {
    const { picker } = renderPicker();
    vi.spyOn(picker, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 50,
      width: 400,
      height: 200,
    } as DOMRect);
    fireEvent.click(picker, { clientX: 213, clientY: 117 });
    expect(picker).toHaveAccessibleDescription("x 28%, y 34%");
  });

  it("does nothing on Enter or Space, so the keyboard never lands the point at the corner", async () => {
    const user = userEvent.setup();
    const { picker, onSave } = renderPicker();
    picker.focus();
    await user.keyboard("{Enter} ");
    expect(picker).toHaveAccessibleDescription("x 50%, y 50%");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("returns to the centre on Reset", async () => {
    const user = userEvent.setup();
    const { picker, dialog } = renderPicker(
      photo("maaaaaaa", "cat-1.jpg", { focal: { x: 9, y: 91 } }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Reset to centre" }));
    expect(picker).toHaveAccessibleDescription("x 50%, y 50%");
  });

  it("saves whole percentages once and closes when the save lands", async () => {
    const user = userEvent.setup();
    const { picker, dialog, onSave, onClose } = renderPicker();
    picker.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    await user.click(within(dialog).getByRole("button", { name: "Save focal point" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ x: 53, y: 50 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Tab walks picker → Reset → Cancel → Save, and Enter on Save sends the point (keyboard path)", async () => {
    const user = userEvent.setup();
    const { picker, dialog, onSave, onClose } = renderPicker();
    picker.focus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Reset to centre" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Save focal point" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ x: 48, y: 50 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the save did not land", async () => {
    const user = userEvent.setup();
    const { dialog, onSave, onClose } = renderPicker();
    onSave.mockResolvedValueOnce(false);
    await user.click(within(dialog).getByRole("button", { name: "Save focal point" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without saving on Cancel and on Escape", async () => {
    const user = userEvent.setup();
    const { dialog, onSave, onClose } = renderPicker();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("draws the photo at its own proportions — a portrait never sits in a 16:9 box (F39)", () => {
    const { picker } = renderPicker();
    expect(picker).toHaveStyle({ aspectRatio: "3072 / 4080" });
  });

  it("writes the cat's name over the hero crop, since that is what is being positioned (F39)", () => {
    const { dialog } = renderPicker();
    const crops = within(dialog).getByRole("group", { name: "Derived crops · live" });
    expect(within(crops).getByText("Charlotte")).toBeInTheDocument();
  });

  it("on a phone says Tap her face, drops the arrow-key hint, and still offers Save (F39)", () => {
    stubWidth(390);
    const { dialog } = renderPicker(CAT, "female");
    expect(dialog).toHaveAccessibleDescription(
      "Tap her face. Every crop on the site, the phone and the carousel is derived from this one point.",
    );
    expect(within(dialog).queryByText("Arrow keys nudge by 1%, shift by 10%")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Save focal point" })).toBeInTheDocument();
  });
});
