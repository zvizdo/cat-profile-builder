import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IDLE_STATE, type EditState } from "@/core/fundraiser/edit-session";
import { EditRow, REFUSAL_ID } from "@/ui/fundraiser/EditRow";
import type { DoneProps } from "@/ui/fundraiser/use-edit-session";

// The shared edit row (editing-interaction.md → One shared edit row): one reserved row, empty
// when nothing is open, holding Done and the refusal sentence whichever target is open.

function doneProps(): DoneProps {
  return { onPointerDown: vi.fn(), onMouseDown: vi.fn(), onClick: vi.fn() };
}

const AMOUNTS: EditState = {
  kind: "amounts",
  raised: "$6,500",
  goal: "$10,000",
  sticky: true,
  refusals: {},
};

function show(state: EditState, done = doneProps()) {
  const view = render(<EditRow state={state} done={done} />);
  const row = view.container.querySelector<HTMLElement>("[data-edit-row]");
  if (!row) throw new Error("no edit row");
  return { ...view, row, done };
}

describe("EditRow", () => {
  it("is present and empty while nothing is open, so the space is kept", () => {
    const { row } = show(IDLE_STATE);
    expect(row).toBeEmptyDOMElement();
  });

  it("holds Done, a real button named Done, while the amounts are open", () => {
    const { row } = show(AMOUNTS);
    const button = screen.getByRole("button", { name: "Done" });
    expect(row).toContainElement(button);
    expect(button).toHaveAttribute("type", "button");
  });

  it("holds Done while the headline is open too", () => {
    show({ kind: "headline", text: "Spring" });
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("hands Done's press to the hook: pointer and mouse down are the hook's, the click confirms", () => {
    const { done } = show(AMOUNTS);
    const button = screen.getByRole("button", { name: "Done" });
    fireEvent.pointerDown(button);
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    expect(done.onPointerDown).toHaveBeenCalledTimes(1);
    expect(done.onMouseDown).toHaveBeenCalledTimes(1);
    expect(done.onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps an empty alert in the row while open, so a refusal is announced when it arrives", () => {
    show(AMOUNTS);
    const alert = screen.getByRole("alert");
    expect(alert).toBeEmptyDOMElement();
  });

  it("says why the amount raised was refused, in the row, in the contract's words", () => {
    show({ ...AMOUNTS, raised: "abc", refusals: { raised: "not-a-number" } });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "That doesn't look like an amount. Use digits, like 6,500 or 6,500.50.",
    );
    expect(alert.querySelector(`#${REFUSAL_ID.raised}`)).not.toBeNull();
  });

  it("says why the goal was refused, under its own id", () => {
    show({ ...AMOUNTS, goal: "0", refusals: { goal: "zero" } });
    expect(screen.getByRole("alert")).toHaveTextContent("The goal has to be more than $0.");
    expect(screen.getByRole("alert").querySelector(`#${REFUSAL_ID.goal}`)).not.toBeNull();
  });

  it("names the field when both were refused, so two like sentences are not confused", () => {
    show({
      ...AMOUNTS,
      raised: "",
      goal: "",
      refusals: { raised: "empty", goal: "empty" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Amount raised: Type an amount, for example 6,500. Goal: Type an amount, for example 6,500.",
    );
  });

  it("says why the headline was refused", () => {
    show({ kind: "headline", text: "", refusal: "empty" });
    expect(screen.getByRole("alert").querySelector(`#${REFUSAL_ID.headline}`)).toHaveTextContent(
      "The headline can't be empty.",
    );
  });

  it("draws a sentence as text, never as markup", () => {
    show({ ...AMOUNTS, refusals: { raised: "negative" } });
    expect(screen.getByRole("alert").querySelector(`#${REFUSAL_ID.raised}`)?.children).toHaveLength(
      0,
    );
  });
});
