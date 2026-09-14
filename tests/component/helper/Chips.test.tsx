import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Chips } from "@/ui/helper/Chips";

// T036 brief → "Tests first": chips are real buttons, each sending its own label
// verbatim (contracts/helper-protocol.md: "the design's helper chips send exactly these
// requests"); `Build the page` joins them only on an empty page.

describe("Chips", () => {
  it("renders the three chips as buttons and sends each one's own label", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Chips onSend={onSend} emptyPage={false} />);
    for (const label of ["Write a bio", "Pick a theme", "Tidy the order"]) {
      const chip = screen.getByRole("button", { name: label });
      await user.click(chip);
      expect(onSend).toHaveBeenLastCalledWith(label);
    }
    expect(onSend).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("button", { name: "Build the page" })).not.toBeInTheDocument();
  });

  it("adds Build the page only while the page has no blocks beyond the hero", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Chips onSend={onSend} emptyPage />);
    const chip = screen.getByRole("button", { name: "Build the page" });
    await user.click(chip);
    expect(onSend).toHaveBeenCalledWith("Build the page");
  });

  it("every chip in the sheet layout is at least a 44px tap target", () => {
    render(<Chips onSend={vi.fn()} emptyPage={false} layout="sheet" />);
    for (const chip of screen.getAllByRole("button")) {
      expect(chip).toHaveClass("min-h-44");
    }
  });

  it("keeps the docked column's chips at the pill's own height, not the tap floor", () => {
    render(<Chips onSend={vi.fn()} emptyPage={false} />);
    for (const chip of screen.getAllByRole("button")) {
      expect(chip).not.toHaveClass("min-h-44");
    }
  });

  // F27 (audit §3.11): on the phone the pills run in one line that scrolls sideways,
  // each pill whole (never shrunk or wrapped), while the docked column's row wraps.
  it("in the sheet the chips sit in one horizontally scrolling row; docked, they wrap", () => {
    const { unmount } = render(<Chips onSend={vi.fn()} emptyPage layout="sheet" />);
    const chips = screen.getAllByRole("button");
    const row = chips[0]?.parentElement;
    expect(row).toHaveClass("flex-nowrap", "overflow-x-auto", "snap-x");
    expect(row).not.toHaveClass("flex-wrap");
    for (const chip of chips) {
      expect(chip).toHaveClass("shrink-0", "whitespace-nowrap", "snap-start");
    }
    unmount();

    render(<Chips onSend={vi.fn()} emptyPage />);
    const docked = screen.getAllByRole("button")[0]?.parentElement;
    expect(docked).toHaveClass("flex-wrap");
    expect(docked).not.toHaveClass("overflow-x-auto");
  });

  it("while disabled, every chip is out of the tab order and sends nothing", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Chips onSend={onSend} emptyPage disabled />);
    for (const chip of screen.getAllByRole("button")) {
      expect(chip).toBeDisabled();
    }
    await user.tab();
    expect(document.body).toHaveFocus();
    expect(onSend).not.toHaveBeenCalled();
  });
});
