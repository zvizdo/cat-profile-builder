import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fundraiser } from "@/core/fundraiser/fundraiser";
import { FundraiserDisplay } from "@/ui/fundraiser/FundraiserDisplay";
import { installFakeClock } from "./edit-session-harness";
import { stubFullscreenApi, stubMatchMediaQueries, type FullscreenFake } from "./fullscreen-fakes";

// The page's half of the soft keyboard fix (display-layout.md, Known risk, option 2): the
// arrangement is read once when a session opens and written to the shape element until the
// session ends. jsdom lays nothing out and nothing here listens to a resize, so these tests prove
// only WHAT IS WRITTEN and WHEN (read at open, not re-read, removed at close); that the layout
// really stays a stack when the stage shrinks is proved in a real browser, in
// tests/e2e/fundraiser.spec.ts ("the held arrangement under the soft keyboard").

const SPRING: Fundraiser = {
  headline: "Spring Vet Fund",
  raisedCents: 650_000,
  goalCents: 1_000_000,
};

installFakeClock();

let api: FullscreenFake;
let box = { width: 0, height: 0 };

beforeEach(() => {
  stubMatchMediaQueries();
  api = stubFullscreenApi();
  vi.spyOn(window.history, "replaceState").mockImplementation(() => undefined);
  box = { width: 390, height: 844 };
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: box.width,
    bottom: box.height,
    width: box.width,
    height: box.height,
    toJSON: () => ({}),
  }));
});
afterEach(() => {
  api.restore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function shape(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>("[data-shape]");
  if (!found) throw new Error("no shape element");
  return found;
}
function show() {
  return render(<FundraiserDisplay initial={SPRING} isBlank={false} />);
}
function open(): void {
  fireEvent.click(screen.getByRole("button", { name: "Edit the amount raised and the goal" }), {
    detail: 1,
  });
}
/** What the soft keyboard does: the stage keeps its width and loses most of its height. */
function shrinkTo(height: number): void {
  box = { ...box, height };
  fireEvent(window, new Event("resize"));
}

describe("the held arrangement", () => {
  it("is not set while nothing is open: the container query alone decides", () => {
    const { container } = show();
    expect(shape(container)).not.toHaveAttribute("data-arrangement");
  });

  it("is the stack on an upright phone once a session opens", () => {
    const { container } = show();
    open();
    expect(shape(container)).toHaveAttribute("data-arrangement", "stack");
  });

  it("is side by side on a wide screen once a session opens", () => {
    box = { width: 1920, height: 1080 };
    const { container } = show();
    open();
    expect(shape(container)).toHaveAttribute("data-arrangement", "side");
  });

  it("is not re-read when the stage reports 420 tall: it keeps what the opening box said", () => {
    const { container } = show();
    open();
    shrinkTo(420);
    expect(shape(container)).toHaveAttribute("data-arrangement", "stack");
    expect(screen.getByRole("textbox", { name: "Amount raised" })).toBeInTheDocument();
  });

  it("is not re-read at 250 tall, where the box alone would say side by side, and the field and its text are untouched", () => {
    box = { width: 320, height: 568 };
    const { container } = show();
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Amount raised" }), {
      target: { value: "7,2" },
    });
    shrinkTo(250);
    expect(shape(container)).toHaveAttribute("data-arrangement", "stack");
    expect(screen.getByRole("textbox", { name: "Amount raised" })).toHaveValue("7,2");
  });

  it("writes the ratio limit the stylesheet needs, never below a stack's own ratio nor above a side's", () => {
    box = { width: 1000, height: 935 };
    const { container } = show();
    open();
    expect(Number(shape(container).style.getPropertyValue("--held-ratio"))).toBeGreaterThanOrEqual(
      1000 / 935,
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Goal" }), { key: "Escape" });
    expect(shape(container).style.getPropertyValue("--held-ratio")).toBe("");
    box = { width: 1100, height: 917 };
    open();
    expect(Number(shape(container).style.getPropertyValue("--held-ratio"))).toBeLessThanOrEqual(
      1100 / 917,
    );
  });

  it("is let go when the session ends, and read afresh by the next one", () => {
    const { container } = show();
    open();
    shrinkTo(420);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Goal" }), { key: "Escape" });
    expect(shape(container)).not.toHaveAttribute("data-arrangement");
    box = { width: 844, height: 390 };
    open();
    expect(shape(container)).toHaveAttribute("data-arrangement", "side");
  });

  it("is let go when full screen clears the session", () => {
    const { container } = show();
    open();
    act(() => api.setElement(document.documentElement));
    expect(shape(container)).not.toHaveAttribute("data-arrangement");
  });

  it("is not guessed when the box has no size yet", () => {
    box = { width: 0, height: 0 };
    const { container } = show();
    open();
    expect(shape(container)).not.toHaveAttribute("data-arrangement");
  });
});
