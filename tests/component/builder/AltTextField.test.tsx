import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AltTextField, NEEDS_DESCRIPTION } from "@/ui/builder/AltTextField";

// The description on a media tile (FR-011, FR-073): visible, editable at any time, saved
// on blur and on Enter (Shift+Enter is a newline), never saved empty or unchanged. When
// the describer failed the field is empty, focused, and sits under the one sentence that
// says what to do; who wrote the text is noted underneath in the mono voice.

function renderField(props: Partial<Parameters<typeof AltTextField>[0]> = {}) {
  const onSave = vi.fn<(text: string) => Promise<boolean>>().mockResolvedValue(true);
  render(
    <AltTextField
      id="alt-1"
      kind="photo"
      text="A tabby cat on a windowsill."
      source="model"
      failed={false}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave, field: screen.getByRole("textbox", { name: "Description" }) };
}

describe("AltTextField", () => {
  it("shows the description under a Description label and who wrote it", () => {
    const { field } = renderField();
    expect(field).toHaveValue("A tabby cat on a windowsill.");
    expect(screen.getByText("described automatically")).toBeInTheDocument();
  });

  it("notes `written by a volunteer` once the words are theirs", () => {
    renderField({ source: "volunteer" });
    expect(screen.getByText("written by a volunteer")).toBeInTheDocument();
    expect(screen.queryByText("described automatically")).not.toBeInTheDocument();
  });

  it("saves on blur when the text changed, and not when it did not", async () => {
    const user = userEvent.setup();
    const { onSave, field } = renderField();
    await user.click(field);
    await user.tab();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(field);
    await user.clear(field);
    await user.type(field, "Charlotte asleep in the sun.");
    await user.tab();
    expect(onSave).toHaveBeenCalledExactlyOnceWith("Charlotte asleep in the sun.");
  });

  it("saves on Enter without adding a line; Shift+Enter adds one and saves nothing", async () => {
    const user = userEvent.setup();
    const { onSave, field } = renderField();
    await user.click(field);
    await user.type(field, " Sleeps a lot.{Enter}");
    expect(onSave).toHaveBeenCalledExactlyOnceWith("A tabby cat on a windowsill. Sleeps a lot.");
    expect(field).not.toHaveValue(expect.stringContaining("\n"));
    await user.type(field, "{Shift>}{Enter}{/Shift}");
    expect(field).toHaveValue("A tabby cat on a windowsill. Sleeps a lot.\n");
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("resends on a deliberate Enter after a failed save, never on the blur that follows", async () => {
    const user = userEvent.setup();
    const { onSave, field } = renderField();
    onSave.mockResolvedValueOnce(false);
    await user.type(field, " Asleep.{Enter}");
    await user.tab();
    expect(onSave).toHaveBeenCalledTimes(1);
    await user.click(field);
    await user.type(field, "{Enter}");
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith("A tabby cat on a windowsill. Asleep.");
  });

  it("never saves an empty description", async () => {
    const user = userEvent.setup();
    const { onSave, field } = renderField();
    await user.clear(field);
    await user.tab();
    await user.click(field);
    await user.type(field, "   {Enter}");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("asks for a sentence, empty and focused, when the describer failed (FR-073)", () => {
    const { field } = renderField({ text: "", source: null, failed: true });
    expect(screen.getByText(NEEDS_DESCRIPTION.photo)).toBeInTheDocument();
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(screen.queryByText("described automatically")).not.toBeInTheDocument();
  });

  it("says `clip` rather than `photo` for a video", () => {
    renderField({ kind: "video", text: "", source: null, failed: true });
    expect(screen.getByText(NEEDS_DESCRIPTION.video)).toBeInTheDocument();
  });

  it("reads the source note in the reading voice, not shouted caps (F28 review #7)", () => {
    renderField();
    const note = screen.getByText("described automatically");
    expect(note.className).not.toMatch(/(^|\s)uppercase(\s|$)/);
    expect(note.className).toMatch(/(^|\s)tracking-normal(\s|$)/);
    expect(note).toHaveTextContent("described automatically");
  });
});
