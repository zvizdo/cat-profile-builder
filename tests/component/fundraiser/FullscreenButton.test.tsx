import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullscreenButton, REFUSED_STATUS_MS } from "@/ui/fundraiser/FullscreenButton";

// The Full screen control: a named button that asks the browser for full screen from the
// press itself, a plain sentence where there is no such thing to ask, and a status line that
// says so for six seconds when the browser says no. A CSS module is an empty proxy in jsdom,
// so size and focus outline are read in the browser (T013 browser check), not here.

const SENTENCE = "Full screen isn't available in this browser.";

type Outcome = "entered" | "refused";

function mount(enter: () => Promise<Outcome>, supported = true) {
  return render(<FullscreenButton supported={supported} enter={enter} />);
}

describe("FullscreenButton", () => {
  it("is one button named Full screen, drawn with the expand icon", () => {
    mount(() => Promise.resolve("entered"));
    const button = screen.getByRole("button", { name: "Full screen" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("asks for full screen once per press", async () => {
    const enter = vi.fn(() => Promise.resolve<Outcome>("entered"));
    mount(enter);
    await userEvent.setup().click(screen.getByRole("button", { name: "Full screen" }));
    expect(enter).toHaveBeenCalledTimes(1);
    await userEvent.setup().click(screen.getByRole("button", { name: "Full screen" }));
    expect(enter).toHaveBeenCalledTimes(2);
  });

  it("shows no status while nothing has been refused", async () => {
    mount(() => Promise.resolve("entered"));
    await userEvent.setup().click(screen.getByRole("button", { name: "Full screen" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("FullscreenButton keyboard path", () => {
  it("is in the tab order, and Enter and Space both press it", async () => {
    const enter = vi.fn(() => Promise.resolve<Outcome>("entered"));
    mount(enter);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "Full screen" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(enter).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(enter).toHaveBeenCalledTimes(2);
  });
});

describe("FullscreenButton when full screen is not available", () => {
  it("shows the sentence and no button", () => {
    mount(() => Promise.resolve("entered"), false);
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("FullscreenButton when the browser refuses", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function pressAndRefuse() {
    const view = mount(() => Promise.resolve("refused"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    });
    return view;
  }

  it("says so in the status line for six seconds, then clears it", async () => {
    await pressAndRefuse();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(SENTENCE);
    act(() => vi.advanceTimersByTime(REFUSED_STATUS_MS - 1));
    expect(status).toHaveTextContent(SENTENCE);
    act(() => vi.advanceTimersByTime(1));
    expect(status).toBeEmptyDOMElement();
    expect(REFUSED_STATUS_MS).toBe(6000);
  });

  it("keeps the button, so the volunteer can try again", async () => {
    await pressAndRefuse();
    expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument();
  });

  it("a second refusal restarts the six seconds", async () => {
    await pressAndRefuse();
    act(() => vi.advanceTimersByTime(REFUSED_STATUS_MS - 1000));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    });
    act(() => vi.advanceTimersByTime(REFUSED_STATUS_MS - 1));
    expect(screen.getByRole("status")).toHaveTextContent(SENTENCE);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("leaves no timer behind when it goes away", async () => {
    const view = await pressAndRefuse();
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
