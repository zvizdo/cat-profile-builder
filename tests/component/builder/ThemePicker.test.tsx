import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Theme } from "@/core/profile/schema";
import { ThemePicker } from "@/ui/builder/ThemePicker";

// The rail's Theme group (T026; FR-029–FR-031; CONTENT.md → Rail, Contrast note): four
// preset swatches as a radio group, the warmth and contrast sliders stepping by 0.01 from
// the keyboard and 0.1 by page, a note computed by core for each of its three states, and
// `Restore to passing` when it fails. A slider previews every pixel and records exactly
// one `set_theme` when it is let go.

const PAPER: Theme = { preset: "paper", warmth: 0.5, contrast: 0.5 };

function renderPicker(theme: Theme = PAPER) {
  const onChange = vi.fn();
  const onPreview = vi.fn();
  render(<ThemePicker theme={theme} onChange={onChange} onPreview={onPreview} />);
  return { onChange, onPreview };
}

function slider(name: "warmth" | "contrast"): HTMLInputElement {
  return screen.getByRole("slider", { name });
}

describe("ThemePicker: presets", () => {
  it("offers the four presets as a radio group with the current one checked", () => {
    renderPicker({ ...PAPER, preset: "sand" });
    const group = screen.getByRole("radiogroup", { name: "Preset" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Paper",
      "Card",
      "Night",
      "Sand",
    ]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "false",
      "true",
    ]);
    expect(screen.getByText("Sand", { selector: "span" })).toBeInTheDocument();
  });

  it("the swatches are reached by Tab in order and pick from Enter and Space (keyboard path)", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await user.tab();
    expect(screen.getByRole("radio", { name: "Paper" })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("radio", { name: "Night" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ op: "set_theme", preset: "night" });
    await user.tab();
    expect(screen.getByRole("radio", { name: "Sand" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith({ op: "set_theme", preset: "sand" });
    await user.tab();
    expect(slider("warmth")).toHaveFocus();
  });

  it("a swatch click is one set_theme naming the preset", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await user.click(screen.getByRole("radio", { name: "Night" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ op: "set_theme", preset: "night" });
  });
});

describe("ThemePicker: sliders from the keyboard", () => {
  it("shows both sliders over 0..1 in 0.01 steps with their readings", () => {
    renderPicker({ ...PAPER, warmth: 0.62, contrast: 0.71 });
    expect(slider("warmth")).toHaveAttribute("min", "0");
    expect(slider("warmth")).toHaveAttribute("max", "1");
    expect(slider("warmth")).toHaveAttribute("step", "0.01");
    expect(slider("warmth")).toHaveAttribute("aria-valuetext", "0.62");
    expect(slider("contrast")).toHaveAttribute("aria-valuetext", "0.71");
    expect(screen.getByText("0.62")).toBeInTheDocument();
    expect(screen.getByText("0.71")).toBeInTheDocument();
  });

  it("an arrow key moves a slider by 0.01 and records one set_theme on key up", async () => {
    const user = userEvent.setup();
    const { onChange, onPreview } = renderPicker();
    slider("warmth").focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ op: "set_theme", warmth: 0.51 });
    expect(onPreview).toHaveBeenNthCalledWith(1, { ...PAPER, warmth: 0.51 });
    expect(onPreview).toHaveBeenLastCalledWith(null);
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith({ op: "set_theme", warmth: 0.49 });
    slider("contrast").focus();
    await user.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith({ op: "set_theme", contrast: 0.51 });
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith({ op: "set_theme", contrast: 0.49 });
  });

  it("PageUp and PageDown move by 0.1, Home and End go to the ends, all within 0..1", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ ...PAPER, warmth: 0.95 });
    slider("warmth").focus();
    await user.keyboard("{PageUp}");
    expect(onChange).toHaveBeenLastCalledWith({ op: "set_theme", warmth: 1 });
    await user.keyboard("{PageDown}");
    expect(onChange).toHaveBeenLastCalledWith({ op: "set_theme", warmth: 0.85 });
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith({ op: "set_theme", warmth: 0 });
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith({ op: "set_theme", warmth: 1 });
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("a held key previews every repeat but records once when the key comes up", async () => {
    const { onChange, onPreview } = renderPicker();
    const input = slider("warmth");
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenLastCalledWith({ ...PAPER, warmth: 0.53 });
    fireEvent.keyUp(input, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ op: "set_theme", warmth: 0.53 });
  });
});

describe("ThemePicker: sliders from a pointer", () => {
  it("previews every pixel of a drag and records one set_theme on pointer up", () => {
    const { onChange, onPreview } = renderPicker();
    const input = slider("contrast");
    fireEvent.change(input, { target: { value: "0.4" } });
    fireEvent.change(input, { target: { value: "0.3" } });
    fireEvent.change(input, { target: { value: "0.2" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenCalledTimes(3);
    expect(onPreview).toHaveBeenLastCalledWith({ ...PAPER, contrast: 0.2 });
    expect(input).toHaveAttribute("aria-valuetext", "0.20");
    fireEvent.pointerUp(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ op: "set_theme", contrast: 0.2 });
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it("a slider let go where it started records nothing", () => {
    const { onChange } = renderPicker();
    const input = slider("warmth");
    fireEvent.change(input, { target: { value: "0.6" } });
    fireEvent.change(input, { target: { value: "0.5" } });
    fireEvent.pointerUp(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a change still pending when focus leaves is recorded", () => {
    const { onChange } = renderPicker();
    const input = slider("warmth");
    fireEvent.change(input, { target: { value: "0.8" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ op: "set_theme", warmth: 0.8 });
  });
});

describe("ThemePicker: the contrast note", () => {
  it("says passes AA for dark ink on a light ground", () => {
    renderPicker();
    expect(screen.getByRole("status")).toHaveTextContent("contrast check: passes AA");
    expect(screen.queryByRole("button", { name: "Restore to passing" })).not.toBeInTheDocument();
  });

  it("says light labels swap in for light ink on a dark ground", () => {
    renderPicker({ ...PAPER, preset: "night" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "contrast check: passes AA · light labels swap in",
    );
  });

  it("says publish will warn when the text fails 4.5:1, and offers Restore to passing", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ ...PAPER, preset: "sand", warmth: 0.9, contrast: 0 });
    expect(screen.getByRole("status")).toHaveTextContent(
      "contrast check: fails — publish will warn",
    );
    await user.click(screen.getByRole("button", { name: "Restore to passing" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      op: "set_theme",
      preset: "sand",
      warmth: 0.5,
      contrast: 0.5,
    });
  });

  it("Restore to passing is reached by Tab after the sliders and fires from Enter (keyboard path)", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ ...PAPER, preset: "sand", warmth: 0.9, contrast: 0 });
    slider("contrast").focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Restore to passing" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      op: "set_theme",
      preset: "sand",
      warmth: 0.5,
      contrast: 0.5,
    });
  });

  it("follows the preview while a slider is still held", () => {
    renderPicker();
    fireEvent.change(slider("contrast"), { target: { value: "0" } });
    expect(screen.getByRole("status")).toHaveTextContent("fails — publish will warn");
    fireEvent.change(slider("contrast"), { target: { value: "0.5" } });
    expect(screen.getByRole("status")).toHaveTextContent("contrast check: passes AA");
  });
});
