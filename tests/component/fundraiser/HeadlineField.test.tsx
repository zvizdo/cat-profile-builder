import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeadlineField, type HeadlineFieldProps } from "@/ui/fundraiser/HeadlineField";
import { REFUSAL_ID } from "@/ui/fundraiser/EditRow";

// The headline as one piece: the heading with its button, and the in-place field that takes the
// button's place while a session is open. Layout is the browser check's (a CSS module is an empty
// proxy in jsdom); this proves the names, the words, the fit step and the wiring.

const HEADLINE = "Help Mochi get home";

function props(over: Partial<HeadlineFieldProps> = {}): HeadlineFieldProps {
  return {
    headline: HEADLINE,
    editing: null,
    canEdit: true,
    button: { ref: createRef<HTMLButtonElement>(), onClick: vi.fn() },
    field: { onChange: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() },
    ...over,
  };
}

function heading(): HTMLElement {
  return screen.getByRole("heading", { level: 1 });
}

describe("the headline in the editing view", () => {
  it("is a button inside the one h1, named by its own text (label in name)", () => {
    render(<HeadlineField {...props()} />);
    const button = screen.getByRole("button", { name: HEADLINE });
    expect(heading()).toContainElement(button);
    expect(button).toHaveAccessibleName(HEADLINE);
  });

  it("says 'Edit headline' as a description, not as part of the name", () => {
    render(<HeadlineField {...props()} />);
    const button = screen.getByRole("button", { name: HEADLINE });
    expect(button).toHaveAccessibleDescription("Edit headline");
  });

  it("opens on a click", () => {
    const onClick = vi.fn();
    render(<HeadlineField {...props({ button: { ref: createRef(), onClick } })} />);
    fireEvent.click(screen.getByRole("button", { name: HEADLINE }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("carries the fit step of the headline's length", () => {
    const { rerender } = render(<HeadlineField {...props()} />);
    expect(heading()).toHaveAttribute("data-fit", "0");
    rerender(<HeadlineField {...props({ headline: "x".repeat(25) })} />);
    expect(heading()).toHaveAttribute("data-fit", "1");
    rerender(<HeadlineField {...props({ headline: "x".repeat(41) })} />);
    expect(heading()).toHaveAttribute("data-fit", "2");
  });

  it("shows the words as text, never as markup", () => {
    render(<HeadlineField {...props({ headline: "<img src=x onerror=alert(1)>" })} />);
    expect(heading().querySelector("img")).toBeNull();
    expect(heading()).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});

describe("the headline in display state", () => {
  it("is a plain text node: no button, no description, nothing to focus", () => {
    render(<HeadlineField {...props({ canEdit: false })} />);
    expect(heading().childElementCount).toBe(0);
    expect(heading().firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(heading()).toHaveTextContent(HEADLINE);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("the headline field while a session is open", () => {
  const editing = { text: HEADLINE };

  it("is a wrapping textarea named Headline, holding the draft, inside the h1 in [data-headline]", () => {
    render(<HeadlineField {...props({ editing })} />);
    const box = screen.getByRole("textbox", { name: "Headline" });
    expect(box.tagName).toBe("TEXTAREA");
    expect(box).toHaveValue(HEADLINE);
    expect(heading()).toContainElement(box);
    expect(box.closest("[data-headline]")).not.toBeNull();
  });

  it("takes focus as it opens, with the caret after the text, so a person can type at once", () => {
    render(<HeadlineField {...props({ editing })} />);
    const box = screen.getByRole("textbox", { name: "Headline" });
    expect(box).toHaveFocus();
    expect(box).toHaveProperty("selectionStart", HEADLINE.length);
    expect(box).toHaveProperty("selectionEnd", HEADLINE.length);
  });

  it("keeps the button mounted but out of reach, so a keyboard close can send focus back to it", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<HeadlineField {...props({ editing, button: { ref, onClick: vi.fn() } })} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toHaveAttribute("tabindex", "-1");
    expect(ref.current).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sizes by the draft, so a long entry steps down instead of running out of the stage", () => {
    render(<HeadlineField {...props({ editing: { text: "y".repeat(45) } })} />);
    expect(heading()).toHaveAttribute("data-fit", "2");
  });

  it("passes every change, Enter and Escape to the session", () => {
    const field = { onChange: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() };
    render(<HeadlineField {...props({ editing, field })} />);
    const box = screen.getByRole("textbox", { name: "Headline" });
    fireEvent.change(box, { target: { value: "Spring" } });
    expect(field.onChange).toHaveBeenCalledWith("headline", "Spring");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(field.onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(box, { key: "Escape" });
    expect(field.onCancel).toHaveBeenCalledTimes(1);
  });

  it("is marked invalid and tied to its refusal sentence only after a refusal", () => {
    const { rerender } = render(<HeadlineField {...props({ editing })} />);
    const box = screen.getByRole("textbox", { name: "Headline" });
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(box).not.toHaveAttribute("aria-describedby");
    rerender(<HeadlineField {...props({ editing: { text: "", refusal: "empty" } })} />);
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAttribute("aria-describedby", REFUSAL_ID.headline);
  });
});
