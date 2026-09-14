import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";

describe("StripedPlaceholder", () => {
  it("is a labelled, striped box with no button by default", () => {
    render(<StripedPlaceholder label="drop a photo" aspect="square" />);
    expect(screen.getByText("drop a photo")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.querySelector(".stripes")).not.toBeNull();
    expect(document.querySelector(".aspect-square")).not.toBeNull();
  });

  it("as a button it is focusable and fires on Enter and Space", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<StripedPlaceholder as="button" label="+ add section" onClick={onClick} />);
    const button = screen.getByRole("button", { name: "+ add section" });
    expect(button).toHaveAttribute("type", "button");
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
