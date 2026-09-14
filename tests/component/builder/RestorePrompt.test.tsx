import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Builder } from "@/ui/builder/Builder";
import { mirrorKey, readMirror } from "@/ui/builder/offline-mirror";
import { RestorePrompt } from "@/ui/builder/RestorePrompt";
import { block, DOC, frameOrder } from "./canvas-fixtures";

// The restore prompt (T027; FR-024; quickstart §1 step 12): on open, a mirror based on
// the very version the server holds, and saying something different, is offered as
// `Restore unsaved changes?`; Restore puts the mirror's document on the canvas as one
// undoable entry and sends it; Discard clears the mirror; a stale mirror (the server
// moved on) or an identical one is dropped without a word. No clock is consulted, so a
// browser clock behind the server's changes nothing. Restore is the safe action —
// keeping the server copy is what loses work — so it is what Escape presses.

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const SERVER_AT = "2026-09-11T12:00:00.000Z";
/** A version the server has since replaced. */
const BEFORE = "2026-09-11T11:59:00.000Z";
const AFTER = "2026-09-11T12:01:00.000Z";
const SERVER_DOC = { ...DOC, updatedAt: SERVER_AT };
/** What was edited offline: the server's stack plus a quote at the end. */
const MIRRORED_DOC = {
  ...SERVER_DOC,
  blocks: [...SERVER_DOC.blocks, block("quote", "quoteaaaaaaa")],
};

const fetchSpy = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async () => Response.json({ updatedAt: AFTER }));
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function seedMirror(basedOn: string, doc = MIRRORED_DOC) {
  window.localStorage.setItem(mirrorKey(DOC.id), JSON.stringify({ doc, basedOn }));
}

function renderBuilder() {
  return render(
    <Builder
      document={SERVER_DOC}
      assets={[]}
      publication={{ state: "draft", url: null }}
      now={SERVER_AT}
    />,
  );
}

describe("Builder: the restore prompt", () => {
  it("offers a mirror based on the server's version, and Restore puts it on the canvas as one undoable entry", async () => {
    const user = userEvent.setup();
    seedMirror(SERVER_AT);
    renderBuilder();
    const dialog = await screen.findByRole("dialog", { name: "Restore unsaved changes?" });
    expect(dialog).toHaveTextContent(
      "This cat has edits saved on this device that never reached the server.",
    );
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video"]);
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video", "quote"]);
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("aria-disabled", "false");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video"]);
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("aria-disabled", "true");
  });

  it("Restore is the safe action: Escape restores", async () => {
    const user = userEvent.setup();
    seedMirror(SERVER_AT);
    renderBuilder();
    await screen.findByRole("dialog", { name: "Restore unsaved changes?" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video", "quote"]);
  });

  it("Discard keeps the server's document and clears the mirror", async () => {
    const user = userEvent.setup();
    seedMirror(SERVER_AT);
    renderBuilder();
    const dialog = await screen.findByRole("dialog", { name: "Restore unsaved changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video"]);
    expect(readMirror(window.localStorage, DOC.id)).toBeNull();
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("aria-disabled", "true");
  });

  it("drops a stale mirror without a word: the server moved on from another device", async () => {
    seedMirror(BEFORE);
    renderBuilder();
    await screen.findByRole("region", { name: "Canvas" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(readMirror(window.localStorage, DOC.id)).toBeNull();
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video"]);
  });

  it("clears a mirror identical to the server's document, with no prompt", async () => {
    seedMirror(SERVER_AT, SERVER_DOC);
    renderBuilder();
    await screen.findByRole("region", { name: "Canvas" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(readMirror(window.localStorage, DOC.id)).toBeNull();
    expect(frameOrder()).toEqual(["hero", "bio", "gallery", "video"]);
  });

  it("a browser clock two seconds behind the server changes nothing: the mirror is still offered", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse(SERVER_AT) - 2000));
    try {
      seedMirror(SERVER_AT);
      renderBuilder();
      expect(
        await screen.findByRole("dialog", { name: "Restore unsaved changes?" }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens with no prompt when there is no mirror", async () => {
    renderBuilder();
    await screen.findByRole("region", { name: "Canvas" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("RestorePrompt", () => {
  it("renders nothing when there is nothing to offer", () => {
    render(<RestorePrompt open={false} onRestore={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Tab moves from Restore to Discard, and Enter fires it (keyboard path)", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    render(<RestorePrompt open onRestore={onRestore} onDiscard={onDiscard} />);
    expect(screen.getByRole("button", { name: "Restore" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Discard" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("asks in CONTENT.md's voice with Restore first and Discard as the clay action", () => {
    render(<RestorePrompt open onRestore={vi.fn()} onDiscard={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Restore unsaved changes?" });
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Restore", "Discard"]);
    expect(buttons[0]).toHaveFocus();
    expect(buttons[1]).toHaveClass("border-clay");
  });
});
