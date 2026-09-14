import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomBar } from "@/ui/builder/phone/BottomBar";

// The phone's bottom bar (design 2026-09-13 §1; CONTENT.md → Builder, Bottom bar): two
// equal tabs, `Media` and `CATalyst`, that open the drawers — buttons with
// `aria-expanded`, never a tablist — and the 6px blue disc on CATalyst while a card
// waits or a turn ended unseen, breathing while the helper works.

function renderBar(props: Partial<Parameters<typeof BottomBar>[0]> = {}) {
  const onOpen = vi.fn();
  render(
    <BottomBar
      open={null}
      onOpen={onOpen}
      signal="none"
      sheetIds={{ media: "sheet-media", catalyst: "sheet-catalyst" }}
      {...props}
    />,
  );
  return { onOpen };
}

describe("BottomBar", () => {
  it("has the two tabs as buttons, both closed, each 44px tall", () => {
    renderBar();
    const media = screen.getByRole("button", { name: "Media" });
    const catalyst = screen.getByRole("button", { name: "CATalyst" });
    expect(media).toHaveAttribute("aria-expanded", "false");
    expect(catalyst).toHaveAttribute("aria-expanded", "false");
    expect(media).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("tablist")).toBeNull();
    for (const tab of [media, catalyst]) expect(tab.className).toMatch(/min-h-44/);
  });

  it("marks the open drawer's tab expanded and points it at the sheet", () => {
    renderBar({ open: "media" });
    expect(screen.getByRole("button", { name: "Media" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Media" })).toHaveAttribute(
      "aria-controls",
      "sheet-media",
    );
    expect(screen.getByRole("button", { name: "CATalyst" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("reports which tab was pressed", async () => {
    const user = userEvent.setup();
    const { onOpen } = renderBar();
    await user.click(screen.getByRole("button", { name: "CATalyst" }));
    expect(onOpen).toHaveBeenLastCalledWith("catalyst");
    await user.click(screen.getByRole("button", { name: "Media" }));
    expect(onOpen).toHaveBeenLastCalledWith("media");
  });

  it("Tab reaches Media then CATalyst; Enter and Space open them (keyboard path)", async () => {
    const user = userEvent.setup();
    const { onOpen } = renderBar();
    await user.tab();
    expect(screen.getByRole("button", { name: "Media" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenLastCalledWith("media");
    await user.tab();
    expect(screen.getByRole("button", { name: "CATalyst" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onOpen).toHaveBeenLastCalledWith("catalyst");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("shows no disc while nothing waits, a still disc while something does, a breathing one while working", () => {
    const { rerender } = render(
      <BottomBar
        open={null}
        onOpen={vi.fn()}
        signal="none"
        sheetIds={{ media: "m", catalyst: "c" }}
      />,
    );
    const catalyst = () => screen.getByRole("button", { name: "CATalyst" });
    expect(catalyst().querySelector("[data-disc]")).toBeNull();
    rerender(
      <BottomBar
        open={null}
        onOpen={vi.fn()}
        signal="waiting"
        sheetIds={{ media: "m", catalyst: "c" }}
      />,
    );
    const still = catalyst().querySelector("[data-disc]");
    expect(still).toHaveClass("bg-blue");
    expect(still).not.toHaveClass("dot-breathe");
    expect(still).toHaveAttribute("aria-hidden", "true");
    rerender(
      <BottomBar
        open={null}
        onOpen={vi.fn()}
        signal="working"
        sheetIds={{ media: "m", catalyst: "c" }}
      />,
    );
    expect(catalyst().querySelector("[data-disc]")).toHaveClass("dot-breathe");
    // The tab's name never changes with the disc: the topbar announces the work.
    expect(catalyst()).toHaveAccessibleName("CATalyst");
  });
});
