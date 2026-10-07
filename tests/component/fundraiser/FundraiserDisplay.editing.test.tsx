import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { readAddress } from "@/core/fundraiser/address";
import type { Fundraiser } from "@/core/fundraiser/fundraiser";
import { FundraiserDisplay } from "@/ui/fundraiser/FundraiserDisplay";
import { advance, installFakeClock, nextFrame } from "./edit-session-harness";
import { stubFullscreenApi, stubMatchMediaQueries, type FullscreenFake } from "./fullscreen-fakes";

// Editing the amount raised and the goal in place (T017; quickstart 3, 4, 5, 7, 11, 16), proved
// through the whole display. The rules themselves are the state machine's and the hook's own
// tests; these check that the page wires them to the right elements, shows the right words and
// puts the right numbers on the thermometer. A CSS module is an empty proxy in jsdom, so layout
// is the browser check's and the end-to-end spec's.

const SPRING: Fundraiser = {
  headline: "Spring Vet Fund",
  raisedCents: 650_000,
  goalCents: 1_000_000,
};
const HINT = "Hover, tap or Tab to the thermometer to set your goal.";
const EDIT_BUTTON = "Edit the amount raised and the goal";

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
  vi.unstubAllGlobals();
});

function show(fundraiser: Fundraiser = SPRING, isBlank = false) {
  return render(<FundraiserDisplay initial={fundraiser} isBlank={isBlank} />);
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
function litPaws(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[data-paw]")]
    .filter((paw) => paw.getAttribute("data-lit") === "true")
    .map((paw) => paw.textContent ?? "");
}
/** How many parts are lit, and how many parts carry the flag at all (the tube and the bulb). */
function highlighted(container: HTMLElement): { lit: number; flagged: number } {
  return {
    lit: container.querySelectorAll('[data-highlighted="true"]').length,
    flagged: container.querySelectorAll("[data-highlighted]").length,
  };
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
/** Settles what a keyboard close schedules for the next animation frame. */
function settle(): void {
  nextFrame();
}

describe("the button over the thermometer", () => {
  it("is named by what it does and nothing more, so the figures are spoken once, by the meter", () => {
    show();
    expect(thermometerButton()).toHaveAccessibleName(EDIT_BUTTON);
    expect(thermometerButton()).toBeEmptyDOMElement();
  });

  it("comes before the amounts in the page, so the next Tab lands in the first field", () => {
    const { container } = show();
    const follows = thermometerButton().compareDocumentPosition(raisedText(container));
    expect(follows & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is part of the figures region, as the thermometer is", () => {
    show();
    expect(thermometerButton()).toHaveAttribute("data-figures");
    expect(screen.getByRole("meter").closest("[data-figures]")).not.toBeNull();
  });

  it("is in the editing view only: gone in display state, back with the same numbers after", () => {
    show();
    act(() => api.setElement(document.documentElement));
    expect(screen.queryByRole("button", { name: EDIT_BUTTON })).toBeNull();
    act(() => api.setElement(null));
    expect(thermometerButton()).toBeInTheDocument();
  });
});

describe("hovering the figures (quickstart 3)", () => {
  it("opens the two fields in the very elements that held the text", () => {
    const { container } = show();
    const raised = raisedText(container);
    fireEvent.pointerOver(screen.getByRole("meter"), { pointerType: "mouse" });
    expect(field("Amount raised")).toHaveValue("$6,500");
    expect(field("Goal")).toHaveValue("$10,000");
    expect(raisedText(container)).toBe(raised);
    expect(raised).toContainElement(field("Amount raised"));
  });

  it("opens from the amount block too, and lets the pointer travel between them", () => {
    show();
    fireEvent.pointerOver(screen.getByText("$6,500"), { pointerType: "mouse" });
    expect(fieldsOpen()).toBe(true);
    fireEvent.pointerOut(field("Amount raised"), { pointerType: "mouse" });
    advance(100);
    fireEvent.pointerOver(screen.getByRole("meter"), { pointerType: "mouse" });
    advance(1000);
    expect(fieldsOpen()).toBe(true);
  });

  it("leaves with the pointer when nothing was touched: only a preview", () => {
    show();
    fireEvent.pointerOver(screen.getByRole("meter"), { pointerType: "mouse" });
    fireEvent.pointerOut(screen.getByRole("meter"), { pointerType: "mouse" });
    advance(400);
    expect(fieldsOpen()).toBe(false);
  });

  it("opens nothing in display state: no button, no field, however long it hovers", () => {
    show();
    act(() => api.setElement(document.documentElement));
    fireEvent.pointerOver(screen.getByRole("meter"), { pointerType: "mouse" });
    fireEvent.pointerOver(screen.getByText("$6,500"), { pointerType: "mouse" });
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("lights the thermometer's highlight exactly while the amounts are open", () => {
    const { container } = show();
    expect(highlighted(container)).toEqual({ lit: 0, flagged: 2 });
    open();
    expect(highlighted(container)).toEqual({ lit: 2, flagged: 2 });
    fireEvent.keyDown(field("Goal"), { key: "Escape" });
    expect(highlighted(container)).toEqual({ lit: 0, flagged: 2 });
  });
});

describe("confirming a change (quickstart 3 and 7)", () => {
  it("Enter in the amount raised writes $7,200 as plain text, moves the fill to 72% and the address", () => {
    const { container } = show();
    open();
    typeInto("Amount raised", "7,200");
    enterIn("Amount raised");
    expect(fieldsOpen()).toBe(false);
    expect(raisedText(container)).toHaveTextContent(/^\$7,200$/);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "7200");
    expect(screen.getByText("72% ($7.2K)")).toBeInTheDocument();
    expect(container.querySelector("[data-fill]")).toHaveStyle({
      transform: "translateY(calc((1 - var(--level)) * 100%))",
    });
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "?headline=Spring%20Vet%20Fund&raised=7200&goal=10000",
    );
  });

  it("never adds a history entry, and what it writes reads back as the confirmed fundraiser", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    show();
    open();
    typeInto("Amount raised", "7,200");
    enterIn("Amount raised");
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
    const written = replaceState.mock.calls[0]?.[2];
    expect(typeof written).toBe("string");
    const query = Object.fromEntries(new URLSearchParams(String(written)));
    expect(readAddress(query).fundraiser).toEqual({ ...SPRING, raisedCents: 720_000 });
  });

  it("Done commits the same way", () => {
    const { container } = show();
    open();
    typeInto("Amount raised", "7,200");
    fireEvent.click(done(), { detail: 1 });
    expect(raisedText(container)).toHaveTextContent(/^\$7,200$/);
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it("lights the paws the new share has reached, and no others", () => {
    const { container } = show();
    expect(litPaws(container)).toEqual(["25%", "50%"]);
    open();
    typeInto("Amount raised", "7,500");
    enterIn("Amount raised");
    expect(litPaws(container)).toEqual(["25%", "50%", "75%"]);
  });

  it("recalculates the milestones when the goal changes", () => {
    const { container } = show();
    open();
    typeInto("Goal", "20,000");
    enterIn("Goal");
    expect(screen.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      "$6,500 raised of a $20,000 goal, 32 percent",
    );
    expect(litPaws(container)).toEqual(["25%"]);
    expect(screen.getByText("$20K")).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "?headline=Spring%20Vet%20Fund&raised=6500&goal=20000",
    );
  });

  it("shows the goal reached at $12,000 of $10,000: the pill, every paw lit, 120%", () => {
    const { container } = show();
    open();
    typeInto("Amount raised", "12,000");
    enterIn("Amount raised");
    expect(screen.getByText("Goal reached")).toBeInTheDocument();
    expect(screen.getByText("120% ($12K)")).toBeInTheDocument();
    expect(litPaws(container)).toHaveLength(4);
  });

  it("closes without writing anything when nothing changed", () => {
    show(SPRING, true);
    open();
    fireEvent.click(done(), { detail: 1 });
    expect(fieldsOpen()).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });
});

describe("the starting hint", () => {
  it("goes after the first confirmed change and never comes back", () => {
    show(SPRING, true);
    expect(screen.getByText(HINT)).toBeInTheDocument();
    open();
    typeInto("Amount raised", "7,200");
    enterIn("Amount raised");
    expect(screen.queryByText(HINT)).toBeNull();
    settle();
    open();
    fireEvent.keyDown(field("Goal"), { key: "Escape" });
    act(() => api.setElement(document.documentElement));
    act(() => api.setElement(null));
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("stays while an edit is only typed, refused or cancelled", () => {
    show(SPRING, true);
    open();
    typeInto("Goal", "0");
    enterIn("Goal");
    expect(screen.getByText(HINT)).toBeInTheDocument();
    fireEvent.keyDown(field("Goal"), { key: "Escape" });
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });
});

describe("refusals (quickstart 4)", () => {
  it("refuses a goal of 0 under the fields, keeps the old numbers, writes nothing", () => {
    const { container } = show();
    open();
    typeInto("Amount raised", "7,200");
    typeInto("Goal", "0");
    fireEvent.click(done(), { detail: 1 });
    expect(fieldsOpen()).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("The goal has to be more than $0.");
    expect(field("Goal")).toHaveAttribute("aria-invalid", "true");
    expect(field("Goal")).toHaveAccessibleDescription("The goal has to be more than $0.");
    expect(field("Amount raised")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "6500");
    expect(raisedText(container)).toContainElement(field("Amount raised"));
    expect(replaceState).not.toHaveBeenCalled();
  });

  it.each([
    ["abc", "That doesn't look like an amount. Use digits, like 6,500 or 6,500.50."],
    ["-5", "An amount can't be negative."],
    ["", "Type an amount, for example 6,500."],
    ["1.234", "Use dollars and cents only, like 6,500.50."],
    ["100,000,000", "That's more than this page can show. The most is $99,999,999.99."],
  ])("refuses %j in the amount raised with the contract's sentence", (text, sentence) => {
    show();
    open();
    typeInto("Amount raised", text);
    enterIn("Amount raised");
    expect(screen.getByRole("alert")).toHaveTextContent(sentence);
    expect(field("Amount raised")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "6500");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it.each([
    ["abc", "That doesn't look like an amount. Use digits, like 6,500 or 6,500.50."],
    ["-5", "An amount can't be negative."],
    ["", "Type an amount, for example 6,500."],
  ])("refuses %j in the goal the same way", (text, sentence) => {
    show();
    open();
    typeInto("Goal", text);
    enterIn("Goal");
    expect(screen.getByRole("alert")).toHaveTextContent(sentence);
    expect(field("Goal")).toHaveAttribute("aria-invalid", "true");
  });

  it("clears a field's sentence when it is typed in again, and commits once both are right", () => {
    show();
    open();
    typeInto("Goal", "0");
    enterIn("Goal");
    expect(screen.getByRole("alert")).not.toBeEmptyDOMElement();
    typeInto("Goal", "5,000");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    enterIn("Goal");
    expect(fieldsOpen()).toBe(false);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuemax", "5000");
  });
});

describe("cancelling (quickstart 5)", () => {
  it("Escape changes nothing and returns the figures to plain text", () => {
    const { container } = show();
    open();
    typeInto("Amount raised", "9,999");
    fireEvent.keyDown(field("Amount raised"), { key: "Escape" });
    expect(fieldsOpen()).toBe(false);
    expect(raisedText(container)).toHaveTextContent(/^\$6,500$/);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("a press outside changes nothing", () => {
    const { container } = show();
    open();
    typeInto("Amount raised", "9,999");
    fireEvent.pointerDown(document.body);
    expect(fieldsOpen()).toBe(false);
    expect(raisedText(container)).toHaveTextContent(/^\$6,500$/);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("starting full screen with a session open clears it, and exiting does not bring it back", () => {
    show();
    open();
    typeInto("Amount raised", "9,999");
    act(() => api.setElement(document.documentElement));
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    act(() => api.setElement(null));
    expect(fieldsOpen()).toBe(false);
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "6500");
  });
});
