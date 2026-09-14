import { describe, expect, it } from "vitest";
import { undoKey } from "@/ui/builder/undo-keys";

// The undo shortcuts (FR-025): ⌘Z / Ctrl+Z undo, ⌘⇧Z / Ctrl+Y redo, nothing else.

function key(key: string, mods: Partial<Omit<Parameters<typeof undoKey>[0], "key">> = {}) {
  return { key, metaKey: false, ctrlKey: false, shiftKey: false, ...mods };
}

describe("undoKey", () => {
  it("is undo for ⌘Z and Ctrl+Z", () => {
    expect(undoKey(key("z", { metaKey: true }))).toBe("undo");
    expect(undoKey(key("Z", { ctrlKey: true }))).toBe("undo");
  });

  it("is redo for ⌘⇧Z, Ctrl+Shift+Z and Ctrl+Y", () => {
    expect(undoKey(key("z", { metaKey: true, shiftKey: true }))).toBe("redo");
    expect(undoKey(key("Z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(undoKey(key("y", { ctrlKey: true }))).toBe("redo");
  });

  it("is nothing for a bare letter, another letter, or ⌘Y", () => {
    expect(undoKey(key("z"))).toBeNull();
    expect(undoKey(key("a", { metaKey: true }))).toBeNull();
    expect(undoKey(key("y", { metaKey: true }))).toBeNull();
  });
});
