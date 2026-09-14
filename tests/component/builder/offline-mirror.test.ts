import { describe, expect, it, vi } from "vitest";
import type { ProfileDocument } from "@/core/profile/schema";
import {
  browserStorage,
  clearMirror,
  mirrorApplies,
  mirrorKey,
  readMirror,
  writeMirror,
  type MirrorStorage,
} from "@/ui/builder/offline-mirror";

// The offline mirror (T027; FR-024): every change is copied to `localStorage` under
// `draft:{id}` with the server version it is based on, so a tab closed while offline
// loses nothing. The functions are pure over an injected storage; a storage that throws
// (private mode, a full quota) is a no-op, never a crash. `mirrorApplies` is the one rule
// for the restore prompt, and it consults no clock: a mirror applies when it is based on
// exactly the version the server holds and says something different.

const DOC: ProfileDocument = {
  schemaVersion: 1,
  id: "abcdefgh",
  name: "Charlotte",
  blocks: [{ id: "heroaaaaaaaa", type: "hero", mediaId: null }],
  theme: { preset: "paper", warmth: 0.5, contrast: 0.5 },
  updatedAt: "2026-09-10T12:00:00.000Z",
};

const T1 = "2026-09-11T10:00:00.000Z";
const T2 = "2026-09-11T10:00:05.000Z";
const SERVER_DOC: ProfileDocument = { ...DOC, updatedAt: T1 };
const EDITED: ProfileDocument = { ...SERVER_DOC, name: "Charlotte, edited offline" };

/** A storage that remembers, like localStorage without the browser. */
function memoryStorage(): MirrorStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** A storage whose every call throws, as a private window's can. */
function throwingStorage(): MirrorStorage {
  const fail = () => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

describe("writeMirror / readMirror / clearMirror", () => {
  it("writes the document and the version it is based on under draft:{id} and reads it back", () => {
    const storage = memoryStorage();
    expect(writeMirror(storage, DOC, T1)).toBe(true);
    expect(mirrorKey(DOC.id)).toBe("draft:abcdefgh");
    expect(storage.map.has("draft:abcdefgh")).toBe(true);
    expect(readMirror(storage, DOC.id)).toEqual({ doc: DOC, basedOn: T1 });
  });

  it("reads nothing where nothing was written, and nothing after a clear", () => {
    const storage = memoryStorage();
    expect(readMirror(storage, DOC.id)).toBeNull();
    writeMirror(storage, DOC, T1);
    expect(clearMirror(storage, DOC.id)).toBe(true);
    expect(readMirror(storage, DOC.id)).toBeNull();
  });

  it("treats a mirror that is not JSON, or not a valid document, as none", () => {
    const storage = memoryStorage();
    storage.map.set(mirrorKey(DOC.id), "{not json");
    expect(readMirror(storage, DOC.id)).toBeNull();
    storage.map.set(mirrorKey(DOC.id), JSON.stringify({ doc: { id: "x" }, basedOn: T1 }));
    expect(readMirror(storage, DOC.id)).toBeNull();
    storage.map.set(mirrorKey(DOC.id), JSON.stringify({ doc: DOC, basedOn: "yesterday" }));
    expect(readMirror(storage, DOC.id)).toBeNull();
  });

  it("is a no-op over a storage that throws: false or null, never an exception", () => {
    const storage = throwingStorage();
    expect(writeMirror(storage, DOC, T1)).toBe(false);
    expect(readMirror(storage, DOC.id)).toBeNull();
    expect(clearMirror(storage, DOC.id)).toBe(false);
  });

  it("is a no-op with no storage at all", () => {
    expect(writeMirror(null, DOC, T1)).toBe(false);
    expect(readMirror(null, DOC.id)).toBeNull();
    expect(clearMirror(null, DOC.id)).toBe(false);
  });
});

describe("mirrorApplies", () => {
  it("applies when the mirror is based on the version the server holds and differs from it", () => {
    expect(mirrorApplies({ doc: EDITED, basedOn: T1 }, SERVER_DOC)).toBe("applies");
  });

  it("is stale when the server has moved on since the mirror's version — another device saved", () => {
    expect(mirrorApplies({ doc: EDITED, basedOn: T1 }, { ...SERVER_DOC, updatedAt: T2 })).toBe(
      "stale",
    );
  });

  it("is identical when the mirror says nothing the server does not", () => {
    expect(mirrorApplies({ doc: SERVER_DOC, basedOn: T1 }, SERVER_DOC)).toBe("identical");
  });

  it("is none without a mirror", () => {
    expect(mirrorApplies(null, SERVER_DOC)).toBe("none");
  });

  it("consults no clock: a browser two seconds — or two years — behind the server changes nothing", () => {
    const storage = memoryStorage();
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("the mirror asked the clock");
    });
    const iso = vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => {
      throw new Error("the mirror asked the clock");
    });
    try {
      expect(writeMirror(storage, EDITED, T1)).toBe(true);
      const mirror = readMirror(storage, DOC.id);
      expect(mirrorApplies(mirror, SERVER_DOC)).toBe("applies");
      expect(mirrorApplies(mirror, { ...SERVER_DOC, updatedAt: "2024-01-01T00:00:00.000Z" })).toBe(
        "stale",
      );
    } finally {
      now.mockRestore();
      iso.mockRestore();
    }
  });
});

describe("browserStorage", () => {
  it("hands back the window's localStorage", () => {
    expect(browserStorage()).toBe(window.localStorage);
  });

  it("is null when reaching localStorage itself throws", () => {
    const spy = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access is denied for this document.", "SecurityError");
    });
    expect(browserStorage()).toBeNull();
    spy.mockRestore();
  });
});
