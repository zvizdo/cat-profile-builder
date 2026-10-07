import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fundraiser } from "@/core/fundraiser/fundraiser";
import { FundraiserDisplay } from "@/ui/fundraiser/FundraiserDisplay";
import { stubFullscreenApi, stubMatchMediaQueries, type FullscreenFake } from "./fullscreen-fakes";

// The keyboard-only run of editing in place (quickstart 11; Principle IX), through the whole
// display with real timers, because a keyboard driver waits on the clock. The rules are the hook's
// own tests; this proves the page's order, names and where focus goes.

const SPRING: Fundraiser = {
  headline: "Spring Vet Fund",
  raisedCents: 650_000,
  goalCents: 1_000_000,
};
const EDIT_BUTTON = "Edit the amount raised and the goal";

let api: FullscreenFake;

beforeEach(() => {
  stubMatchMediaQueries();
  api = stubFullscreenApi();
  vi.spyOn(window.history, "replaceState").mockImplementation(() => undefined);
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
function done(): HTMLElement {
  return screen.getByRole("button", { name: "Done" });
}
function fieldsOpen(): boolean {
  return screen.queryByRole("textbox", { name: "Amount raised" }) !== null;
}
/** Lets what a keyboard close schedules for the next animation frame happen. */
async function nextFrame(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }),
  );
}

describe("the keyboard path", () => {
  it("tabs Full screen, the headline, the thermometer button, the amount raised, the goal, Done", async () => {
    show();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "Full screen" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: SPRING.headline })).toHaveFocus();
    expect(fieldsOpen()).toBe(false);
    await user.tab();
    expect(thermometerButton()).toHaveFocus();
    expect(fieldsOpen()).toBe(true);
    await user.tab();
    expect(field("Amount raised")).toHaveFocus();
    await user.tab();
    expect(field("Goal")).toHaveFocus();
    await user.tab();
    expect(done()).toHaveFocus();
  });

  it("gives every control a name", async () => {
    show();
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    await user.tab();
    for (const control of [
      screen.getByRole("button", { name: "Full screen" }),
      screen.getByRole("button", { name: SPRING.headline }),
      thermometerButton(),
      field("Amount raised"),
      field("Goal"),
      done(),
    ]) {
      expect(control).toHaveAccessibleName();
    }
  });

  it("types into the first field, and Done commits it and returns focus without reopening", async () => {
    show();
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.clear(field("Amount raised"));
    await user.keyboard("7,200");
    await user.tab();
    await user.tab();
    expect(done()).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(fieldsOpen()).toBe(false);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "7200");
    expect(thermometerButton()).toHaveFocus();
    await nextFrame();
    expect(fieldsOpen()).toBe(false);
  });

  it("opens again on a real Tab back in after the focus came home", async () => {
    show();
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(thermometerButton()).toHaveFocus();
    await nextFrame();
    await user.tab({ shift: true });
    await user.tab();
    expect(thermometerButton()).toHaveFocus();
    expect(fieldsOpen()).toBe(true);
  });

  it("returns focus to the thermometer button after Escape, without reopening", async () => {
    show();
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.keyboard("{Escape}");
    expect(fieldsOpen()).toBe(false);
    expect(thermometerButton()).toHaveFocus();
    await nextFrame();
    expect(fieldsOpen()).toBe(false);
  });

  it("closes when Tab leaves Done for the page", async () => {
    show();
    const user = userEvent.setup();
    for (let step = 0; step < 6; step += 1) await user.tab();
    expect(done()).toHaveFocus();
    await user.tab();
    await nextFrame();
    expect(fieldsOpen()).toBe(false);
  });

  it("tabs from the headline field to Done, and Shift+Tab from Done comes back to the field", async () => {
    // While the headline is open the thermometer button is out of the Tab order (tabindex -1),
    // so it cannot open the amounts and end the session on the way to Done.
    show();
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Headline" })).toHaveFocus();
    expect(thermometerButton()).toHaveAttribute("tabindex", "-1");
    await user.tab();
    expect(done()).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Headline" })).toBeInTheDocument();
    expect(fieldsOpen()).toBe(false);
    await user.tab({ shift: true });
    expect(screen.getByRole("textbox", { name: "Headline" })).toHaveFocus();
  });

  it("Enter on Done commits the headline and focus returns to the headline button without reopening", async () => {
    show();
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard("{Control>}a{/Control}Winter Fund");
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("textbox", { name: "Headline" })).toBeNull();
    expect(screen.getByRole("button", { name: "Winter Fund" })).toHaveFocus();
    await nextFrame();
    expect(screen.queryByRole("textbox", { name: "Headline" })).toBeNull();
    expect(thermometerButton()).not.toHaveAttribute("tabindex");
  });

  it("Tab from Done leaves the page and cancels the headline session", async () => {
    show();
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    await user.tab();
    await user.tab();
    await nextFrame();
    expect(screen.queryByRole("textbox", { name: "Headline" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Spring Vet Fund");
  });
});
