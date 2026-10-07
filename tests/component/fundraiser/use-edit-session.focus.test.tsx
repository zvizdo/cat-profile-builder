import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GRACE_MS, IDLE_MS } from "@/core/fundraiser/edit-session";
import { useEditSession } from "@/ui/fundraiser/use-edit-session";
import {
  CURRENT,
  noop,
  Harness,
  thermometer,
  headlineButton,
  amountsBlock,
  done,
  outside,
  raisedField,
  goalField,
  fieldsOpen,
  headlineOpen,
  advance,
  nextFrame,
  focus,
  blur,
  type,
  over,
  out,
  pointerDown,
  openByClick,
  installFakeClock,
} from "./edit-session-harness";

// The other half of the hook's tests: the focus rules that keep a typed entry safe on Safari,
// presses outside the region, Escape and where focus goes, confirm, and full screen (FR-012).

installFakeClock();

describe("leaving the region by focus", () => {
  it("cancels at once when focus goes to an element outside the region", () => {
    openByClick();
    focus(raisedField());
    focus(outside());
    expect(fieldsOpen()).toBe(false);
  });

  it("does not cancel when focus moves from one field to the other", () => {
    openByClick();
    focus(raisedField());
    focus(goalField());
    nextFrame();
    expect(fieldsOpen()).toBe(true);
  });

  it("does not cancel when focus moves from a field to Done", () => {
    openByClick();
    focus(raisedField());
    focus(done());
    nextFrame();
    expect(fieldsOpen()).toBe(true);
  });

  it("keeps an open headline when focus moves from its field to Done", () => {
    render(<Harness />);
    fireEvent.click(headlineButton(), { detail: 1 });
    focus(screen.getByRole("textbox", { name: "Headline" }));
    focus(done());
    nextFrame();
    expect(headlineOpen()).toBe(true);
  });

  it("cancels an open headline when focus moves from its field to the page", () => {
    render(<Harness />);
    fireEvent.click(headlineButton(), { detail: 1 });
    focus(screen.getByRole("textbox", { name: "Headline" }));
    focus(outside());
    expect(headlineOpen()).toBe(false);
  });

  it("cancels when focus leaves Done for the page, as Tab does", () => {
    openByClick();
    focus(done());
    focus(outside());
    expect(fieldsOpen()).toBe(false);
  });

  it("waits one frame when the browser names no new target, then cancels if focus is outside", () => {
    openByClick();
    focus(raisedField());
    blur(raisedField());
    expect(fieldsOpen()).toBe(true);
    nextFrame();
    expect(fieldsOpen()).toBe(false);
  });

  it("does not cancel when the page loses focus but the field still holds it", () => {
    openByClick();
    focus(raisedField());
    fireEvent.focusOut(raisedField(), { relatedTarget: null });
    nextFrame();
    expect(fieldsOpen()).toBe(true);
  });

  it("still commits when focus left with no target and then Done is clicked (the Safari path)", () => {
    const onCommit = vi.fn();
    openByClick(onCommit);
    focus(raisedField());
    type(raisedField(), "$7,200");
    pointerDown(done());
    blur(raisedField());
    nextFrame();
    nextFrame();
    expect(fieldsOpen()).toBe(true);
    fireEvent.click(done(), { detail: 1 });
    expect(onCommit).toHaveBeenCalledWith({ raisedCents: 720_000 });
    expect(fieldsOpen()).toBe(false);
  });

  it("still commits when the press on Done comes after the focus left, in the same frame", () => {
    const onCommit = vi.fn();
    openByClick(onCommit);
    focus(raisedField());
    type(raisedField(), "$7,200");
    blur(raisedField());
    pointerDown(done());
    nextFrame();
    fireEvent.click(done(), { detail: 1 });
    expect(onCommit).toHaveBeenCalledWith({ raisedCents: 720_000 });
  });

  it("stops treating a press as under way once the frame has passed", () => {
    openByClick();
    focus(raisedField());
    pointerDown(done());
    nextFrame();
    blur(raisedField());
    nextFrame();
    expect(fieldsOpen()).toBe(false);
  });

  it("does not carry a press from one session into the next", () => {
    openByClick();
    pointerDown(done());
    fireEvent.click(done(), { detail: 1 });
    fireEvent.click(thermometer(), { detail: 1 });
    focus(raisedField());
    blur(raisedField());
    nextFrame();
    expect(fieldsOpen()).toBe(false);
  });

  it("keeps the press on Done from moving focus off the field", () => {
    openByClick();
    focus(raisedField());
    expect(fireEvent.pointerDown(done(), { pointerType: "mouse" })).toBe(false);
    expect(fireEvent.mouseDown(done())).toBe(false);
  });
});

describe("pressing outside", () => {
  it("cancels when a press begins outside the region", () => {
    openByClick();
    pointerDown(outside());
    expect(fieldsOpen()).toBe(false);
  });

  it("cancels for a press on the stage's backdrop, and for a touch press", () => {
    openByClick();
    pointerDown(screen.getByTestId("backdrop"), "touch");
    expect(fieldsOpen()).toBe(false);
  });

  it("does not cancel for a press inside the region", () => {
    openByClick();
    pointerDown(raisedField());
    pointerDown(amountsBlock());
    pointerDown(done());
    expect(fieldsOpen()).toBe(true);
  });

  it("cancels an open headline for a press on the thermometer, which is outside it", () => {
    render(<Harness />);
    fireEvent.click(headlineButton(), { detail: 1 });
    pointerDown(thermometer());
    expect(headlineOpen()).toBe(false);
  });

  it("leaves no press or key listener on the document once the session is closed", () => {
    const live = new Map<string, number>();
    const count = (type: string, by: number): void =>
      void live.set(type, (live.get(type) ?? 0) + by);
    const add = vi
      .spyOn(document, "addEventListener")
      .mockImplementation((...args: Parameters<Document["addEventListener"]>) => {
        count(args[0], 1);
        Document.prototype.addEventListener.apply(document, args);
      });
    const remove = vi
      .spyOn(document, "removeEventListener")
      .mockImplementation((...args: Parameters<Document["removeEventListener"]>) => {
        count(args[0], -1);
        Document.prototype.removeEventListener.apply(document, args);
      });
    openByClick();
    expect(live.get("pointerdown")).toBe(1);
    expect(live.get("keydown")).toBe(1);
    pointerDown(outside());
    expect(live.get("pointerdown")).toBe(0);
    expect(live.get("keydown")).toBe(0);
    add.mockRestore();
    remove.mockRestore();
  });
});

describe("Escape and where focus goes", () => {
  it("cancels, drops the draft, and returns focus to the thermometer without reopening", () => {
    const onCommit = vi.fn();
    openByClick(onCommit);
    focus(raisedField());
    type(raisedField(), "$9,999");
    fireEvent.keyDown(raisedField(), { key: "Escape" });
    expect(fieldsOpen()).toBe(false);
    expect(thermometer()).toHaveFocus();
    nextFrame();
    expect(fieldsOpen()).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("returns focus to the headline button after an Escape in the headline", () => {
    render(<Harness />);
    fireEvent.click(headlineButton(), { detail: 1 });
    focus(screen.getByRole("textbox", { name: "Headline" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Headline" }), { key: "Escape" });
    expect(headlineOpen()).toBe(false);
    expect(headlineButton()).toHaveFocus();
  });

  it("leaves an Escape that belongs to an input method alone, so the draft survives", () => {
    openByClick();
    focus(raisedField());
    type(raisedField(), "$7,200");
    fireEvent.keyDown(raisedField(), { key: "Escape", isComposing: true });
    fireEvent.keyDown(raisedField(), { key: "Escape", keyCode: 229 });
    fireEvent.keyDown(done(), { key: "Escape", isComposing: true });
    expect(fieldsOpen()).toBe(true);
    expect(raisedField()).toHaveValue("$7,200");
    fireEvent.keyDown(raisedField(), { key: "Escape" });
    expect(fieldsOpen()).toBe(false);
  });

  it("cancels a hover preview on Escape even though focus is on the page, not in the region", () => {
    render(<Harness />);
    over(thermometer());
    expect(fieldsOpen()).toBe(true);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(fieldsOpen()).toBe(false);
  });

  it("does nothing on Escape while no session is open", () => {
    render(<Harness />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(thermometer()).not.toHaveFocus();
  });

  it("cancels on Escape pressed on a control that is not a field, such as Done", () => {
    openByClick();
    focus(done());
    fireEvent.keyDown(done(), { key: "Escape" });
    expect(fieldsOpen()).toBe(false);
    expect(thermometer()).toHaveFocus();
  });

  it("lets the next real focus on the thermometer open it once a frame has passed", () => {
    openByClick();
    focus(raisedField());
    fireEvent.keyDown(raisedField(), { key: "Escape" });
    nextFrame();
    blur(thermometer());
    focus(thermometer());
    expect(fieldsOpen()).toBe(true);
  });

  it("does not swallow the next real Tab-in when the opener already held focus (stale flag)", () => {
    render(<Harness />);
    focus(thermometer());
    expect(fieldsOpen()).toBe(true);
    fireEvent.keyDown(thermometer(), { key: "Escape" });
    expect(fieldsOpen()).toBe(false);
    expect(thermometer()).toHaveFocus();
    blur(thermometer());
    focus(thermometer());
    expect(fieldsOpen()).toBe(true);
  });

  it("does not return focus after a press outside", () => {
    openByClick();
    focus(raisedField());
    pointerDown(outside());
    expect(thermometer()).not.toHaveFocus();
  });
});

describe("confirming", () => {
  it("commits the changed values on Enter in a field and returns focus to the opener", () => {
    const onCommit = vi.fn();
    openByClick(onCommit);
    focus(raisedField());
    type(raisedField(), "$7,200");
    fireEvent.keyDown(raisedField(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ raisedCents: 720_000 });
    expect(fieldsOpen()).toBe(false);
    expect(thermometer()).toHaveFocus();
    nextFrame();
    expect(fieldsOpen()).toBe(false);
  });

  it("commits on a Done click, and leaves focus alone when it was a mouse click", () => {
    const onCommit = vi.fn();
    openByClick(onCommit);
    focus(raisedField());
    type(raisedField(), "$7,200");
    fireEvent.click(done(), { detail: 1 });
    expect(onCommit).toHaveBeenCalledWith({ raisedCents: 720_000 });
    expect(thermometer()).not.toHaveFocus();
  });

  it("returns focus to the opener when Done was pressed by keyboard", () => {
    const onCommit = vi.fn();
    openByClick(onCommit);
    type(goalField(), "$12,000");
    focus(done());
    fireEvent.click(done(), { detail: 0 });
    expect(onCommit).toHaveBeenCalledWith({ goalCents: 1_200_000 });
    expect(thermometer()).toHaveFocus();
  });

  it("commits the headline", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.click(headlineButton(), { detail: 1 });
    const box = screen.getByRole("textbox", { name: "Headline" });
    type(box, "Mochi is home");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith({ headline: "Mochi is home" });
    expect(headlineButton()).toHaveFocus();
  });

  it("closes without a commit when nothing changed", () => {
    const onCommit = vi.fn();
    openByClick(onCommit);
    fireEvent.click(done(), { detail: 1 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(fieldsOpen()).toBe(false);
  });

  it("stays open, commits nothing and keeps focus where it is when the entry is refused", () => {
    const onCommit = vi.fn();
    openByClick(onCommit);
    focus(raisedField());
    type(raisedField(), "lots");
    fireEvent.keyDown(raisedField(), { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(fieldsOpen()).toBe(true);
    expect(raisedField()).toHaveFocus();
  });
});

describe("full screen (enabled is false)", () => {
  it("ignores hover, focus, click and tap on every opener (FR-012)", () => {
    const kinds: string[] = [];
    const onKind = (kind: string): void => void kinds.push(kind);
    render(<Harness enabled={false} onKind={onKind} />);
    over(thermometer());
    over(amountsBlock(), "pen");
    out(amountsBlock(), "pen");
    fireEvent.click(thermometer(), { detail: 1 });
    focus(thermometer());
    fireEvent.click(headlineButton(), { detail: 1 });
    expect(vi.getTimerCount()).toBe(0);
    advance(GRACE_MS * 10);
    expect(fieldsOpen()).toBe(false);
    expect(headlineOpen()).toBe(false);
    expect(kinds).toEqual(["idle"]);
  });

  it("clears an open session, and every timer, when enabled goes from true to false", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<Harness onCommit={onCommit} />);
    over(thermometer());
    out(thermometer());
    focus(raisedField());
    blur(raisedField());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    rerender(<Harness onCommit={onCommit} enabled={false} />);
    expect(fieldsOpen()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    advance(IDLE_MS);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("starts clean when full screen ends: nothing stale comes back", () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(thermometer(), { detail: 1 });
    rerender(<Harness enabled={false} />);
    rerender(<Harness enabled />);
    expect(fieldsOpen()).toBe(false);
    // The pointer may be resting where the figures are: only a real move makes it a hover.
    over(thermometer());
    expect(fieldsOpen()).toBe(false);
    fireEvent.pointerMove(screen.getByTestId("backdrop"), { pointerType: "mouse" });
    over(thermometer());
    expect(fieldsOpen()).toBe(true);
  });

  it("reports an idle session in the very render where enabled turns false", () => {
    const seen: string[] = [];
    function Probe({ enabled }: { enabled: boolean }) {
      const session = useEditSession(CURRENT, noop, enabled);
      seen.push(session.state.kind);
      return <button {...session.amountsButton}>open</button>;
    }
    const { rerender } = render(<Probe enabled />);
    fireEvent.click(screen.getByRole("button"), { detail: 1 });
    expect(seen.at(-1)).toBe("amounts");
    const before = seen.length;
    rerender(<Probe enabled={false} />);
    // The render that rerender caused, before any effect has run, must already say idle.
    expect(seen[before]).toBe("idle");
    expect(seen.slice(before)).not.toContain("amounts");
  });
});
