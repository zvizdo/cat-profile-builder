import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "@/ui/shared/IconButton";
import { Close, Remove } from "@/ui/shared/icons";

describe("IconButton", () => {
  it("is named by its required aria-label and its icon is hidden from assistive tech", () => {
    render(<IconButton icon={Close} aria-label="Close" />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("fires from Enter and Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon={Close} aria-label="Close" onClick={onClick} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("the danger variant is clay and never blue; ghost is neither", () => {
    render(
      <>
        <IconButton icon={Remove} aria-label="Remove section" variant="danger" />
        <IconButton icon={Close} aria-label="Close" />
      </>,
    );
    const danger = screen.getByRole("button", { name: "Remove section" });
    expect(danger.className).toMatch(/clay/);
    expect(danger.className).not.toMatch(/blue/);
    const ghost = screen.getByRole("button", { name: "Close" });
    expect(ghost.className).not.toMatch(/clay|blue/);
  });

  it("requires aria-label at the type level", () => {
    // @ts-expect-error -- aria-label is the button's only name, so it cannot be left off.
    render(<IconButton icon={Close} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
