import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/ui/shared/Modal";

// The remove-section modal from CONTENT.md, driven by a real opener so focus has somewhere
// to come from and go back to.
const TITLE = "Remove the gallery?";
const BODY =
  "Three photos come off Charlotte's page. They stay in your media library, and one undo brings the section back.";

function Harness({ onRemove = () => {} }: { onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Remove gallery
      </button>
      <button type="button">Elsewhere</button>
      <Modal
        open={open}
        title={TITLE}
        body={BODY}
        safeAction={{ label: "Keep it", onClick: () => setOpen(false) }}
        dangerAction={{
          label: "Remove section",
          onClick: () => {
            onRemove();
            setOpen(false);
          },
          destructive: true,
        }}
      />
    </>
  );
}

async function openModal() {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Remove gallery" });
  await user.click(opener);
  return { user, opener };
}

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a labelled modal dialog whose safe button takes focus on open", async () => {
    await openModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(TITLE);
    expect(dialog).toHaveAccessibleDescription(BODY);
    expect(screen.getByRole("button", { name: "Keep it" })).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab inside the dialog", async () => {
    const { user } = await openModal();
    const keep = screen.getByRole("button", { name: "Keep it" });
    const remove = screen.getByRole("button", { name: "Remove section" });

    await user.tab();
    expect(remove).toHaveFocus();
    await user.tab();
    expect(keep).toHaveFocus();
    await user.tab({ shift: true });
    expect(remove).toHaveFocus();
    await user.tab({ shift: true });
    expect(keep).toHaveFocus();
  });

  it("Escape runs the safe action and focus returns to the opener", async () => {
    const { user, opener } = await openModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("after a scrim click, Escape still runs the safe action and closes", async () => {
    const { user, opener } = await openModal();
    const overlay = screen.getByRole("dialog").parentElement!;
    await user.click(overlay);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("after a scrim click, Tab and Shift+Tab land inside the dialog", async () => {
    const { user } = await openModal();
    const overlay = screen.getByRole("dialog").parentElement!;
    const dialog = screen.getByRole("dialog");

    await user.click(overlay);
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Remove section" })).toHaveFocus();

    await user.click(overlay);
    await user.tab();
    expect(screen.getByRole("button", { name: "Keep it" })).toHaveFocus();
  });

  it("the danger button runs its action from the keyboard and is clay, never blue", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<Harness onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Remove gallery" }));

    const remove = screen.getByRole("button", { name: "Remove section" });
    expect(remove.className).toMatch(/clay/);
    expect(remove.className).not.toMatch(/blue/);
    await user.tab();
    expect(remove).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders only the safe button when dangerAction is omitted (a picker, not a question)", async () => {
    const user = userEvent.setup();
    render(
      <Modal
        open
        title="Add a section"
        body="Pick what comes next on the page."
        safeAction={{ label: "Cancel", onClick: () => {} }}
      >
        <button type="button">Bio</button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Bio" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("a non-destructive danger action is the primary blue button", async () => {
    render(
      <Modal
        open
        title="That clip is 2:07. The carousel plays 12 seconds."
        body="Pick the twelve seconds worth watching."
        safeAction={{ label: "Cancel", onClick: () => {} }}
        dangerAction={{ label: "Use this stretch", onClick: () => {} }}
      />,
    );
    const use = screen.getByRole("button", { name: "Use this stretch" });
    expect(use.className).toMatch(/bg-blue/);
    expect(use.className).not.toMatch(/clay/);
  });

  it("a sheet's footer stays at the bottom of the panel's scroll; a question's does not (F39)", () => {
    const question = render(
      <Modal
        open
        title={TITLE}
        body={BODY}
        safeAction={{ label: "Keep it", onClick: () => {} }}
        dangerAction={{ label: "Remove section", onClick: () => {} }}
      />,
    );
    // jsdom lays nothing out, so the contract is the class the stylesheet keys on.
    const questionFooter = screen.getByRole("button", { name: "Keep it" }).parentElement;
    expect(questionFooter).not.toHaveClass("sticky");
    question.unmount();
    render(
      <Modal
        open
        size="sheet"
        title="Where should the crop hold on?"
        body="Click her face."
        safeAction={{ label: "Cancel", onClick: () => {} }}
        dangerAction={{ label: "Save focal point", onClick: () => {} }}
      />,
    );
    const sheetFooter = screen.getByRole("button", { name: "Save focal point" }).parentElement;
    expect(sheetFooter).toHaveClass("sticky", "bottom-0");
  });
});
