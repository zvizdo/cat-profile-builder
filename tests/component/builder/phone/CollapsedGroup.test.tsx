import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CollapsedGroup } from "@/ui/builder/phone/CollapsedGroup";

// One of the phone's two collapsed groups at the top of the stack (design 2026-09-13 §2):
// a region named by its label, whose head row is a 44px button reading the one-line
// summary, with a chevron; the fields inside exist only while it is open, so a closed
// group has nothing for the keyboard to fall into.

/** A tiny controlled owner, as `PhoneColumn` is. */
function Harness({ open: initial = false }: { open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <CollapsedGroup
      label="Facts"
      line="Vini · 2 years · male"
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <label>
        Name <input defaultValue="Vini" />
      </label>
    </CollapsedGroup>
  );
}

describe("CollapsedGroup", () => {
  it("is a region named by its label, closed by default, reading the line on a 44px button", () => {
    render(<Harness />);
    const region = screen.getByRole("region", { name: "Facts" });
    const head = within(region).getByRole("button", { name: /Facts/ });
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(head).toHaveTextContent("Vini · 2 years · male");
    expect(head.className).toMatch(/min-h-44/);
    expect(within(region).queryByRole("textbox", { name: "Name" })).toBeNull();
  });

  it("opens on a press, controls its body, and closes again", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const head = screen.getByRole("button", { name: /Facts/ });
    await user.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
    const body = document.getElementById(head.getAttribute("aria-controls") ?? "");
    expect(body).not.toBeNull();
    expect(within(body as HTMLElement).getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    await user.click(head);
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  });

  it("starts open when told to, and Enter on the head toggles it (keyboard path)", async () => {
    const user = userEvent.setup();
    render(<Harness open />);
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    screen.getByRole("button", { name: /Facts/ }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  });

  it("calls onToggle once per press", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <CollapsedGroup
        label="Theme"
        line="Paper · warmth 0.50 · contrast 0.50"
        open={false}
        onToggle={onToggle}
      >
        <p>body</p>
      </CollapsedGroup>,
    );
    await user.click(screen.getByRole("button", { name: /Theme/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
