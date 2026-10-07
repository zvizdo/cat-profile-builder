import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PawMark } from "@/ui/fundraiser/PawMark";

function paw(props: { lit: boolean; className?: string }) {
  const { container } = render(<PawMark {...props} />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("PawMark rendered no svg");
  return svg;
}

describe("PawMark", () => {
  it("is hidden from assistive technology and cannot take focus", () => {
    const svg = paw({ lit: true });
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });

  it("carries whether it is lit, so styling can tell the two apart", () => {
    expect(paw({ lit: true })).toHaveAttribute("data-lit", "true");
    expect(paw({ lit: false })).toHaveAttribute("data-lit", "false");
  });

  it("draws one pad and four toes as ellipses filled with the text colour", () => {
    const svg = paw({ lit: false });
    expect(svg).toHaveAttribute("viewBox", "0 0 100 100");
    expect(svg).toHaveAttribute("fill", "currentColor");
    const ellipses = [...svg.querySelectorAll("ellipse")].map((e) => ({
      cx: e.getAttribute("cx"),
      cy: e.getAttribute("cy"),
      rx: e.getAttribute("rx"),
      ry: e.getAttribute("ry"),
      transform: e.getAttribute("transform"),
    }));
    expect(ellipses).toEqual([
      { cx: "50", cy: "68", rx: "25", ry: "20", transform: null },
      { cx: "20", cy: "44", rx: "9", ry: "13", transform: "rotate(-22 20 44)" },
      { cx: "40", cy: "26", rx: "9.5", ry: "14", transform: null },
      { cx: "60", cy: "26", rx: "9.5", ry: "14", transform: null },
      { cx: "80", cy: "44", rx: "9", ry: "13", transform: "rotate(22 80 44)" },
    ]);
  });

  it("is sized from CSS: no width or height of its own, and it takes a class", () => {
    const svg = paw({ lit: true, className: "paw" });
    expect(svg).toHaveClass("paw");
    expect(svg).not.toHaveAttribute("width");
    expect(svg).not.toHaveAttribute("height");
    expect(svg).not.toHaveAttribute("style");
  });
});
