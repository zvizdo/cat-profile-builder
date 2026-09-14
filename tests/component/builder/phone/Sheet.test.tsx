import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "@/ui/builder/phone/Sheet";

// The phone's drawer at its Full height (design 2026-09-13 §3, `modal` mode): a dialog
// slid up from the bottom, named by its title, with `aria-modal`, the Tab trap and
// Escape — the same contract as `Modal`, through the shared `dialog-focus` helpers — and
// focus back on the tab that opened it when it closes. Renders nothing while closed.

function Page({
  open,
  onClose,
  titleVisible,
}: {
  open: boolean;
  onClose: () => void;
  titleVisible?: boolean;
}) {
  return (
    <>
      <button type="button">Opener</button>
      <Sheet
        id="sheet-media"
        mode="modal"
        open={open}
        title="Media · 3 items"
        onClose={onClose}
        titleVisible={titleVisible}
      >
        <button type="button">Upload</button>
        <button type="button">Tile</button>
      </Sheet>
    </>
  );
}

describe("Sheet (modal)", () => {
  it("renders nothing while closed", () => {
    render(<Page open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.getElementById("sheet-media")).toBeNull();
  });

  it("is a modal dialog named by its title, carrying the id its tab points at, with a 44px Close", () => {
    render(<Page open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Media · 3 items" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("id", "sheet-media");
    expect(screen.getByRole("heading", { level: 2, name: "Media · 3 items" })).toBeInTheDocument();
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).toMatch(/size-44/);
    expect(close).toHaveFocus();
  });

  it("keeps its title for the screen reader alone when the content draws its own header", () => {
    render(<Page open onClose={vi.fn()} titleVisible={false} />);
    // Still named by the title, still closable from the same 44px Close; the heading is
    // in the tree for the name (its visual hiding is the e2e's to measure).
    expect(screen.getByRole("dialog", { name: "Media · 3 items" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Media · 3 items" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("traps Tab inside, closes on Escape and on Close, and hands focus back to the opener", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<Page open={false} onClose={onClose} />);
    screen.getByRole("button", { name: "Opener" }).focus();
    rerender(<Page open onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Upload" })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<Page open={false} onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Opener" })).toHaveFocus();
  });

  it("hands focus back to a recorded opener rather than whatever was focused as it opened", () => {
    const onClose = vi.fn();
    render(<button type="button">Chip</button>);
    const chip = screen.getByRole("button", { name: "Chip" });
    const returnFocus = { to: { current: chip } };
    const { rerender } = render(
      <Sheet id="s" mode="modal" open title="T" onClose={onClose} returnFocus={returnFocus}>
        <button type="button">Inside</button>
      </Sheet>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    rerender(
      <Sheet id="s" mode="modal" open={false} title="T" onClose={onClose} returnFocus={returnFocus}>
        <button type="button">Inside</button>
      </Sheet>,
    );
    expect(chip).toHaveFocus();
  });

  it("falls back to the stand-in when the recorded opener cannot take focus", () => {
    const onClose = vi.fn();
    render(
      <>
        <button type="button" disabled>
          Chip
        </button>
        <button type="button">Tab</button>
      </>,
    );
    const chip = screen.getByRole("button", { name: "Chip" });
    const tab = screen.getByRole("button", { name: "Tab" });
    const returnFocus = { to: { current: chip }, fallback: () => tab };
    const { rerender } = render(
      <Sheet id="s" mode="modal" open title="T" onClose={onClose} returnFocus={returnFocus}>
        <button type="button">Inside</button>
      </Sheet>,
    );
    rerender(
      <Sheet id="s" mode="modal" open={false} title="T" onClose={onClose} returnFocus={returnFocus}>
        <button type="button">Inside</button>
      </Sheet>,
    );
    expect(tab).toHaveFocus();
  });
});

// The Half height (design §3, `plain` mode; F45): not a dialog — a `region` named by its
// title, no scrim, no trap, no `aria-modal` — so the canvas above it stays reachable by
// Tab and by pointer; Escape does nothing to it (the canvas may be using the key), the
// header's Close and a drag down on the header do.
describe("Sheet (plain)", () => {
  function Half({ onClose }: { onClose: () => void }) {
    return (
      <>
        <button type="button">Canvas control</button>
        <Sheet id="sheet-half" mode="plain" open title="CATalyst AI Assistant" onClose={onClose}>
          <button type="button">Apply</button>
        </Sheet>
        <button type="button">Bar tab</button>
      </>
    );
  }

  it("is a region, not a dialog: no modal, no trap, and Tab walks out to the canvas and the bar", async () => {
    const user = userEvent.setup();
    render(<Half onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const region = screen.getByRole("region", { name: "CATalyst AI Assistant" });
    expect(region).not.toHaveAttribute("aria-modal");
    expect(region).toHaveAttribute("id", "sheet-half");
    // Nothing takes focus on open: the canvas control keeps it.
    screen.getByRole("button", { name: "Canvas control" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Apply" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Bar tab" })).toHaveFocus();
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Canvas control" })).toHaveFocus();
  });

  it("closes from its Close, not from Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Half onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when its header is dragged down", () => {
    const onClose = vi.fn();
    render(<Half onClose={onClose} />);
    const heading = screen.getByRole("heading", { level: 2, name: "CATalyst AI Assistant" });
    const header = heading.parentElement as HTMLElement;
    fireEvent.pointerDown(header, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(header, { clientY: 120, pointerId: 1 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerMove(header, { clientY: 160, pointerId: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
