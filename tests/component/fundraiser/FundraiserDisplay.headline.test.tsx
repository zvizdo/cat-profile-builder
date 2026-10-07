import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { readAddress } from "@/core/fundraiser/address";
import type { Fundraiser } from "@/core/fundraiser/fundraiser";
import { FundraiserDisplay } from "@/ui/fundraiser/FundraiserDisplay";
import * as InPlace from "@/ui/fundraiser/InPlaceField";
import { advance, installFakeClock, nextFrame } from "./edit-session-harness";
import { stubFullscreenApi, stubMatchMediaQueries, type FullscreenFake } from "./fullscreen-fakes";

// Editing the headline in place (T019; quickstart 6, SC-011), through the whole display. The
// rules are the state machine's and the hook's own tests; these check the page wires the headline
// to them, shows the right words, shares the amounts' field, Done and edit row, and writes the
// address once. Layout is the browser check's and the end-to-end specs'.

const SPRING: Fundraiser = {
  headline: "Spring Vet Fund",
  raisedCents: 650_000,
  goalCents: 1_000_000,
};
const EMPTY_REFUSAL = "The headline can't be empty.";
const LONG_REFUSAL = "Keep the headline to 60 characters or fewer.";

installFakeClock();

let api: FullscreenFake;
let replaceState: MockInstance<History["replaceState"]>;

beforeEach(() => {
  stubMatchMediaQueries();
  api = stubFullscreenApi();
  replaceState = vi.spyOn(window.history, "replaceState");
});
afterEach(() => {
  api.restore();
  replaceState.mockRestore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function show(fundraiser: Fundraiser = SPRING, isBlank = false) {
  return render(<FundraiserDisplay initial={fundraiser} isBlank={isBlank} />);
}
const headlineButton = (name = SPRING.headline): HTMLElement =>
  screen.getByRole("button", { name });
const headlineField = (): HTMLElement => screen.getByRole("textbox", { name: "Headline" });
const headlineOpen = (): boolean => screen.queryByRole("textbox", { name: "Headline" }) !== null;
const done = (): HTMLElement => screen.getByRole("button", { name: "Done" });
const heading = (): HTMLElement => screen.getByRole("heading", { level: 1 });
const type = (text: string): void =>
  void fireEvent.change(headlineField(), { target: { value: text } });
const enter = (): void => void fireEvent.keyDown(headlineField(), { key: "Enter" });
function open(): void {
  fireEvent.click(headlineButton(), { detail: 1 });
}
function writtenQuery(): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(String(replaceState.mock.calls[0]?.[2])));
}

describe("opening the headline", () => {
  it("opens on a click, and the field holds the current headline", () => {
    show();
    open();
    expect(headlineField()).toHaveValue(SPRING.headline);
  });

  it("opens on Enter and on Space from the keyboard", async () => {
    vi.useRealTimers();
    show();
    const user = userEvent.setup();
    headlineButton().focus();
    await user.keyboard("{Enter}");
    expect(headlineOpen()).toBe(true);
    await user.keyboard("{Escape}");
    expect(headlineOpen()).toBe(false);
    await user.keyboard(" ");
    expect(headlineOpen()).toBe(true);
  });

  it("opens by a touch tap, with no hover step first", () => {
    show();
    fireEvent.pointerOver(headlineButton(), { pointerType: "touch" });
    expect(headlineOpen()).toBe(false);
    fireEvent.click(headlineButton(), { detail: 1 });
    expect(headlineOpen()).toBe(true);
  });

  it("replaces an open amounts session, dropping its drafts", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Edit the amount raised and the goal" }), {
      detail: 1,
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Amount raised" }), {
      target: { value: "9,999" },
    });
    open();
    expect(headlineOpen()).toBe(true);
    expect(screen.queryByRole("textbox", { name: "Amount raised" })).toBeNull();
    fireEvent.keyDown(headlineField(), { key: "Escape" });
    expect(screen.getByText("$6,500")).toBeInTheDocument();
  });

  it("is not stolen by a hover over the thermometer while it is open", () => {
    show();
    open();
    fireEvent.pointerOver(screen.getByRole("meter"), { pointerType: "mouse" });
    expect(headlineOpen()).toBe(true);
    expect(screen.queryByRole("textbox", { name: "Amount raised" })).toBeNull();
  });

  it("takes focus, so typing goes straight in", () => {
    show();
    open();
    expect(headlineField()).toHaveFocus();
  });
});

describe("confirming and cancelling", () => {
  it("Enter commits: plain text again, the thermometer untouched, the address written once", () => {
    show();
    open();
    type("Winter Fund");
    enter();
    expect(headlineOpen()).toBe(false);
    expect(heading()).toHaveTextContent("Winter Fund");
    expect(screen.getByRole("button", { name: "Winter Fund" })).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "?headline=Winter%20Fund&raised=6500&goal=10000",
    );
  });

  it("what it writes reads back as the confirmed fundraiser", () => {
    show();
    open();
    type("Winter Fund");
    enter();
    expect(readAddress(writtenQuery()).fundraiser).toEqual({ ...SPRING, headline: "Winter Fund" });
  });

  it("Done commits the same way", () => {
    show();
    open();
    type("Winter Fund");
    fireEvent.click(done(), { detail: 1 });
    expect(heading()).toHaveTextContent("Winter Fund");
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it("an unchanged confirm closes with no write", () => {
    show();
    open();
    enter();
    expect(headlineOpen()).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("Escape cancels: the old headline stays, nothing is written, and focus returns without reopening", () => {
    show();
    open();
    type("Winter Fund");
    fireEvent.keyDown(headlineField(), { key: "Escape" });
    expect(headlineOpen()).toBe(false);
    expect(heading()).toHaveTextContent(SPRING.headline);
    expect(replaceState).not.toHaveBeenCalled();
    expect(headlineButton()).toHaveFocus();
    nextFrame();
    expect(headlineOpen()).toBe(false);
  });

  it("a keyboard confirm returns focus to the headline button, named by the new text", () => {
    show();
    open();
    type("Winter Fund");
    enter();
    expect(headlineButton("Winter Fund")).toHaveFocus();
  });

  it("a press outside cancels", () => {
    show();
    open();
    type("Winter Fund");
    fireEvent.pointerDown(screen.getByRole("main"), { pointerType: "mouse" });
    expect(headlineOpen()).toBe(false);
    expect(heading()).toHaveTextContent(SPRING.headline);
  });

  it("Done stays pressable after typing when focus leaves with no related target", () => {
    show();
    open();
    type("Winter Fund");
    fireEvent.pointerDown(done(), { pointerType: "touch" });
    fireEvent.blur(headlineField(), { relatedTarget: null });
    nextFrame();
    expect(headlineOpen()).toBe(true);
    fireEvent.click(done(), { detail: 1 });
    expect(heading()).toHaveTextContent("Winter Fund");
  });
});

describe("refusals (SC-008: the display never changes on an invalid entry)", () => {
  it("an empty headline is refused in the edit row and the old one stays", () => {
    show();
    open();
    type("");
    enter();
    expect(headlineOpen()).toBe(true);
    const row = document.querySelector<HTMLElement>("[data-edit-row]");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByRole("alert")).toHaveTextContent(EMPTY_REFUSAL);
    expect(headlineField()).toHaveAttribute("aria-invalid", "true");
    expect(headlineField()).toHaveAccessibleDescription(EMPTY_REFUSAL);
    expect(replaceState).not.toHaveBeenCalled();
    fireEvent.keyDown(headlineField(), { key: "Escape" });
    expect(heading()).toHaveTextContent(SPRING.headline);
  });

  it("61 characters are refused, and nothing is cut", () => {
    show();
    open();
    const sixtyOne = "a".repeat(61);
    type(sixtyOne);
    enter();
    expect(screen.getByRole("alert")).toHaveTextContent(LONG_REFUSAL);
    expect(headlineField()).toHaveValue(sixtyOne);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("exactly 60 code points are accepted (an emoji is one)", () => {
    show();
    open();
    const sixty = "🐈".repeat(60);
    type(sixty);
    enter();
    expect(headlineOpen()).toBe(false);
    expect(heading()).toHaveTextContent(sixty);
  });

  it("typing again clears the refusal", () => {
    show();
    open();
    type("");
    enter();
    type("N");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(headlineField()).not.toHaveAttribute("aria-invalid");
  });
});

describe("what the page does around the headline", () => {
  it("steps the size by the draft while typing, so nothing clips", () => {
    show();
    expect(heading()).toHaveAttribute("data-fit", "0");
    open();
    type("w".repeat(60));
    expect(heading()).toHaveAttribute("data-fit", "2");
    type("short");
    expect(heading()).toHaveAttribute("data-fit", "0");
  });

  it("clears the starting hint for good, as an amount commit does", () => {
    show(SPRING, true);
    expect(screen.getByText(/Hover, tap or Tab to the thermometer/)).toBeInTheDocument();
    open();
    type("Winter Fund");
    enter();
    expect(screen.queryByText(/Hover, tap or Tab to the thermometer/)).toBeNull();
  });

  it("keeps the hint when the headline edit was cancelled or unchanged", () => {
    show(SPRING, true);
    open();
    enter();
    expect(screen.getByText(/Hover, tap or Tab to the thermometer/)).toBeInTheDocument();
  });

  it("says the one status sentence after a headline commit", () => {
    show();
    open();
    type("Winter Fund");
    enter();
    expect(screen.getByText("Updated: $6,500 raised of $10,000, 65 percent.")).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("is a plain text node in full screen: no button, no field", () => {
    show();
    act(() => api.setElement(document.documentElement));
    expect(heading().childElementCount).toBe(0);
    expect(heading()).toHaveTextContent(SPRING.headline);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("starting full screen cancels an open headline session, and it does not return on exit", () => {
    show();
    open();
    type("Winter Fund");
    act(() => api.setElement(document.documentElement));
    act(() => api.setElement(null));
    advance(100);
    expect(headlineOpen()).toBe(false);
    expect(heading()).toHaveTextContent(SPRING.headline);
  });
});

describe("one field, one Done, one edit row (SC-011)", () => {
  it("renders the same InPlaceField component for the headline as for the amounts", () => {
    const spy = vi.spyOn(InPlace, "InPlaceField");
    show();
    open();
    fireEvent.keyDown(headlineField(), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Edit the amount raised and the goal" }), {
      detail: 1,
    });
    const kinds = new Set(spy.mock.calls.map(([p]) => p.kind));
    expect([...kinds].sort()).toEqual(["line", "wrap"]);
    expect(spy.mock.calls.some(([p]) => p.kind === "wrap" && p.label === "Headline")).toBe(true);
  });

  it("uses the same class names on the field, its mirror and its control as an amount field", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Edit the amount raised and the goal" }), {
      detail: 1,
    });
    const amount = screen.getByRole("textbox", { name: "Amount raised" });
    const amountOuter = amount.parentElement as HTMLElement;
    const amountClasses = [...amountOuter.classList];
    const amountControl = [...amount.classList];
    fireEvent.keyDown(amount, { key: "Escape" });
    open();
    const box = headlineField();
    const outer = box.parentElement as HTMLElement;
    expect(amountClasses.length).toBeGreaterThan(0);
    expect(amountControl.length).toBeGreaterThan(0);
    expect(outer.classList.length).toBeGreaterThan(0);
    expect(box.classList.length).toBeGreaterThan(0);
    for (const name of amountClasses) expect(outer.classList.contains(name)).toBe(true);
    for (const name of amountControl) expect(box.classList.contains(name)).toBe(true);
    expect(outer.firstElementChild?.className).toBe(amountOuter.firstElementChild?.className);
  });

  it("shows the one Done button in the one edit row, whichever target is open", () => {
    show();
    const rows = document.querySelectorAll("[data-edit-row]");
    expect(rows).toHaveLength(1);
    open();
    expect(screen.getAllByRole("button", { name: "Done" })).toHaveLength(1);
    expect(done().closest("[data-edit-row]")).toBe(rows[0]);
    fireEvent.keyDown(headlineField(), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Edit the amount raised and the goal" }), {
      detail: 1,
    });
    expect(done().closest("[data-edit-row]")).toBe(rows[0]);
    expect(document.querySelectorAll("[data-edit-row]")).toHaveLength(1);
  });
});
