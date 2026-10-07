import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GRACE_MS, IDLE_MS } from "@/core/fundraiser/edit-session";
import {
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

// The hook that turns DOM events into the events of the edit-session state machine (T007) and
// runs its timers. The rules are tested in core; these tests cover the translation: hover and its
// grace time, touch, the controls that open a session, the idle clock, and that no timer outlives
// a session. Focus, presses, Escape, confirm and full screen are in use-edit-session.focus.test.tsx.

installFakeClock();

describe("hover opens a preview", () => {
  it("opens the fields, not sticky, when a mouse enters the thermometer", () => {
    const sticky = vi.fn();
    render(<Harness onSticky={sticky} />);
    expect(fieldsOpen()).toBe(false);
    over(thermometer());
    expect(fieldsOpen()).toBe(true);
    expect(sticky).toHaveBeenLastCalledWith(false);
  });

  it("opens the same way when the mouse enters the amount block", () => {
    render(<Harness />);
    over(amountsBlock());
    expect(fieldsOpen()).toBe(true);
  });

  it("treats a pen like a mouse", () => {
    render(<Harness />);
    over(thermometer(), "pen");
    expect(fieldsOpen()).toBe(true);
  });

  it("opens when the pointer enters a descendant of the thermometer or the amount block", () => {
    render(<Harness />);
    over(screen.getByTestId("thermo-glyph"));
    expect(fieldsOpen()).toBe(true);
    out(screen.getByTestId("thermo-glyph"));
    advance(GRACE_MS);
    expect(fieldsOpen()).toBe(false);
    over(screen.getByTestId("raised-text"));
    expect(fieldsOpen()).toBe(true);
  });

  it("closes a preview when the pointer leaves a field inside the amount block", () => {
    render(<Harness />);
    over(thermometer());
    out(raisedField());
    advance(GRACE_MS);
    expect(fieldsOpen()).toBe(false);
  });

  it("keeps a preview open when the pointer moves between children of the figures", () => {
    render(<Harness />);
    over(thermometer());
    out(thermometer());
    over(amountsBlock());
    out(amountsBlock());
    over(raisedField());
    out(raisedField());
    over(goalField());
    advance(GRACE_MS * 3);
    expect(fieldsOpen()).toBe(true);
  });

  it("does nothing for a pass over something that is not the figures", () => {
    render(<Harness />);
    over(screen.getByTestId("backdrop"));
    expect(fieldsOpen()).toBe(false);
  });

  it("closes a preview when the pointer has been away for the grace time", () => {
    render(<Harness />);
    over(thermometer());
    out(thermometer());
    advance(GRACE_MS - 1);
    expect(fieldsOpen()).toBe(true);
    advance(1);
    expect(fieldsOpen()).toBe(false);
  });

  it("keeps the preview when the pointer comes back to the other figures element in time", () => {
    render(<Harness />);
    over(thermometer());
    out(thermometer());
    advance(GRACE_MS - 10);
    over(amountsBlock());
    advance(GRACE_MS * 3);
    expect(fieldsOpen()).toBe(true);
  });

  it("keeps a session open that a keystroke made sticky, after the pointer leaves", () => {
    render(<Harness />);
    over(thermometer());
    type(raisedField(), "$7,200");
    out(amountsBlock());
    advance(GRACE_MS * 10);
    expect(fieldsOpen()).toBe(true);
  });

  it("keeps a session open that a field taking focus made sticky", () => {
    render(<Harness />);
    over(thermometer());
    focus(raisedField());
    out(amountsBlock());
    advance(GRACE_MS * 10);
    expect(fieldsOpen()).toBe(true);
  });

  it("does not let a pass-by steal an open headline edit", () => {
    render(<Harness />);
    fireEvent.click(headlineButton(), { detail: 1 });
    over(thermometer());
    expect(headlineOpen()).toBe(true);
    expect(fieldsOpen()).toBe(false);
  });
});

describe("touch", () => {
  it("ignores touch pointer events: no open on enter, and nothing to close on leave", () => {
    render(<Harness />);
    over(thermometer(), "touch");
    expect(fieldsOpen()).toBe(false);
    over(thermometer());
    out(thermometer(), "touch");
    advance(GRACE_MS * 3);
    expect(fieldsOpen()).toBe(true);
  });

  it("opens a sticky session on a tap without ever showing a preview or closing it", () => {
    const seen: string[] = [];
    const onSeen = (label: string): void => void seen.push(label);
    render(<Harness onSeen={onSeen} />);
    over(thermometer(), "touch");
    pointerDown(thermometer(), "touch");
    fireEvent.pointerUp(thermometer(), { pointerType: "touch" });
    out(thermometer(), "touch");
    fireEvent.click(thermometer(), { detail: 1 });
    advance(GRACE_MS * 10);
    // A touch that was not ignored would show a preview first: idle, preview, sticky.
    expect(seen).toEqual(["idle", "amounts:sticky"]);
    expect(fieldsOpen()).toBe(true);
  });

  it("opens the headline on a tap", () => {
    render(<Harness />);
    fireEvent.click(headlineButton(), { detail: 1 });
    expect(headlineOpen()).toBe(true);
  });
});

describe("opening by the controls", () => {
  it("opens a sticky session when the thermometer button takes focus", () => {
    const sticky = vi.fn();
    render(<Harness onSticky={sticky} />);
    focus(thermometer());
    expect(fieldsOpen()).toBe(true);
    expect(sticky).toHaveBeenLastCalledWith(true);
    out(thermometer());
    advance(GRACE_MS * 10);
    expect(fieldsOpen()).toBe(true);
  });

  it("makes a hover preview sticky when the thermometer is clicked", () => {
    const sticky = vi.fn();
    render(<Harness onSticky={sticky} />);
    over(thermometer());
    fireEvent.click(thermometer(), { detail: 1 });
    expect(sticky).toHaveBeenLastCalledWith(true);
  });

  it("switches from the amounts to the headline and back, dropping the first draft", () => {
    render(<Harness />);
    fireEvent.click(thermometer(), { detail: 1 });
    type(raisedField(), "$9");
    fireEvent.click(headlineButton(), { detail: 1 });
    expect(fieldsOpen()).toBe(false);
    expect(headlineOpen()).toBe(true);
    fireEvent.click(thermometer(), { detail: 1 });
    expect(raisedField()).toHaveValue("$6,500");
  });
});

describe("the idle timer", () => {
  it("cancels a session after a minute with no input", () => {
    openByClick();
    advance(IDLE_MS - 1);
    expect(fieldsOpen()).toBe(true);
    advance(1);
    expect(fieldsOpen()).toBe(false);
  });

  it("restarts on a keystroke", () => {
    openByClick();
    advance(IDLE_MS - 1000);
    type(raisedField(), "$7,000");
    advance(IDLE_MS - 1);
    expect(fieldsOpen()).toBe(true);
    advance(1);
    expect(fieldsOpen()).toBe(false);
  });

  it("restarts when focus moves between the fields", () => {
    openByClick();
    focus(raisedField());
    advance(IDLE_MS - 1000);
    focus(goalField());
    advance(IDLE_MS - 1);
    expect(fieldsOpen()).toBe(true);
    advance(1);
    expect(fieldsOpen()).toBe(false);
  });

  it("restarts when the pointer moves over the region, and not when it moves elsewhere", () => {
    openByClick();
    advance(IDLE_MS - 1000);
    fireEvent.pointerMove(amountsBlock(), { pointerType: "mouse" });
    advance(IDLE_MS - 1);
    expect(fieldsOpen()).toBe(true);
    fireEvent.pointerMove(screen.getByTestId("backdrop"), { pointerType: "mouse" });
    advance(1);
    expect(fieldsOpen()).toBe(false);
  });

  it("restarts on a key pressed anywhere in the region", () => {
    openByClick();
    advance(IDLE_MS - 1000);
    fireEvent.keyDown(done(), { key: "ArrowLeft" });
    advance(IDLE_MS - 1);
    expect(fieldsOpen()).toBe(true);
  });
});

describe("timers are always cleaned up", () => {
  it("leaves none running after a session ends by idle, Escape, confirm or a press outside", () => {
    openByClick();
    expect(vi.getTimerCount()).toBe(1);
    advance(IDLE_MS);
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(thermometer(), { detail: 1 });
    focus(raisedField());
    fireEvent.keyDown(raisedField(), { key: "Escape" });
    nextFrame();
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(thermometer(), { detail: 1 });
    fireEvent.click(done(), { detail: 1 });
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(thermometer(), { detail: 1 });
    pointerDown(outside());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves none running after unmount, with a grace timer, a focus check and a press pending", () => {
    const { unmount } = render(<Harness />);
    over(thermometer());
    out(thermometer());
    focus(raisedField());
    pointerDown(done());
    blur(raisedField());
    expect(vi.getTimerCount()).toBeGreaterThan(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves none running after unmount with a returned-focus flag pending", () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(thermometer(), { detail: 1 });
    focus(raisedField());
    fireEvent.keyDown(raisedField(), { key: "Escape" });
    advance(0);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not leave the idle clock running for a preview that closed by itself", () => {
    render(<Harness />);
    over(thermometer());
    out(thermometer());
    advance(GRACE_MS);
    expect(fieldsOpen()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("a pointer resting where the fields were", () => {
  // Taking the fields out of the page makes the browser send pointerout and pointerover again
  // under a mouse that has not moved; that is not a hover.
  function closeBy(route: "enter" | "escape" | "outside"): void {
    openByClick();
    focus(raisedField());
    if (route === "enter") fireEvent.keyDown(raisedField(), { key: "Enter" });
    else if (route === "escape") fireEvent.keyDown(raisedField(), { key: "Escape" });
    else pointerDown(outside());
    expect(fieldsOpen()).toBe(false);
  }

  it.each(["enter", "escape", "outside"] as const)(
    "does not reopen on a pointerover with no movement after a close by %s",
    (route) => {
      closeBy(route);
      out(amountsBlock());
      over(amountsBlock());
      over(thermometer());
      advance(1000);
      expect(fieldsOpen()).toBe(false);
    },
  );

  it("opens again once the pointer has really moved on the stage, and hovers over again", () => {
    closeBy("enter");
    over(amountsBlock());
    expect(fieldsOpen()).toBe(false);
    fireEvent.pointerMove(screen.getByTestId("backdrop"), { pointerType: "mouse" });
    over(thermometer());
    expect(fieldsOpen()).toBe(true);
  });

  it("is not woken by a touch move", () => {
    closeBy("enter");
    fireEvent.pointerMove(screen.getByTestId("backdrop"), { pointerType: "touch" });
    over(thermometer());
    expect(fieldsOpen()).toBe(false);
  });

  it("still opens by a click or focus on the button, which are not hover", () => {
    closeBy("enter");
    fireEvent.click(thermometer(), { detail: 1 });
    expect(fieldsOpen()).toBe(true);
  });

  it("does not hold back a hover after the grace timer closed a preview", () => {
    render(<Harness />);
    over(thermometer());
    out(thermometer());
    advance(GRACE_MS + 10);
    expect(fieldsOpen()).toBe(false);
    over(thermometer());
    expect(fieldsOpen()).toBe(true);
  });
});
