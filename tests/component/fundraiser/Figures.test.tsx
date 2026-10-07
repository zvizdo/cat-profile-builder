import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { describeProgress } from "@/core/fundraiser/progress";
import { Figures, type AmountsEditing } from "@/ui/fundraiser/Figures";
import { REFUSAL_ID } from "@/ui/fundraiser/EditRow";

// The amount raised and the goal line: plain text until an `amounts` session is open, then two
// `InPlaceField`s standing in the very same elements. A CSS module is an empty proxy in jsdom,
// so these read structure, text and aria; that no pixel moves is proved by bounding boxes in
// the browser (T017's live check, T020).

const PLAIN = describeProgress(650_000, 1_000_000);
const OPEN: AmountsEditing = { raised: "$6,500", goal: "$10,000", refusals: {} };

function handlers() {
  return { onChange: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() };
}

function show(editing: AmountsEditing | null, parts = PLAIN, field = handlers()) {
  const view = render(<Figures parts={parts} editing={editing} field={field} />);
  return { ...view, field };
}

function raisedP(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>("[data-raised]");
  if (!found) throw new Error("no amount raised element");
  return found;
}

function goalP(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>("[data-goal-line]");
  if (!found) throw new Error("no goal line element");
  return found;
}

describe("Figures as plain text", () => {
  it("shows the amount raised and the goal line, with no field", () => {
    const { container } = show(null);
    expect(raisedP(container)).toHaveTextContent(/^\$6,500$/);
    expect(goalP(container)).toHaveTextContent("raised of $10,000 goal");
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("is one figures region, so a pointer between the two lines stays inside it", () => {
    const { container } = show(null);
    const region = container.querySelector("[data-figures]");
    expect(region).not.toBeNull();
    expect(region).toContainElement(raisedP(container));
    expect(region).toContainElement(goalP(container));
  });

  it("shows the Goal reached pill once raised reaches the goal", () => {
    const { container } = show(null, describeProgress(1_200_000, 1_000_000));
    expect(within(goalP(container)).getByText("Goal reached")).toBeInTheDocument();
  });

  it("draws the figures as text nodes, never markup", () => {
    const { container } = show(null);
    expect(raisedP(container).children).toHaveLength(0);
  });
});

describe("Figures while the amounts are open", () => {
  it("turns the two figures into two labelled one-line fields holding the drafts", () => {
    show(OPEN);
    expect(screen.getByRole("textbox", { name: "Amount raised" })).toHaveValue("$6,500");
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue("$10,000");
  });

  it("puts each field in the element that held its text, and keeps the words around the goal", () => {
    const { container } = show(OPEN);
    expect(raisedP(container)).toContainElement(
      screen.getByRole("textbox", { name: "Amount raised" }),
    );
    const goalLine = goalP(container);
    expect(goalLine).toContainElement(screen.getByRole("textbox", { name: "Goal" }));
    // The field's hidden mirror copy of its text counts as text here; a reader never hears it.
    expect(goalLine).toHaveTextContent(/^raised of .* goal$/);
  });

  it("keeps the same elements when it opens and closes, so nothing is rebuilt around them", () => {
    const field = handlers();
    const { container, rerender } = render(<Figures parts={PLAIN} editing={null} field={field} />);
    const before = [
      container.querySelector("[data-figures]"),
      raisedP(container),
      goalP(container),
    ];
    rerender(<Figures parts={PLAIN} editing={OPEN} field={field} />);
    expect([
      container.querySelector("[data-figures]"),
      raisedP(container),
      goalP(container),
    ]).toEqual(before);
    rerender(<Figures parts={PLAIN} editing={null} field={field} />);
    expect(raisedP(container)).toBe(before[1]);
  });

  it("keeps the Goal reached pill beside the goal line while editing", () => {
    const { container } = show(OPEN, describeProgress(1_200_000, 1_000_000));
    expect(within(goalP(container)).getByText("Goal reached")).toBeInTheDocument();
  });

  it("sends each keystroke with the name of the field it came from", () => {
    const { field } = show(OPEN);
    fireEvent.change(screen.getByRole("textbox", { name: "Amount raised" }), {
      target: { value: "7,200" },
    });
    expect(field.onChange).toHaveBeenLastCalledWith("raised", "7,200");
    fireEvent.change(screen.getByRole("textbox", { name: "Goal" }), { target: { value: "9" } });
    expect(field.onChange).toHaveBeenLastCalledWith("goal", "9");
  });

  it("confirms on Enter and cancels on Escape, in either field", async () => {
    const user = userEvent.setup();
    const { field } = show(OPEN);
    await user.type(screen.getByRole("textbox", { name: "Amount raised" }), "{Enter}");
    await user.type(screen.getByRole("textbox", { name: "Goal" }), "{Enter}");
    expect(field.onConfirm).toHaveBeenCalledTimes(2);
    await user.type(screen.getByRole("textbox", { name: "Goal" }), "{Escape}");
    expect(field.onCancel).toHaveBeenCalledTimes(1);
  });

  it("sizes the amount from the draft being typed, so a long entry steps down instead of overflowing", () => {
    const { container, rerender } = show(OPEN);
    expect(raisedP(container)).toHaveAttribute("data-fit", "0");
    rerender(
      <Figures parts={PLAIN} editing={{ ...OPEN, raised: "$1,250,000.50" }} field={handlers()} />,
    );
    expect(raisedP(container)).toHaveAttribute("data-fit", "4");
  });

  it("sizes the plain amount from its own text", () => {
    const { container } = show(null, describeProgress(125_000_050, 9_999_999_999));
    expect(raisedP(container)).toHaveAttribute("data-fit", "4");
  });
});

describe("Figures after a refusal", () => {
  it("marks only the refused field, tied to its sentence by the edit row's id", () => {
    show({ ...OPEN, raised: "abc", refusals: { raised: "not-a-number" } });
    const raised = screen.getByRole("textbox", { name: "Amount raised" });
    expect(raised).toHaveAttribute("aria-invalid", "true");
    expect(raised).toHaveAttribute("aria-describedby", REFUSAL_ID.raised);
    const goal = screen.getByRole("textbox", { name: "Goal" });
    expect(goal).not.toHaveAttribute("aria-invalid");
    expect(goal).not.toHaveAttribute("aria-describedby");
  });

  it("marks both when both were refused", () => {
    show({ ...OPEN, raised: "abc", goal: "0", refusals: { raised: "not-a-number", goal: "zero" } });
    expect(screen.getByRole("textbox", { name: "Amount raised" })).toHaveAttribute(
      "aria-describedby",
      REFUSAL_ID.raised,
    );
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveAttribute(
      "aria-describedby",
      REFUSAL_ID.goal,
    );
  });
});
