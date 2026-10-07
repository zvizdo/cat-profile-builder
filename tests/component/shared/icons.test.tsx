import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Expand } from "@/ui/shared/icons";

describe("Expand", () => {
  it("renders four corner brackets in the 20px box, hidden from assistive technology", () => {
    const { container } = render(<Expand className="mine" />);
    const svg = container.querySelector("svg");
    if (!svg) throw new Error("Expand rendered no svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("viewBox", "0 0 20 20");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("stroke-width", "1.5");
    expect(svg).toHaveClass("mine");
    const d = svg.querySelector("path")?.getAttribute("d") ?? "";
    expect(d.match(/M/g)).toHaveLength(4);
  });
});
