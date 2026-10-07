import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { InPlaceField, type InPlaceFieldProps } from "@/ui/fundraiser/InPlaceField";

// The in-place field: a real input or textarea laid over a hidden copy of its own text, so the
// box is as wide (and for `wrap`, as tall) as the text it stands in for. A CSS module is an empty
// proxy in jsdom, so the grid sizing, the underline and the focus ring are read in the browser
// (T017/T019), not here. These tests cover what the component does: names, keys, paste, ARIA.

type Callbacks = Pick<InPlaceFieldProps, "onChange" | "onConfirm" | "onCancel">;

function fakes() {
  return { onChange: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() } satisfies Callbacks;
}

/** The parent a real caller is: it owns the text and hands every change back in. */
function Harness(props: Partial<InPlaceFieldProps> & { start: string; calls?: Callbacks }) {
  const { start, calls, ...rest } = props;
  const [value, setValue] = useState(start);
  return (
    <InPlaceField
      kind="line"
      label="Amount raised"
      className="x"
      onConfirm={calls?.onConfirm ?? vi.fn()}
      onCancel={calls?.onCancel ?? vi.fn()}
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        calls?.onChange(next);
      }}
    />
  );
}

function mirrorOf(container: HTMLElement): Element {
  const mirror = container.querySelector('[aria-hidden="true"]');
  if (!mirror) throw new Error("no mirror in the field");
  return mirror;
}

describe("InPlaceField control", () => {
  it("is a real text input named by its label when the kind is line", () => {
    render(<Harness start="$6,500" label="Amount raised" />);
    const field = screen.getByRole("textbox", { name: "Amount raised" });
    expect(field.tagName).toBe("INPUT");
    expect(field).toHaveAttribute("type", "text");
    expect(field).toHaveValue("$6,500");
  });

  it("is a real one-row textarea named by its label when the kind is wrap", () => {
    render(<Harness kind="wrap" start="Help Mochi heal" label="Headline" />);
    const field = screen.getByRole("textbox", { name: "Headline" });
    expect(field.tagName).toBe("TEXTAREA");
    expect(field).toHaveAttribute("rows", "1");
    expect(field).toHaveValue("Help Mochi heal");
  });

  it("is never contenteditable, so no markup can be pasted into it", () => {
    for (const kind of ["line", "wrap"] as const) {
      const { container, unmount } = render(<Harness kind={kind} start="x" />);
      expect(container.querySelector("[contenteditable]")).toBeNull();
      unmount();
    }
  });

  it("passes the on-screen keyboard hint through to the control", () => {
    render(<Harness start="10" inputMode="decimal" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", "decimal");
  });

  it.each(["line", "wrap"] as const)(
    "turns off correction and capitals on the %s control",
    (kind) => {
      render(<Harness kind={kind} start="Mochi" />);
      const field = screen.getByRole("textbox");
      expect(field).toHaveAttribute("spellcheck", "false");
      expect(field).toHaveAttribute("autocorrect", "off");
      expect(field).toHaveAttribute("autocapitalize", "off");
    },
  );

  it("puts the caller's class on the outer box that holds the control and its mirror", () => {
    const { container } = render(<Harness start="x" className="from-caller" />);
    const outer = container.firstElementChild;
    expect(outer).toHaveClass("from-caller");
    expect(outer).toContainElement(screen.getByRole("textbox"));
    expect(outer).toContainElement(mirrorOf(container) as HTMLElement);
  });
});

describe("InPlaceField mirror", () => {
  it.each(["line", "wrap"] as const)(
    "holds the same text as the %s control, hidden from assistive technology",
    (kind) => {
      const { container } = render(<Harness kind={kind} start="$6,500.50" />);
      const mirror = mirrorOf(container);
      expect(mirror).toHaveAttribute("aria-hidden", "true");
      expect(mirror.textContent?.trimEnd()).toBe("$6,500.50");
      expect(screen.getAllByText("$6,500.50", { ignore: "input, textarea" })).toHaveLength(1);
    },
  );

  it("follows every change, so the box grows and shrinks with the text", async () => {
    const { container } = render(<Harness start="12" />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "345");
    expect(mirrorOf(container).textContent?.trimEnd()).toBe("12345");
    await user.keyboard("{Backspace}{Backspace}");
    expect(mirrorOf(container).textContent?.trimEnd()).toBe("123");
  });

  it("keeps room for the caret in the wrapping kind as a hairline-wide box too, not a space", () => {
    // A trailing space is as wide as the text's own space: in a centred heading it widened the
    // line and shifted the words by half of it when the field opened (measured: 20px at 1920).
    const { container, rerender } = render(
      <InPlaceField
        kind="wrap"
        label="L"
        value="ab "
        onChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(mirrorOf(container).textContent).toBe("ab ");
    expect(mirrorOf(container).querySelector("[data-caret-room]")).not.toBeNull();
    rerender(
      <InPlaceField
        kind="wrap"
        label="L"
        value=""
        onChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(mirrorOf(container).querySelector("[data-caret-room]")).not.toBeNull();
  });

  it("keeps room for the caret in the one-line kind as a hairline-wide box, not a space", () => {
    // A space is a quarter of the text's size wide: the words after the field would move when
    // it opened. The box is one hairline, and the stylesheet takes the same hairline back.
    const { container, rerender } = render(
      <InPlaceField
        kind="line"
        label="L"
        value="ab "
        onChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(mirrorOf(container).textContent).toBe("ab ");
    expect(mirrorOf(container).querySelector("[data-caret-room]")).not.toBeNull();
    rerender(
      <InPlaceField
        kind="line"
        label="L"
        value=""
        onChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(mirrorOf(container).textContent).toBe("");
    expect(mirrorOf(container).querySelector("[data-caret-room]")).not.toBeNull();
  });
});

describe("InPlaceField keyboard path", () => {
  it.each(["line", "wrap"] as const)("Enter confirms in the %s kind", async (kind) => {
    const calls = fakes();
    render(<Harness kind={kind} start="abc" calls={calls} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Enter}");
    expect(calls.onConfirm).toHaveBeenCalledTimes(1);
    expect(calls.onCancel).not.toHaveBeenCalled();
  });

  it("Enter never inserts a newline in wrap, with or without Shift", async () => {
    const calls = fakes();
    render(<Harness kind="wrap" start="abc" calls={calls} />);
    const user = userEvent.setup();
    const field = screen.getByRole("textbox");
    await user.click(field);
    await user.keyboard("{Enter}{Shift>}{Enter}{/Shift}");
    expect(field).toHaveValue("abc");
    expect(calls.onChange).not.toHaveBeenCalled();
    expect(calls.onConfirm).toHaveBeenCalledTimes(2);
  });

  it("does not let Enter reach a form around the field", async () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <Harness start="abc" />
      </form>,
    );
    await userEvent.setup().type(screen.getByRole("textbox"), "{Enter}");
    expect(submit).not.toHaveBeenCalled();
  });

  it("Escape cancels in both kinds and never confirms", async () => {
    for (const kind of ["line", "wrap"] as const) {
      const calls = fakes();
      const { unmount } = render(<Harness kind={kind} start="abc" calls={calls} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("textbox"));
      await user.keyboard("{Escape}");
      expect(calls.onCancel).toHaveBeenCalledTimes(1);
      expect(calls.onConfirm).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("ignores Enter and Escape while an input method is composing", () => {
    const calls = fakes();
    render(<Harness kind="wrap" start="abc" calls={calls} />);
    const field = screen.getByRole("textbox");
    fireEvent.keyDown(field, { key: "Enter", isComposing: true });
    fireEvent.keyDown(field, { key: "Escape", isComposing: true });
    expect(calls.onConfirm).not.toHaveBeenCalled();
    expect(calls.onCancel).not.toHaveBeenCalled();
  });

  it("ignores the Enter and Escape Safari sends as keyCode 229 after compositionend", () => {
    const calls = fakes();
    render(<Harness kind="wrap" start="abc" calls={calls} />);
    const field = screen.getByRole("textbox");
    fireEvent.keyDown(field, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(field, { key: "Escape", keyCode: 229 });
    expect(calls.onConfirm).not.toHaveBeenCalled();
    expect(calls.onCancel).not.toHaveBeenCalled();
  });

  it.each(["insertLineBreak", "insertParagraph"])(
    "confirms on a virtual keyboard's %s, and inserts nothing",
    (inputType) => {
      const calls = fakes();
      render(<Harness kind="wrap" start="abc" calls={calls} />);
      const field = screen.getByRole("textbox");
      const event = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true });
      expect(fireEvent(field, event)).toBe(false);
      expect(calls.onConfirm).toHaveBeenCalledTimes(1);
      expect(field).toHaveValue("abc");
    },
  );

  it("leaves a composing line break, and every other kind of input, to the input method", () => {
    const calls = fakes();
    render(<Harness start="abc" calls={calls} />);
    const field = screen.getByRole("textbox");
    const composing = new InputEvent("beforeinput", {
      inputType: "insertLineBreak",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    const typing = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "x",
      bubbles: true,
      cancelable: true,
    });
    expect(fireEvent(field, composing)).toBe(true);
    expect(fireEvent(field, typing)).toBe(true);
    expect(calls.onConfirm).not.toHaveBeenCalled();
  });

  it("does not stop the default of an Enter pressed while composing", () => {
    render(<Harness kind="wrap" start="abc" />);
    const proceeded = fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "Enter",
      isComposing: true,
    });
    expect(proceeded).toBe(true);
  });
});

describe("InPlaceField paste and newlines", () => {
  it('turns a pasted "a\\nb" into "a b" in wrap', async () => {
    const calls = fakes();
    render(<Harness kind="wrap" start="" calls={calls} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("textbox"));
    await user.paste("a\nb");
    expect(screen.getByRole("textbox")).toHaveValue("a b");
    expect(calls.onChange).toHaveBeenLastCalledWith("a b");
  });

  it("turns each line break, whatever its kind, into one space (a run of them is a run of spaces)", () => {
    const calls = fakes();
    render(<Harness kind="wrap" start="" calls={calls} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a\r\nb\rc\n\nd" } });
    expect(calls.onChange).toHaveBeenLastCalledWith("a b c  d");
  });

  it("strips newlines in the line kind too, even where the browser would not", () => {
    // jsdom (like a browser) strips newlines from an input's value on its own, which would hide a
    // missing replace; this gives the input a value that still holds one, as an odd platform might.
    const calls = fakes();
    render(<Harness start="" calls={calls} />);
    const field = screen.getByRole("textbox") as HTMLInputElement;
    let raw = "1\n2";
    Object.defineProperty(field, "value", {
      configurable: true,
      get: () => raw,
      set: (next: string) => {
        raw = next;
      },
    });
    fireEvent.change(field);
    expect(calls.onChange).toHaveBeenLastCalledWith("1 2");
    expect(raw).toBe("1 2");
  });

  it.each([
    ["in the middle of the text", 1, 1, "Xa bYZ", 4],
    ["over a selection", 1, 2, "Xa bZ", 4],
    ["at the very start", 0, 0, "a bXYZ", 3],
  ])("keeps the caret after a pasted line break %s", async (_name, from, to, text, caret) => {
    render(<Harness kind="wrap" start="XYZ" />);
    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    const user = userEvent.setup();
    await user.click(field);
    field.setSelectionRange(from, to);
    await user.paste("a\nb");
    expect(field).toHaveValue(text);
    expect([field.selectionStart, field.selectionEnd]).toEqual([caret, caret]);
  });
});

describe("InPlaceField accessibility state", () => {
  it("marks nothing invalid and describes nothing by default", () => {
    render(<Harness start="1" describedBy="refusal" />);
    const field = screen.getByRole("textbox");
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(field).not.toHaveAttribute("aria-describedby");
  });

  it.each(["line", "wrap"] as const)(
    "reflects invalid and describedBy on the %s control",
    (kind) => {
      render(<Harness kind={kind} start="x" invalid describedBy="refusal" />);
      const field = screen.getByRole("textbox");
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAttribute("aria-describedby", "refusal");
    },
  );

  it("marks invalid without a description when none is given", () => {
    render(<Harness start="x" invalid />);
    const field = screen.getByRole("textbox");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).not.toHaveAttribute("aria-describedby");
  });

  it("is reachable by Tab and keeps the text readable once, not twice", async () => {
    render(<Harness start="$6,500" />);
    await userEvent.setup().tab();
    expect(screen.getByRole("textbox", { name: "Amount raised" })).toHaveFocus();
    expect(screen.queryAllByRole("textbox")).toHaveLength(1);
  });
});

describe("InPlaceField hit area (T026, F6)", () => {
  it("sends a press on the box around the control (the stylesheet's hit area) to the control", () => {
    const { container } = render(<Harness start="$10,000" />);
    const box = container.firstElementChild as HTMLElement;
    const control = screen.getByRole("textbox", { name: "Amount raised" });
    expect(control).not.toHaveFocus();
    const notCancelled = fireEvent.pointerDown(box);
    expect(control).toHaveFocus();
    // Cancelled, so the browser does not then move focus to the body.
    expect(notCancelled).toBe(false);
  });

  it("leaves a press on the control itself alone, so the caret lands where it was pressed", () => {
    render(<Harness start="$10,000" />);
    const control = screen.getByRole("textbox", { name: "Amount raised" });
    expect(fireEvent.pointerDown(control)).toBe(true);
  });
});
