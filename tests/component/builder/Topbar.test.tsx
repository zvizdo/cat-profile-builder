import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { saveLine, Topbar } from "@/ui/builder/Topbar";

// The builder's bar (hi-fi 3a; CONTENT.md → Chrome): the mark, the way back, the name, the save
// line as a live region, Undo and Redo as real buttons, Preview as a link, and whatever
// the shell hands in as Publish rendered where it belongs.

const NOW = "2026-09-11T12:00:10.000Z";

function renderBar(props: Partial<Parameters<typeof Topbar>[0]> = {}) {
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  render(
    <Topbar
      profileId="abcdefgh"
      name="Charlotte"
      save={{ status: "saved", savedAt: "2026-09-11T12:00:08.000Z" }}
      now={NOW}
      canUndo
      canRedo={false}
      onUndo={onUndo}
      onRedo={onRedo}
      publish={<button type="button">Publish</button>}
      {...props}
    />,
  );
  return { onUndo, onRedo };
}

describe("saveLine", () => {
  const now = new Date(NOW);
  it("says how long ago the draft was saved, in seconds", () => {
    expect(saveLine({ status: "saved", savedAt: "2026-09-11T12:00:08.000Z" }, now)).toBe(
      "Draft saved 2s ago",
    );
    expect(saveLine({ status: "saved", savedAt: NOW }, now)).toBe("Draft saved just now");
    expect(saveLine({ status: "saved", savedAt: "2026-09-11T11:55:00.000Z" }, now)).toBe(
      "Draft saved 5m ago",
    );
  });

  it("says it is saving while dirty or in flight, and the sentence when a save failed", () => {
    expect(saveLine({ status: "dirty" }, now)).toBe("Saving draft");
    expect(saveLine({ status: "saving" }, now)).toBe("Saving draft");
    expect(saveLine({ status: "error", message: "The name is too long." }, now)).toBe(
      "The name is too long.",
    );
  });
});

describe("Topbar", () => {
  it("has the mark, the way back, the name as the heading, and the save line as a status", () => {
    renderBar();
    expect(screen.getByRole("presentation")).toHaveAttribute("src", "/logo.png");
    expect(screen.getByRole("link", { name: "All cats /" })).toHaveAttribute("href", "/builder");
    expect(screen.getByRole("heading", { level: 1, name: "Charlotte" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Draft saved 2s ago");
  });

  it("draws the bar as the comp does: a reading breadcrumb, a 6px dot, bordered Undo/Redo, a dense Preview", () => {
    renderBar();
    // `All cats /` is sentence case in the mono reading voice, not the uppercase label.
    const crumb = screen.getByText("All cats /");
    expect(crumb).toHaveClass("tracking-normal");
    expect(crumb).not.toHaveClass("uppercase");
    // The save dot is 6px (DESIGN.md §4).
    const dot = screen.getByRole("status").querySelector("[aria-hidden]");
    expect(dot).toHaveClass("size-6");
    expect(dot).not.toHaveClass("size-8");
    // Undo and Redo are bordered mini-buttons, 6px apart, still 44px.
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo).toHaveClass("border", "border-line-field", "size-44");
    expect(redo).toHaveClass("border", "border-line-field", "size-44");
    expect(undo.parentElement).toHaveClass("gap-6");
    // Preview is the dense chrome size.
    const preview = screen.getByRole("link", { name: "Preview" });
    expect(preview).toHaveClass("text-ui-dense", "min-h-44");
    expect(preview).not.toHaveClass("text-ui");
  });

  it("calls a cat with no name Unnamed cat", () => {
    renderBar({ name: "" });
    expect(screen.getByRole("heading", { level: 1, name: "Unnamed cat" })).toBeInTheDocument();
  });

  it("wires Undo and Redo; the one with nothing to do is aria-disabled, focusable and inert", () => {
    const { onUndo, onRedo } = renderBar();
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo).toHaveAttribute("aria-disabled", "false");
    expect(redo).toHaveAttribute("aria-disabled", "true");
    expect(redo).not.toBeDisabled();
    redo.focus();
    expect(redo).toHaveFocus();
    redo.click();
    undo.click();
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).not.toHaveBeenCalled();
  });

  it("Undo and Redo are reached by Tab and fire from Enter and Space (keyboard path)", async () => {
    const user = userEvent.setup();
    const { onUndo, onRedo } = renderBar({ canRedo: true });
    await user.tab();
    expect(screen.getByRole("link", { name: "All cats /" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onUndo).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole("button", { name: "Redo" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onRedo).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole("link", { name: "Preview" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Publish" })).toHaveFocus();
  });

  it("links Preview to the preview route and renders the Publish control it is handed", () => {
    renderBar();
    expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute(
      "href",
      "/builder/abcdefgh/preview",
    );
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
  });

  describe("the phone variant (F44; design 2026-09-13 §1)", () => {
    it("leads with the name, then ↶ ↷, Preview as an icon and Publish — no mark, no breadcrumb, no save words", () => {
      renderBar({ phone: true });
      expect(screen.queryByRole("link", { name: "All cats" })).toBeNull();
      expect(screen.queryByText("All cats /")).toBeNull();
      expect(screen.queryByRole("presentation")).toBeNull();
      expect(screen.getByRole("heading", { level: 1, name: "Charlotte" })).toHaveClass("truncate");
      expect(screen.getByRole("button", { name: "Undo" })).toHaveClass("size-44");
      expect(screen.getByRole("button", { name: "Redo" })).toHaveClass("size-44");
      const preview = screen.getByRole("link", { name: "Preview" });
      expect(preview).toHaveAttribute("href", "/builder/abcdefgh/preview");
      expect(preview.className).toMatch(/size-44/);
      expect(preview).not.toHaveTextContent("Preview");
      expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
      // The save state stays a status for the screen reader; its words are not drawn.
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent("Draft saved 2s ago");
      expect(status.querySelector(".sr-only")).toHaveTextContent("Draft saved 2s ago");
      // A draft keeps the 6px dot beside the name.
      expect(status.querySelector("[aria-hidden]")).toHaveClass("size-6");
    });

    it("gives the name the row's remaining width: every control a fixed 44px, the name flex-1 and truncating", () => {
      renderBar({ phone: true, name: "Mabel Anders" });
      const name = screen.getByRole("heading", { level: 1, name: "Mabel Anders" });
      expect(name).toHaveClass("flex-1", "min-w-0", "truncate");
      for (const control of [
        screen.getByRole("button", { name: "Undo" }),
        screen.getByRole("button", { name: "Redo" }),
        screen.getByRole("link", { name: "Preview" }),
      ]) {
        expect(control.className, control.getAttribute("aria-label") ?? "").toMatch(
          /(^|\s)(size-44|min-w-44)(\s|$)/,
        );
        expect(control.className).toMatch(/shrink-0/);
      }
      // No breadcrumb and no save words compete with the name for the row.
      expect(screen.queryByText("All cats /")).toBeNull();
      expect(screen.getByRole("banner").firstElementChild).toBe(name);
    });

    it("drops the dot once the Publish control carries its own (quiet), and keeps the sentence", () => {
      renderBar({ phone: true, quietSave: true });
      const status = screen.getByRole("status");
      expect(status.querySelector("[aria-hidden]")).toBeNull();
      expect(status).toHaveTextContent("Draft saved 2s ago");
    });

    it("walks Undo → Redo → Preview → Publish by Tab (keyboard path)", async () => {
      const user = userEvent.setup();
      renderBar({ phone: true, canRedo: true });
      await user.tab();
      expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole("button", { name: "Redo" })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole("link", { name: "Preview" })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole("button", { name: "Publish" })).toHaveFocus();
    });
  });
});
