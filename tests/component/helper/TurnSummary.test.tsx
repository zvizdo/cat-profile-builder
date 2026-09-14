import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppliedEdit, Turn } from "@/core/helper/reducer";
import { RevealProvider } from "@/ui/builder/follow";
import { TurnSummary } from "@/ui/helper/TurnSummary";

// F34 ("follow, then overview"): the "Applied — …" line is the turn's change list. Inside
// the builder — where `RevealProvider` hands the panel the canvas's own scroll-and-pulse —
// each label that has a block is the button that finds it; a label with no block (a
// theme, a facts field) stays plain words. The sentence reads exactly as the history
// label does either way (F26).

const BIO_ID = "blockaaaaaab";
const GALLERY_ID = "blockaaaaaad";

function added(label: string, target: string | null): AppliedEdit {
  return {
    toolCallId: `call-${label}`,
    op: { op: "add_block", block: { type: "bio", content: { paragraphs: [] } } },
    summary: `Add a ${label}.`,
    blockIds: target === null ? [] : [target],
    target,
    verb: "added",
    label,
  };
}

const THEME: AppliedEdit = {
  toolCallId: "call-theme",
  op: { op: "set_theme", preset: "sand" },
  summary: "Set the theme to Sand.",
  blockIds: [],
  target: null,
  verb: "set theme",
  label: "Sand",
};

function turnOf(...applied: AppliedEdit[]): Turn {
  const touched = applied.flatMap((edit) => (edit.target === null ? [] : [edit.target]));
  return {
    applied,
    touched,
    card: null,
    results: {},
    outcome: { kind: "done" },
    entry: { before: {} as never, after: {} as never, label: "CATalyst: …" },
  };
}

/** Inside a `RevealProvider` when `reveal` is given; `onPage` defaults to every block
 * the turn touched, as a canvas that still shows them all would report. */
function renderSummary(
  turn: Turn,
  reveal?: (blockId: string) => void,
  onPage: ReadonlySet<string> = new Set(turn.touched),
) {
  const summary = (
    <TurnSummary
      turn={turn}
      standing="undoable"
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onRetry={vi.fn()}
    />
  );
  return render(
    reveal === undefined ? (
      summary
    ) : (
      <RevealProvider reveal={reveal} onPage={onPage}>
        {summary}
      </RevealProvider>
    ),
  );
}

describe("TurnSummary — the change list (F34)", () => {
  it("makes each applied label with a block a button, named by its clause, that reveals that block", async () => {
    const user = userEvent.setup();
    const reveal = vi.fn();
    renderSummary(turnOf(added("bio", BIO_ID), added("gallery", GALLERY_ID), THEME), reveal);

    const bio = screen.getByRole("button", { name: "added bio" });
    const gallery = screen.getByRole("button", { name: "added gallery" });
    expect(bio).toHaveTextContent("bio");
    expect(gallery).toHaveTextContent("gallery");
    // A theme has no block on the canvas to go to, so it is words, not a button.
    expect(screen.queryByRole("button", { name: /Sand/ })).toBeNull();

    await user.click(gallery);
    expect(reveal).toHaveBeenCalledWith(GALLERY_ID);
    await user.click(bio);
    expect(reveal).toHaveBeenLastCalledWith(BIO_ID);
  });

  it("still reads as the one sentence the history label reads", () => {
    renderSummary(turnOf(added("bio", BIO_ID), added("gallery", GALLERY_ID), THEME), vi.fn());
    const line = screen.getByText(/^Applied — /);
    expect(line).toHaveTextContent("Applied — added bio, gallery; set theme Sand.");
    expect(screen.getByRole("button", { name: "Undo these" })).toBeInTheDocument();
  });

  it("reaches each button by keyboard: Tab, then Enter reveals", async () => {
    const user = userEvent.setup();
    const reveal = vi.fn();
    renderSummary(turnOf(added("bio", BIO_ID)), reveal);
    await user.tab();
    expect(screen.getByRole("button", { name: "added bio" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(reveal).toHaveBeenCalledWith(BIO_ID);
  });

  // F34 review, finding 4: a block the turn added and then removed has nowhere to go —
  // its label is words, never a button that does nothing.
  it("a label whose block is no longer on the page is words, not a dead button", () => {
    renderSummary(
      turnOf(added("bio", BIO_ID), added("gallery", GALLERY_ID)),
      vi.fn(),
      new Set([BIO_ID]),
    );
    expect(screen.getByRole("button", { name: "added bio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "added gallery" })).toBeNull();
    expect(screen.getByText(/^Applied — /)).toHaveTextContent("Applied — added bio, gallery.");
  });

  it("outside a RevealProvider the line is plain words — nothing to scroll", () => {
    renderSummary(turnOf(added("bio", BIO_ID), THEME));
    expect(screen.getByText("Applied — added bio; set theme Sand.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "added bio" })).toBeNull();
  });
});
