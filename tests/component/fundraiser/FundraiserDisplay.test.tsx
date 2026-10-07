import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULTS, type Fundraiser } from "@/core/fundraiser/fundraiser";
import { FundraiserDisplay } from "@/ui/fundraiser/FundraiserDisplay";
import {
  DISPLAY_MODE_FULLSCREEN,
  stubFullscreenApi,
  stubMatchMediaQueries,
  type FullscreenFake,
  type MatchMediaFake,
} from "./fullscreen-fakes";

// A CSS module is an empty proxy in jsdom, so these tests read the document's structure,
// text, aria and data-* attributes, never computed layout. Whether the stage fits every
// shape is checked in the browser (T012) and by the end-to-end spec (T014).

const SPRING: Fundraiser = {
  headline: "Spring Vet Fund",
  raisedCents: 650_000,
  goalCents: 1_000_000,
};

let media: MatchMediaFake;
let api: FullscreenFake;

beforeEach(() => {
  media = stubMatchMediaQueries();
  api = stubFullscreenApi();
});
afterEach(() => {
  api.restore();
  vi.unstubAllGlobals();
});

function show(fundraiser: Fundraiser = SPRING, isBlank = false) {
  const view = render(<FundraiserDisplay initial={fundraiser} isBlank={isBlank} />);
  return { ...view, headline: screen.getByRole("heading", { level: 1 }) };
}

function part(container: HTMLElement, selector: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`no element matches ${selector}`);
  return found;
}

describe("FundraiserDisplay structure", () => {
  it("is one main landmark with exactly one h1, the headline", () => {
    show();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    const headings = screen.getAllByRole("heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Spring Vet Fund");
    expect(headings[0]?.tagName).toBe("H1");
  });

  it("draws the headline as a single text node, never as markup (inside its button in the editing view)", () => {
    const { headline } = show({ ...SPRING, headline: "<b>Bold</b> & <i>plain</i>" });
    const words = headline.querySelector("button") ?? headline;
    expect(words.children).toHaveLength(0);
    expect(words.childNodes).toHaveLength(1);
    expect(words.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(headline.textContent).toBe("<b>Bold</b> & <i>plain</i>");
    expect(headline.querySelectorAll("*")).toHaveLength(1);
  });

  it("names the logo for a screen reader and does not rush it ahead of the text", () => {
    show();
    const logo = screen.getByRole("img", { name: "South County Cats" });
    expect(logo).not.toHaveAttribute("fetchpriority", "high");
  });

  it("says what the page is, in the label above the headline", () => {
    show();
    expect(screen.getByText("Current fundraiser")).toBeInTheDocument();
  });

  it("reserves the edit row, empty, so nothing shifts when a field opens later", () => {
    const { container } = show();
    const row = part(container, "[data-edit-row]");
    expect(row).toBeEmptyDOMElement();
  });

  it("has three controls at rest, Full screen, the headline and the thermometer's edit button, and no field", () => {
    show();
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Full screen", SPRING.headline, "Edit the amount raised and the goal"]);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});

describe("FundraiserDisplay figures", () => {
  it("shows the amount raised and the goal as plain text", () => {
    const { container } = show();
    expect(part(container, "[data-raised]")).toHaveTextContent(/^\$6,500$/);
    expect(part(container, "[data-goal-line]")).toHaveTextContent("raised of $10,000 goal");
  });

  it("speaks the progress once, in the meter", () => {
    show();
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuetext", "$6,500 raised of a $10,000 goal, 65 percent");
    expect(meter).toHaveAttribute("aria-valuenow", "6500");
    expect(meter).toHaveAttribute("aria-valuemax", "10000");
  });

  it("shows the whole-cents amount with its cents", () => {
    const { container } = show({ ...SPRING, raisedCents: 650_050 });
    expect(part(container, "[data-raised]")).toHaveTextContent("$6,500.50");
    expect(screen.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      "$6,500.50 raised of a $10,000 goal, 65 percent",
    );
  });

  it("starts empty at the defaults: $0 of $5,000", () => {
    const { container } = show({ headline: DEFAULTS.headline, raisedCents: 0, goalCents: 500_000 });
    expect(part(container, "[data-raised]")).toHaveTextContent("$0");
    expect(part(container, "[data-goal-line]")).toHaveTextContent("raised of $5,000 goal");
    expect(screen.queryByText("Goal reached")).toBeNull();
  });

  it("shows the Goal reached pill and the true 120% at $12,000 of $10,000", () => {
    const { container } = show({ ...SPRING, raisedCents: 1_200_000 });
    expect(within(part(container, "[data-goal-line]")).getByText("Goal reached")).toBeVisible();
    expect(screen.getByText("120% ($12K)")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      "$12,000 raised of a $10,000 goal, 120 percent, goal reached",
    );
  });

  it("shows the pill the moment raised equals the goal", () => {
    show({ ...SPRING, raisedCents: 1_000_000 });
    expect(screen.getByText("Goal reached")).toBeInTheDocument();
  });

  it("caps the tag at 999%+ and says more than 999 percent aloud", () => {
    show({ headline: "Tiny", raisedCents: 9_999_999_999, goalCents: 1 });
    expect(screen.getByText("999%+ ($100M)")).toBeInTheDocument();
    expect(screen.getByRole("meter").getAttribute("aria-valuetext")).toContain(
      "more than 999 percent, goal reached",
    );
  });
});

describe("FundraiserDisplay fit steps", () => {
  it.each([
    [1, "0"],
    [24, "0"],
    [25, "1"],
    [40, "1"],
    [41, "2"],
    [60, "2"],
  ])("a %i-character headline takes step %s", (length, step) => {
    const { headline } = show({ ...SPRING, headline: "W".repeat(length) });
    expect(headline).toHaveAttribute("data-fit", step);
  });

  it("counts an emoji as one character, as the reader does", () => {
    const { headline } = show({ ...SPRING, headline: "🐈".repeat(24) });
    expect(headline).toHaveAttribute("data-fit", "0");
  });

  it.each([
    [650_000, "$6,500", "0"],
    [6_500_000, "$65,000", "1"],
    [12_500_000, "$125,000", "1"],
    [125_000_050, "$1,250,000.50", "4"],
    [9_999_999_999, "$99,999,999.99", "4"],
  ])("the amount %i (%s) takes step %s", (cents, text, step) => {
    const { container } = show({ ...SPRING, raisedCents: cents, goalCents: 9_999_999_999 });
    const raised = part(container, "[data-raised]");
    expect(raised).toHaveTextContent(text);
    expect(raised).toHaveAttribute("data-fit", step);
  });

  it("steps the amount by the formatted length: 10 characters is step 2, 11 is step 3", () => {
    const ten = show({ ...SPRING, raisedCents: 100_000_000 }); // $1,000,000
    expect(part(ten.container, "[data-raised]")).toHaveTextContent("$1,000,000");
    expect(part(ten.container, "[data-raised]")).toHaveAttribute("data-fit", "2");
    ten.unmount();
    const eleven = show({ ...SPRING, raisedCents: 1_000_000_000 }); // $10,000,000
    expect(part(eleven.container, "[data-raised]")).toHaveAttribute("data-fit", "3");
  });
});

describe("FundraiserDisplay starting hint", () => {
  const HINT = "Hover, tap or Tab to the thermometer to set your goal.";

  it("shows one line of hint when the address was blank", () => {
    show(SPRING, true);
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("is absent when the address carried a value", () => {
    show(SPRING, false);
    expect(screen.queryByText(HINT)).toBeNull();
  });
});

describe("FundraiserDisplay full screen", () => {
  const HINT = "Hover, tap or Tab to the thermometer to set your goal.";
  const SENTENCE = "Full screen isn't available in this browser.";

  it("asks for full screen once per press of the button", async () => {
    show();
    await userEvent.setup().click(screen.getByRole("button", { name: "Full screen" }));
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it("in display state shows only the display: no button, hint, status or field", () => {
    const { container } = show(SPRING, true);
    expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    act(() => api.setElement(document.documentElement));
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
    expect(screen.queryByText(SENTENCE)).toBeNull();
    expect(part(container, "[data-edit-row]")).toBeEmptyDOMElement();
  });

  it("keeps the figures, the meter and the reserved row when it takes the controls away", () => {
    const { container, headline } = show();
    act(() => api.setElement(document.documentElement));
    expect(headline).toHaveTextContent("Spring Vet Fund");
    expect(part(container, "[data-raised]")).toHaveTextContent("$6,500");
    expect(screen.getByRole("meter")).toBeInTheDocument();
    expect(container.querySelector("[data-edit-row]")).not.toBeNull();
  });

  it("goes to display state when only the display-mode query says full screen", () => {
    show(SPRING, true);
    act(() => media.set(DISPLAY_MODE_FULLSCREEN, true));
    expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("brings the controls back, with the same numbers, when full screen ends", () => {
    show(SPRING, true);
    act(() => api.setElement(document.documentElement));
    act(() => api.setElement(null));
    expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "6500");
  });

  it("says full screen is not available, with no button, where the browser cannot", () => {
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    show();
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /full screen/i })).toBeNull();
  });

  it("says so for six seconds when the browser refuses", async () => {
    vi.useFakeTimers();
    try {
      api.request.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
      show();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
      });
      // Two live regions now: this one and the hidden "Updated:" line, which stays empty.
      const note = () => screen.getAllByRole("status").find((s) => s.textContent === SENTENCE);
      expect(note()).toBeDefined();
      act(() => vi.advanceTimersByTime(6000));
      expect(note()).toBeUndefined();
      for (const status of screen.getAllByRole("status")) expect(status).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("FundraiserDisplay screen wake lock", () => {
  it("is requested on mount and released on unmount", async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(async () => ({ release }) as unknown as WakeLockSentinel);
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    const { unmount } = show();
    expect(request).toHaveBeenCalledWith("screen");
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
