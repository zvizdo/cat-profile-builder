import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { EditOperation } from "@/core/profile/operations";
import { FactsFields } from "@/ui/builder/FactsFields";

// The facts (T025; FR-014, FR-015): name, age, sex and the one-line tagline, each a
// `set_field` on the profile once the typing pauses, or at once on Enter or when the
// field is left. The tagline stops at 80 with a `{n}/80` counter; the cap is the schema's
// number, mirrored on the input so a volunteer sees it, never a second number.

const FACTS = { name: "", age: undefined, sex: undefined, tagline: undefined };

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
}

describe("FactsFields", () => {
  it("labels the four fields with their caps and the sex choices", () => {
    render(<FactsFields facts={FACTS} onApply={() => undefined} />);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute("maxLength", "60");
    expect(screen.getByRole("textbox", { name: "Age" })).toHaveAttribute("maxLength", "30");
    expect(screen.getByRole("textbox", { name: "Tagline" })).toHaveAttribute("maxLength", "80");
    const sex = screen.getByRole("combobox", { name: "Sex" });
    expect(sex).toHaveValue("");
    expect(Array.from(sex.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "not set",
      "female",
      "male",
      "unknown",
    ]);
    // "not set" is selectable at any time (F10), not just the empty state's own value.
    expect(screen.getByRole("option", { name: "not set" })).not.toBeDisabled();
    expect(screen.getByText("0/80")).toBeInTheDocument();
  });

  it("names the name and tagline placeholders by the recorded sex — F41", () => {
    const female = render(
      <FactsFields facts={{ ...FACTS, sex: "female" }} onApply={() => undefined} />,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "placeholder",
      "Her name",
    );
    expect(screen.getByRole("textbox", { name: "Tagline" })).toHaveAttribute(
      "placeholder",
      "One line under her name — or the bio's first sentence stands in",
    );
    female.unmount();

    const male = render(
      <FactsFields facts={{ ...FACTS, sex: "male" }} onApply={() => undefined} />,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "placeholder",
      "His name",
    );
    male.unmount();

    render(<FactsFields facts={FACTS} onApply={() => undefined} />);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "placeholder",
      "Their name",
    );
  });

  it("clears the sex back to not set on choice, at any time (F10)", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<FactsFields facts={{ ...FACTS, sex: "female" }} onApply={(op) => ops.push(op)} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Sex" }), "not set");
    expect(ops).toEqual([
      { op: "set_field", target: { kind: "profile" }, path: "sex", value: null },
    ]);
  });

  it("stops the tagline at 80 and counts as it goes", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<FactsFields facts={FACTS} onApply={(op) => ops.push(op)} />);
    const tagline = screen.getByRole("textbox", { name: "Tagline" });
    await user.type(tagline, "t".repeat(81));
    expect(tagline).toHaveValue("t".repeat(80));
    expect(screen.getByText("80/80")).toBeInTheDocument();
    await settle();
    expect(ops).toEqual([
      { op: "set_field", target: { kind: "profile" }, path: "tagline", value: "t".repeat(80) },
    ]);
  });

  it("writes the name on Enter at once and the sex on choice", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    render(<FactsFields facts={FACTS} onApply={(op) => ops.push(op)} />);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Charlotte{Enter}");
    expect(ops).toEqual([
      { op: "set_field", target: { kind: "profile" }, path: "name", value: "Charlotte" },
    ]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Sex" }), "female");
    expect(ops.at(-1)).toEqual({
      op: "set_field",
      target: { kind: "profile" },
      path: "sex",
      value: "female",
    });
    await user.type(screen.getByRole("textbox", { name: "Age" }), "3 years");
    await user.tab();
    expect(ops.at(-1)).toMatchObject({ path: "age", value: "3 years" });
  });

  it("shows the document's values and follows them when they change from outside", () => {
    const { rerender } = render(
      <FactsFields
        facts={{ name: "Charlotte", age: "3", sex: "female", tagline: "Loves sunbeams." }}
        onApply={() => undefined}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Charlotte");
    expect(screen.getByRole("combobox", { name: "Sex" })).toHaveValue("female");
    expect(screen.getByText("15/80")).toBeInTheDocument();
    rerender(<FactsFields facts={{ ...FACTS, name: "Bramble" }} onApply={() => undefined} />);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Bramble");
    expect(screen.getByRole("textbox", { name: "Tagline" })).toHaveValue("");
  });
});

describe("FactsFields after an outside change", () => {
  it("shows the document's value once it returns to what the draft was typed over, and a blur sends nothing", async () => {
    const user = userEvent.setup();
    const ops: EditOperation[] = [];
    const { rerender } = render(
      <FactsFields facts={{ ...FACTS, name: "Charlotte" }} onApply={(op) => ops.push(op)} />,
    );
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.type(name, " Two");
    await settle();
    expect(ops).toHaveLength(1);
    // The edit landed, then was undone: the document is back at the base.
    rerender(
      <FactsFields facts={{ ...FACTS, name: "Charlotte Two" }} onApply={(op) => ops.push(op)} />,
    );
    rerender(
      <FactsFields facts={{ ...FACTS, name: "Charlotte" }} onApply={(op) => ops.push(op)} />,
    );
    expect(name).toHaveValue("Charlotte");
    await user.click(name);
    await user.tab();
    await settle();
    expect(ops).toHaveLength(1);
  });
});
