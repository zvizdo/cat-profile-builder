import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_MS } from "@/core/fundraiser/edit-session";
import type { Fundraiser } from "@/core/fundraiser/fundraiser";
import { FundraiserDisplay } from "@/ui/fundraiser/FundraiserDisplay";
import { advance, installFakeClock, nextFrame, over } from "./edit-session-harness";
import { stubFullscreenApi, stubMatchMediaQueries, type FullscreenFake } from "./fullscreen-fakes";

// The status line and the phone tap of editing in place (T017; quickstart 15), split from
// FundraiserDisplay.editing.test.tsx to keep each file short. Same page, same helpers.

const SPRING: Fundraiser = {
  headline: "Spring Vet Fund",
  raisedCents: 650_000,
  goalCents: 1_000_000,
};
const EDIT_BUTTON = "Edit the amount raised and the goal";

installFakeClock();

let api: FullscreenFake;

beforeEach(() => {
  stubMatchMediaQueries();
  api = stubFullscreenApi();
  vi.spyOn(window.history, "replaceState");
});
afterEach(() => {
  api.restore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function show() {
  return render(<FundraiserDisplay initial={SPRING} isBlank={false} />);
}
function thermometerButton(): HTMLElement {
  return screen.getByRole("button", { name: EDIT_BUTTON });
}
function field(name: "Amount raised" | "Goal"): HTMLElement {
  return screen.getByRole("textbox", { name });
}
const done = (): HTMLElement => screen.getByRole("button", { name: "Done" });
const fieldsOpen = (): boolean => screen.queryByRole("textbox", { name: "Amount raised" }) !== null;
function raisedText(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>("[data-raised]");
  if (!found) throw new Error("no amount raised element");
  return found;
}
function open(): void {
  fireEvent.click(thermometerButton(), { detail: 1 });
}
function typeInto(name: "Amount raised" | "Goal", text: string): void {
  fireEvent.change(field(name), { target: { value: text } });
}
function enterIn(name: "Amount raised" | "Goal"): void {
  fireEvent.keyDown(field(name), { key: "Enter" });
}
function settle(): void {
  nextFrame();
}

describe("the status line", () => {
  it("is absent from the page's live regions' words until a change is confirmed", () => {
    show();
    for (const status of screen.getAllByRole("status")) expect(status).toBeEmptyDOMElement();
  });

  it("says what changed after a commit, in the contract's words", () => {
    show();
    open();
    typeInto("Amount raised", "7,200");
    enterIn("Amount raised");
    expect(screen.getByText("Updated: $7,200 raised of $10,000, 72 percent.")).toBeInTheDocument();
    expect(screen.getByText("Updated: $7,200 raised of $10,000, 72 percent.")).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("goes quiet when the next session opens, and after a refusal says nothing new", () => {
    show();
    open();
    typeInto("Amount raised", "7,200");
    enterIn("Amount raised");
    settle();
    open();
    expect(screen.queryByText(/^Updated:/)).toBeNull();
    typeInto("Goal", "0");
    enterIn("Goal");
    expect(screen.queryByText(/^Updated:/)).toBeNull();
  });

  it("keeps the sentence when a hover preview opens later, after the mouse really moved", () => {
    show();
    open();
    typeInto("Amount raised", "7,200");
    enterIn("Amount raised");
    settle();
    // A pointer resting under the old fields does not bring them back.
    fireEvent.pointerOver(screen.getByRole("meter"), { pointerType: "mouse" });
    expect(fieldsOpen()).toBe(false);
    fireEvent.pointerMove(screen.getByRole("meter"), { pointerType: "mouse" });
    fireEvent.pointerOver(screen.getByRole("meter"), { pointerType: "mouse" });
    expect(fieldsOpen()).toBe(true);
    expect(screen.getByText(/^Updated:/)).toBeInTheDocument();
    fireEvent.change(field("Goal"), { target: { value: "9,000" } });
    expect(screen.queryByText(/^Updated:/)).toBeNull();
  });

  it("is not rendered at all in display state", () => {
    show();
    open();
    typeInto("Amount raised", "7,200");
    enterIn("Amount raised");
    act(() => api.setElement(document.documentElement));
    expect(screen.queryByText(/^Updated:/)).toBeNull();
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });
});

describe("a tap on a phone (quickstart 15)", () => {
  it("does not flash the fields open and shut; the click opens them and they stay", () => {
    show();
    fireEvent.pointerOver(thermometerButton(), { pointerType: "touch" });
    expect(fieldsOpen()).toBe(false);
    fireEvent.pointerOut(thermometerButton(), { pointerType: "touch" });
    fireEvent.click(thermometerButton(), { detail: 1 });
    advance(1000);
    expect(fieldsOpen()).toBe(true);
  });

  it("keeps Done pressable after typing when focus left the field with nothing named", () => {
    const { container } = show();
    open();
    field("Amount raised").focus();
    typeInto("Amount raised", "7,200");
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    done().dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    fireEvent.blur(field("Amount raised"), { relatedTarget: null });
    nextFrame();
    expect(fieldsOpen()).toBe(true);
    fireEvent.click(done(), { detail: 1 });
    expect(raisedText(container)).toHaveTextContent(/^\$7,200$/);
  });
});

describe("the idle timeout (T026, review finding F2)", () => {
  const IDLE_SENTENCE = "Editing closed after a minute. Nothing was changed.";
  const said = (): HTMLElement => screen.getByText(IDLE_SENTENCE);
  const spoken = (): void => {
    expect(said()).toHaveAttribute("role", "status");
  };

  it("returns focus to the thermometer button, says so, and does not reopen", () => {
    const { container } = show();
    open();
    field("Amount raised").focus();
    typeInto("Amount raised", "7");
    advance(IDLE_MS);
    nextFrame();
    expect(fieldsOpen()).toBe(false);
    expect(document.activeElement).toBe(thermometerButton());
    spoken();
    expect(raisedText(container)).toHaveTextContent(/^\$6,500$/);
    advance(1000);
    expect(fieldsOpen()).toBe(false);
  });

  it("returns focus to the headline button when the headline was open", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: SPRING.headline }), { detail: 1 });
    screen.getByRole("textbox", { name: "Headline" }).focus();
    advance(IDLE_MS);
    nextFrame();
    expect(screen.queryByRole("textbox", { name: "Headline" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: SPRING.headline }));
    spoken();
  });

  it("leaves focus alone when it was outside the region, and still says so", () => {
    show();
    open();
    // Opened by a click, with focus never inside it: the clock runs out with focus on the page.
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    advance(IDLE_MS);
    nextFrame();
    expect(document.activeElement).toBe(outside);
    spoken();
    outside.remove();
  });

  it("stays silent when only a hover preview timed out: nothing typed, nothing to announce", () => {
    show();
    over(thermometerButton());
    expect(fieldsOpen()).toBe(true);
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    advance(IDLE_MS);
    nextFrame();
    expect(fieldsOpen()).toBe(false);
    expect(screen.queryByText(IDLE_SENTENCE)).toBeNull();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("clears the sentence when the next edit begins, so it is said once", () => {
    show();
    open();
    field("Amount raised").focus();
    advance(IDLE_MS);
    nextFrame();
    spoken();
    open();
    expect(screen.queryByText(IDLE_SENTENCE)).toBeNull();
  });
});
