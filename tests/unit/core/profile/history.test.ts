import { describe, expect, it } from "vitest";
import {
  appendToOpen,
  canRedo,
  canUndo,
  closeEntry,
  createHistory,
  HISTORY_LIMIT,
  openEntry,
  record,
  redo,
  undo,
  type History,
} from "@/core/profile/history";
import { type ProfileDocument } from "@/core/profile/schema";
import { bio, document, hero } from "./builders";

const A = document({ name: "Charlotte" });
const B = document({ name: "Charlie" });
const C = document({ name: "Chester", blocks: [hero(), bio("Hello.")] });

function named(name: string): ProfileDocument {
  return document({ name });
}

describe("createHistory", () => {
  it("starts empty with nothing to undo or redo", () => {
    const h = createHistory();
    expect(h).toEqual({ past: [], future: [], open: null });
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undo(h)).toBeNull();
    expect(redo(h)).toBeNull();
  });
});

describe("record / undo / redo", () => {
  it("undo restores `before` exactly and keeps the label", () => {
    const h = record(createHistory(), { before: A, after: B, label: "Rename" });
    expect(canUndo(h)).toBe(true);
    const undone = undo(h);
    expect(undone).not.toBeNull();
    expect(undone?.doc).toEqual(A);
    expect(undone?.h.past).toEqual([]);
    expect(undone?.h.future).toEqual([{ before: A, after: B, label: "Rename" }]);
  });

  it("redo replays `after` and moves the entry back to the past", () => {
    const h = record(createHistory(), { before: A, after: B, label: "Rename" });
    const undone = undo(h);
    expect(undone && canRedo(undone.h)).toBe(true);
    const redone = undone ? redo(undone.h) : null;
    expect(redone?.doc).toEqual(B);
    expect(redone?.h.future).toEqual([]);
    expect(redone?.h.past).toEqual([{ before: A, after: B, label: "Rename" }]);
  });

  it("undoes and redoes in order across several entries", () => {
    let h = record(createHistory(), { before: A, after: B, label: "one" });
    h = record(h, { before: B, after: C, label: "two" });
    const first = undo(h);
    expect(first?.doc).toEqual(B);
    const second = first ? undo(first.h) : null;
    expect(second?.doc).toEqual(A);
    expect(second && undo(second.h)).toBeNull();
    const again = second ? redo(second.h) : null;
    expect(again?.doc).toEqual(B);
  });

  it("a new record clears the future", () => {
    const h = record(createHistory(), { before: A, after: B, label: "Rename" });
    const undone = undo(h);
    const next = undone ? record(undone.h, { before: A, after: C, label: "Other" }) : null;
    expect(next?.future).toEqual([]);
    expect(next && canRedo(next)).toBe(false);
  });

  it("does not mutate the history it is given", () => {
    const frozen = createHistory();
    Object.freeze(frozen);
    Object.freeze(frozen.past);
    Object.freeze(frozen.future);
    const next = record(frozen, { before: A, after: B, label: "Rename" });
    expect(frozen.past).toEqual([]);
    expect(next.past).toHaveLength(1);
    const undone = undo(next);
    expect(next.past).toHaveLength(1);
    expect(undone?.h.past).toHaveLength(0);
  });
});

describe("HISTORY_LIMIT", () => {
  it("caps the past at HISTORY_LIMIT entries, dropping the oldest", () => {
    let h: History = createHistory();
    for (let i = 0; i <= HISTORY_LIMIT; i += 1) {
      h = record(h, { before: named(`cat${i}`), after: named(`cat${i + 1}`), label: `${i}` });
    }
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]?.label).toBe("1");
    expect(h.past.at(-1)?.label).toBe(`${HISTORY_LIMIT}`);
  });
});

describe("open entries", () => {
  it("absorbs many appends and undoes as one", () => {
    let h = openEntry(createHistory(), "Helper turn", A);
    expect(h.open).toEqual({ label: "Helper turn", before: A, after: null });
    expect(canUndo(h)).toBe(false);
    h = appendToOpen(h, B);
    h = appendToOpen(h, C);
    h = closeEntry(h);
    expect(h.open).toBeNull();
    expect(h.past).toEqual([{ before: A, after: C, label: "Helper turn" }]);
    expect(undo(h)?.doc).toEqual(A);
  });

  it("closing an entry with no appends records nothing", () => {
    const h = closeEntry(openEntry(createHistory(), "Helper turn", A));
    expect(h.open).toBeNull();
    expect(h.past).toEqual([]);
  });

  it("closing with nothing open is a no-op", () => {
    const h = createHistory();
    expect(closeEntry(h)).toEqual(h);
  });

  it("appending with nothing open leaves the history unchanged", () => {
    const h = record(createHistory(), { before: A, after: B, label: "Rename" });
    expect(appendToOpen(h, C)).toEqual(h);
  });

  it("opening while an entry is open closes the first one", () => {
    let h = openEntry(createHistory(), "first", A);
    h = appendToOpen(h, B);
    h = openEntry(h, "second", B);
    expect(h.past).toEqual([{ before: A, after: B, label: "first" }]);
    expect(h.open).toEqual({ label: "second", before: B, after: null });
  });

  it("a record while an entry is open closes that entry first", () => {
    let h = openEntry(createHistory(), "Helper turn", A);
    h = appendToOpen(h, B);
    h = record(h, { before: B, after: C, label: "Rename" });
    expect(h.open).toBeNull();
    expect(h.past.map((entry) => entry.label)).toEqual(["Helper turn", "Rename"]);
  });

  it("closing an entry clears the future like any record", () => {
    const undone = undo(record(createHistory(), { before: A, after: B, label: "Rename" }));
    let h = openEntry(undone ? undone.h : createHistory(), "Helper turn", A);
    h = appendToOpen(h, C);
    h = closeEntry(h);
    expect(h.future).toEqual([]);
  });
});
