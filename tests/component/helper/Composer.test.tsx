import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "@/ui/helper/Composer";

// T036 brief → "Tests first": Enter sends, Shift+Enter starts a new line. Built on the
// shared `Textarea`, so the only behaviour this file owns is the keyboard rule.

describe("Composer", () => {
  it("sends the trimmed text on Enter and clears the box", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);
    const box = screen.getByPlaceholderText("Ask for a change…");
    await user.type(box, "Warm it up{Enter}");
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Warm it up");
    expect(box).toHaveValue("");
  });

  it("Shift+Enter starts a new line instead of sending", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);
    const box = screen.getByPlaceholderText("Ask for a change…");
    await user.type(box, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue("Line one\nLine two");
  });

  it("does not send empty or whitespace-only text", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);
    const box = screen.getByPlaceholderText("Ask for a change…");
    await user.type(box, "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("is disabled while locked or already working", () => {
    render(<Composer disabled onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText("Ask for a change…")).toBeDisabled();
  });

  // F25 review, finding 3: disabling the box for the turn drops focus to `<body>`, so a
  // keyboard volunteer would have to Shift+Tab back past the chips to ask again. When the
  // turn ends, the box takes focus back — only if nothing else claimed it meanwhile.
  it("takes focus back when the turn ends, if the send left focus on the body", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Composer disabled={false} onSend={vi.fn()} />);
    const box = screen.getByPlaceholderText("Ask for a change…");
    await user.type(box, "Warm it up{Enter}");
    // A browser drops focus from a field the moment it is disabled; jsdom does not, so
    // the drop is made explicit here — the same `<body>` the review measured live.
    box.blur();
    rerender(<Composer disabled onSend={vi.fn()} />);
    expect(box).toBeDisabled();
    expect(document.body).toHaveFocus();
    rerender(<Composer disabled={false} onSend={vi.fn()} />);
    expect(box).toHaveFocus();
  });

  // F34 review, finding 1: on the phone the page itself scrolls, and a plain `focus()` on
  // the box at turn end snapped the window from the last followed block up to the
  // composer, before the overview glide. The focus comes back without moving the page.
  it("takes focus back without scrolling the page (preventScroll)", () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    const { rerender } = render(<Composer disabled onSend={vi.fn()} />);
    expect(document.body).toHaveFocus();
    rerender(<Composer disabled={false} onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText("Ask for a change…")).toHaveFocus();
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    focusSpy.mockRestore();
  });

  it("leaves focus alone when the turn ends with focus somewhere else", () => {
    const { rerender } = render(
      <>
        <button type="button">Elsewhere</button>
        <Composer disabled onSend={vi.fn()} />
      </>,
    );
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    rerender(
      <>
        <button type="button">Elsewhere</button>
        <Composer disabled={false} onSend={vi.fn()} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
  });
});
