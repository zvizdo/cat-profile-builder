import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDialogFocus, useDialogKeys } from "@/ui/shared/dialog-focus";

// The keyboard and focus contract every modal surface shares (design 2026-09-13 §3):
// extracted from `Modal.tsx` so the phone's Full sheet and the centred modal cannot
// drift. Tab wraps inside the panel, Escape runs the close action wherever focus is,
// focus lands on the first control as the surface opens and returns to the opener
// when it closes.

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useDialogFocus(open, first);
  useDialogKeys(open, onClose, panel);
  if (!open) return null;
  return (
    <div ref={panel} role="dialog" aria-label="Panel">
      <button ref={first} type="button">
        First
      </button>
      <button type="button">Last</button>
    </div>
  );
}

function Page({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <button type="button">Opener</button>
      <Harness open={open} onClose={onClose} />
    </>
  );
}

describe("dialog-focus", () => {
  it("lands focus on the first control as it opens and returns it to the opener on close", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Page open={false} onClose={onClose} />);
    screen.getByRole("button", { name: "Opener" }).focus();
    rerender(<Page open onClose={onClose} />);
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    rerender(<Page open={false} onClose={onClose} />);
    expect(screen.getByRole("button", { name: "Opener" })).toHaveFocus();
  });

  it("wraps Tab and Shift+Tab inside the panel", async () => {
    const user = userEvent.setup();
    render(<Page open onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
  });

  it("pulls focus that has left the panel back in on the next Tab", async () => {
    const user = userEvent.setup();
    render(<Page open onClose={vi.fn()} />);
    screen.getByRole("button", { name: "Opener" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("Escape runs the close action wherever focus is, and only while open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<Page open onClose={onClose} />);
    screen.getByRole("button", { name: "Opener" }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Page open={false} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // F45: surfaces stack (a question over the phone's Media sheet, the focal picker over
  // it) — only the one on top answers a key, whatever order they re-render in.
  it("with two open, only the one opened last answers Escape and traps Tab; the one under it takes over when it closes", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    const inner = vi.fn();
    function Stack({ second, outerClose }: { second: boolean; outerClose: () => void }) {
      return (
        <>
          <Harness open onClose={outerClose} />
          <Harness open={second} onClose={inner} />
        </>
      );
    }
    const { rerender } = render(<Stack second outerClose={outer} />);
    // The outer re-renders with a fresh close callback: its place in the stack holds.
    rerender(<Stack second outerClose={() => outer()} />);
    const [, innerFirst] = screen.getAllByRole("button", { name: "First" });
    innerFirst?.focus();
    await user.tab({ shift: true });
    expect(screen.getAllByRole("button", { name: "Last" })[1]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();

    rerender(<Stack second={false} outerClose={outer} />);
    await user.keyboard("{Escape}");
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  // F45 review, findings 1 and 3: a surface that is not a dialog — a selected media
  // card, the tablet's overlay column — takes its place on the stack without a Tab
  // trap, and an entry that answers `false` to Escape ("not mine": focus is elsewhere)
  // lets the surface under it answer instead.
  it("a trap-less entry answers Escape without trapping Tab, and one that declines passes the key down", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    const soft = vi.fn<() => boolean>();
    function Soft({ onEscape }: { onEscape: () => boolean }) {
      const panel = useRef<HTMLDivElement>(null);
      useDialogKeys(true, onEscape, panel, { trap: false });
      return (
        <div ref={panel}>
          <button type="button">Card</button>
        </div>
      );
    }
    render(
      <>
        <button type="button">Outside</button>
        <Harness open onClose={outer} />
        <Soft onEscape={soft} />
      </>,
    );
    // No trap: Tab from the card leaves it.
    screen.getByRole("button", { name: "Card" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Card" })).not.toHaveFocus();
    // The card declines: the dialog under it closes.
    soft.mockReturnValue(false);
    await user.keyboard("{Escape}");
    expect(soft).toHaveBeenCalledTimes(1);
    expect(outer).toHaveBeenCalledTimes(1);
    // The card takes it: the dialog is untouched.
    soft.mockReturnValue(true);
    await user.keyboard("{Escape}");
    expect(soft).toHaveBeenCalledTimes(2);
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
