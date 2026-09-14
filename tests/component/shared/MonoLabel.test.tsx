import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonoLabel } from "@/ui/shared/MonoLabel";

describe("MonoLabel", () => {
  it("renders the element `as` names, defaulting to span", () => {
    render(
      <>
        <MonoLabel>Actions</MonoLabel>
        <MonoLabel as="label" htmlFor="cat-name">
          Cat name
        </MonoLabel>
        <MonoLabel as="div">Status</MonoLabel>
      </>,
    );
    expect(screen.getByText("Actions").tagName).toBe("SPAN");
    const label = screen.getByText("Cat name");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveAttribute("for", "cat-name");
    expect(screen.getByText("Status").tagName).toBe("DIV");
    expect(screen.getByText("Actions").className).toMatch(/text-mono-label/);
  });

  it("keeps a reading in sentence case, without the label's tracking", () => {
    render(
      <>
        <MonoLabel>Focal</MonoLabel>
        <MonoLabel variant="reading">x 53%, y 41%</MonoLabel>
      </>,
    );
    expect(screen.getByText("Focal").className).toMatch(/uppercase/);
    const reading = screen.getByText("x 53%, y 41%");
    expect(reading.className).toMatch(/font-label/);
    expect(reading.className).toMatch(/tracking-normal/);
    expect(reading.className).not.toMatch(/uppercase/);
  });
});
