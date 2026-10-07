import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { codePointLength, fitStep, TAG_FIT } from "@/core/fundraiser/fit";
import { progress } from "@/core/fundraiser/progress";
import { Thermometer, type ThermometerProps } from "@/ui/fundraiser/Thermometer";

// A CSS module is an empty proxy in jsdom, so these tests read attributes, aria, data-* and
// inline styles, never computed layout. How it looks and moves is checked in the browser (T012)
// and the end-to-end specs (T014).

const SIXTY_FIVE = "$6,500 raised of a $10,000 goal, 65 percent";

function draw(cents: { raised: number; goal: number }, extra: Partial<ThermometerProps> = {}) {
  const props: ThermometerProps = {
    progress: progress(cents.raised, cents.goal),
    raisedCents: cents.raised,
    goalCents: cents.goal,
    valuetext: SIXTY_FIVE,
    ...extra,
  };
  const { container, unmount } = render(<Thermometer {...props} />);
  return { meter: screen.getByRole("meter"), container, props, unmount };
}

function part(container: HTMLElement, selector: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`no element matches ${selector}`);
  return found;
}

describe("Thermometer meter semantics", () => {
  it("is one meter with a name, a range and the spoken text, at 65 percent", () => {
    const { meter } = draw({ raised: 650000, goal: 1000000 });
    expect(meter).toHaveAccessibleName("Fundraising progress");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "10000");
    expect(meter).toHaveAttribute("aria-valuenow", "6500");
    expect(meter).toHaveAttribute("aria-valuetext", SIXTY_FIVE);
  });

  it("reads the goal as the value when the goal is met exactly", () => {
    const text = "$10,000 raised of a $10,000 goal, 100 percent, goal reached";
    const { meter } = draw({ raised: 1000000, goal: 1000000 }, { valuetext: text });
    expect(meter).toHaveAttribute("aria-valuemax", "10000");
    expect(meter).toHaveAttribute("aria-valuenow", "10000");
    expect(meter).toHaveAttribute("aria-valuetext", text);
  });

  it("caps the value at the goal at 120 percent, while the text keeps the true figure", () => {
    const text = "$12,000 raised of a $10,000 goal, 120 percent, goal reached";
    const { meter } = draw({ raised: 1200000, goal: 1000000 }, { valuetext: text });
    expect(meter).toHaveAttribute("aria-valuemax", "10000");
    expect(meter).toHaveAttribute("aria-valuenow", "10000");
    expect(meter).toHaveAttribute("aria-valuetext", text);
  });

  it("keeps cents exact in the value, with no float tail", () => {
    // Whole cents divided by 100, so there is no float tail to round away.
    const { meter } = draw({ raised: 650007, goal: 1000010 });
    expect(meter).toHaveAttribute("aria-valuemax", "10000.1");
    expect(meter).toHaveAttribute("aria-valuenow", "6500.07");
  });

  it("caps the value at the goal at the largest raise, and reads a 1-cent goal as 0.01", () => {
    const { meter } = draw({ raised: 9999999999, goal: 1 });
    expect(meter).toHaveAttribute("aria-valuemax", "0.01");
    expect(meter).toHaveAttribute("aria-valuenow", "0.01");
  });

  it("holds the largest amount exact", () => {
    const { meter } = draw({ raised: 9999999999, goal: 9999999999 });
    expect(meter).toHaveAttribute("aria-valuemax", "99999999.99");
    expect(meter).toHaveAttribute("aria-valuenow", "99999999.99");
  });

  it("hides every drawn part from assistive technology", () => {
    const { container } = draw({ raised: 650000, goal: 1000000 });
    expect(part(container, "[data-fill]").closest("[aria-hidden='true']")).not.toBeNull();
    expect(part(container, "[data-tag-track]")).toHaveAttribute("aria-hidden", "true");
    const [tube, bulb] = [...container.querySelectorAll("[data-highlighted]")];
    expect(tube).toHaveAttribute("aria-hidden", "true");
    expect(bulb).toHaveAttribute("aria-hidden", "true");
    for (const paw of container.querySelectorAll("svg")) {
      expect(paw.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });
});

describe("Thermometer drawing", () => {
  it("sets --level as a unitless number on the meter", () => {
    const { meter } = draw({ raised: 650000, goal: 1000000 });
    expect(meter.style.getPropertyValue("--level")).toBe("0.65");
  });

  it("holds --level at 1 above the goal", () => {
    const { meter } = draw({ raised: 1200000, goal: 1000000 });
    expect(meter.style.getPropertyValue("--level")).toBe("1");
  });

  it("drives the fill mask, its gradient layer and the tag track by transform", () => {
    const { container } = draw({ raised: 650000, goal: 1000000 });
    const mask = part(container, "[data-fill]");
    const gradient = mask.firstElementChild;
    expect(mask.style.transform).toBe("translateY(calc((1 - var(--level)) * 100%))");
    expect(gradient).toBeInstanceOf(HTMLElement);
    expect((gradient as HTMLElement).style.transform).toBe(
      "translateY(calc((var(--level) - 1) * 100%))",
    );
    expect(part(container, "[data-tag-track]").style.transform).toBe(
      "translateY(calc(var(--level) * -100%))",
    );
  });

  it("shows the tag text, true up to the 999 percent cap", () => {
    const { container, props } = draw({ raised: 650000, goal: 1000000 });
    expect(within(part(container, "[data-fit]")).getByText("65%")).toBeInTheDocument();
    expect(props.progress.percentLabel).toBe("65%");
  });

  it("steps the tag's fit from its length by TAG_FIT", () => {
    const stepFor = (raised: number): string | null => {
      const { container, props, unmount } = draw({ raised, goal: 1000000 });
      const step = part(container, "[data-fit]").getAttribute("data-fit");
      expect(step).toBe(String(fitStep(codePointLength(props.progress.percentLabel), TAG_FIT)));
      unmount();
      return step;
    };
    // 65% (3 characters), 100% (4), 999%+ (5)
    expect([stepFor(650000), stepFor(1000000), stepFor(12345600)]).toEqual(["0", "1", "2"]);
  });
});

describe("Thermometer paws", () => {
  /** The four paw wrappers, in order, and each one's svg. */
  function paws(container: HTMLElement) {
    return [...container.querySelectorAll<HTMLElement>("[data-paw]")];
  }
  const litOf = (container: HTMLElement) =>
    paws(container).map((paw) => paw.querySelector("svg")?.getAttribute("data-lit"));

  it("draws four paws, each lit as its milestone says, with its label", () => {
    const { container, props } = draw({ raised: 650000, goal: 1000000 });
    const wrappers = paws(container);
    expect(wrappers).toHaveLength(4);
    props.progress.milestones.forEach((milestone, index) => {
      const paw = wrappers[index];
      expect(paw?.querySelector("svg")).toHaveAttribute("data-lit", String(milestone.lit));
      expect(paw).toHaveTextContent(milestone.label);
    });
    expect(litOf(container)).toEqual(["true", "true", "false", "false"]);
  });

  it("labels the last paw with the goal in short form", () => {
    const { container } = draw({ raised: 650000, goal: 1000000 });
    expect(paws(container).map((paw) => paw.textContent)).toEqual(["25%", "50%", "75%", "$10K"]);
  });

  it("places each paw at its share of the scale box from the bottom", () => {
    const { container } = draw({ raised: 650000, goal: 1000000 });
    expect(paws(container).map((paw) => paw.style.bottom)).toEqual(["25%", "50%", "75%", "100%"]);
  });

  it("lights all four paws at the goal", () => {
    const { container } = draw({ raised: 1000000, goal: 1000000 });
    expect(litOf(container)).toEqual(["true", "true", "true", "true"]);
  });

  it("lights no paw at zero", () => {
    const { container } = draw({ raised: 0, goal: 1000000 });
    expect(litOf(container)).toEqual(["false", "false", "false", "false"]);
  });
});

describe("Thermometer highlight", () => {
  it("is off by default", () => {
    const { container } = draw({ raised: 650000, goal: 1000000 });
    const marked = [...container.querySelectorAll("[data-highlighted]")];
    expect(marked).toHaveLength(2);
    for (const element of marked) expect(element).toHaveAttribute("data-highlighted", "false");
  });

  it("marks the tube and the bulb when highlighted", () => {
    const { container } = draw({ raised: 650000, goal: 1000000 }, { highlighted: true });
    const [tube, bulb, ...rest] = [...container.querySelectorAll("[data-highlighted]")];
    expect(rest).toHaveLength(0);
    expect(tube).toHaveAttribute("data-highlighted", "true");
    expect(bulb).toHaveAttribute("data-highlighted", "true");
    expect(tube?.querySelector("[data-fill]")).not.toBeNull();
  });
});
