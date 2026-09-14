import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createTurn } from "@/core/helper/turn";
import type { AppliedEdit, Turn } from "@/core/helper/reducer";
import { isQuestion, peekLine, WORKING_LINE } from "@/ui/builder/phone/peek-line";

// The CATalyst peek bar's one line (design 2026-09-13 §4; CONTENT.md → Phone peek line):
// the working sentence while a turn streams, and at its end the receipt, the failure
// sentence, the refusal, the card's own sentence, or the helper's last words — the
// proposal question among them — reused, never a new string.

const BIO: AppliedEdit = {
  toolCallId: "call-bio",
  op: { op: "add_block", block: { type: "bio", content: { paragraphs: [] } } },
  summary: "Add a bio.",
  blockIds: ["blockaaaaaab"],
  target: "blockaaaaaab",
  verb: "added",
  label: "bio",
};

function assistant(text: string): UIMessage {
  return { id: "a1", role: "assistant", parts: [{ type: "text", text }] };
}

const ASKED: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Build it" }] };

function ended(turn: Partial<Turn>): Turn {
  return { ...createTurn(), outcome: { kind: "done" }, ...turn };
}

describe("peekLine", () => {
  it("is the working sentence while the turn streams with no card", () => {
    expect(peekLine({ status: "working", turn: createTurn() }, [ASKED])).toBe(WORKING_LINE);
    expect(WORKING_LINE).toBe("CATalyst is working…");
  });

  it("is the card's own sentence while a card waits", () => {
    const turn = { ...createTurn(), card: { toolCallId: "c", op: BIO.op, summary: "Add a bio." } };
    expect(peekLine({ status: "working", turn }, [ASKED])).toBe("Add a bio.");
  });

  it("is the receipt once a turn that applied something ends", () => {
    const turn = ended({ applied: [BIO], touched: ["blockaaaaaab"] });
    expect(peekLine({ status: "ready", turn }, [ASKED, assistant("Done.")])).toBe(
      "Applied — added bio.",
    );
  });

  it("is the failure sentence for a turn that was cut off or failed", () => {
    const cut = ended({ applied: [BIO], outcome: { kind: "truncated", applied: 1 } });
    expect(peekLine({ status: "ready", turn: cut }, [ASKED])).toBe(
      "I added 1 section before I was cut off. Undo these, or ask me to continue.",
    );
    const failed = ended({
      outcome: { kind: "error", applied: 0, message: "I couldn't reach the model." },
    });
    expect(peekLine({ status: "ready", turn: failed }, [ASKED])).toBe(
      "I couldn't reach the model. Nothing on your page changed.",
    );
  });

  it("is the refusal when the turn's last tool call was rejected and nothing applied", () => {
    const turn = ended({ results: { c1: { status: "rejected", reason: "No such block." } } });
    expect(peekLine({ status: "ready", turn }, [ASKED, assistant("Sorry.")])).toBe(
      "No such block.",
    );
  });

  it("is the helper's last words otherwise — the proposal question included", () => {
    const turn = ended({});
    const proposal = "A bio and a gallery. Want me to build this now?";
    expect(peekLine({ status: "ready", turn }, [ASKED, assistant(proposal)])).toBe(proposal);
    expect(peekLine({ status: "ready", turn }, [ASKED])).toBe("");
  });
});

describe("isQuestion", () => {
  it("is true only for a line that ends in a question mark", () => {
    expect(isQuestion("Want me to build this now?")).toBe(true);
    expect(isQuestion("Want me to build this now? ")).toBe(true);
    expect(isQuestion("Applied — added bio.")).toBe(false);
    expect(isQuestion("")).toBe(false);
  });
});
