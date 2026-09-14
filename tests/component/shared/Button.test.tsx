import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/ui/shared/Button";

describe("Button variants", () => {
  it("destructive is clay and never blue; ghost is blue text", () => {
    render(
      <>
        <Button variant="destructive">Remove section</Button>
        <Button variant="ghost">Skip for now</Button>
      </>,
    );
    const destructive = screen.getByRole("button", { name: "Remove section" });
    expect(destructive.className).toMatch(/clay/);
    expect(destructive.className).not.toMatch(/blue/);
    expect(screen.getByRole("button", { name: "Skip for now" }).className).toMatch(/text-blue/);
  });

  it("danger is the ghost in clay: text only, clay, never blue (F38)", () => {
    render(<Button variant="danger">Remove</Button>);
    const danger = screen.getByRole("button", { name: "Remove" });
    expect(danger).toHaveClass("text-clay", "bg-transparent");
    expect(danger.className).not.toMatch(/blue/);
    expect(danger.className).not.toMatch(/border/);
  });

  it("a disabled button is skipped by Tab and does not fire", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <>
        <Button disabled onClick={onClick}>
          Publish
        </Button>
        <Button>Preview</Button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Preview" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("dense is the 13px chrome size on 8/16 padding, still 44px tall; the default is untouched", () => {
    render(
      <>
        <Button dense>Publish</Button>
        <Button dense variant="secondary">
          Preview
        </Button>
        <Button>Save</Button>
      </>,
    );
    const publish = screen.getByRole("button", { name: "Publish" });
    const preview = screen.getByRole("button", { name: "Preview" });
    const save = screen.getByRole("button", { name: "Save" });
    for (const dense of [publish, preview]) {
      expect(dense).toHaveClass("text-ui-dense", "py-8", "px-16", "min-h-44");
      expect(dense).not.toHaveClass("text-ui", "py-12", "px-20");
    }
    // The comp's Publish is 500 and its Preview 400: only the dense primary keeps the weight.
    expect(publish).toHaveClass("font-medium");
    expect(preview).not.toHaveClass("font-medium");
    expect(save).toHaveClass("text-ui", "py-12", "px-20");
    expect(save).not.toHaveClass("text-ui-dense", "font-medium");
  });

  it("hands a ref to the native element", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Keep it</Button>);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Keep it" }));
  });
});
