import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Builder } from "@/ui/builder/Builder";
import { OFFLINE_MESSAGE, OfflineNotice } from "@/ui/builder/OfflineNotice";
import { readMirror } from "@/ui/builder/offline-mirror";
import { DOC, frameOrder } from "./canvas-fixtures";

// The mirror in the builder and the offline toast (T027; FR-023, FR-024, FR-027): every
// change lands in localStorage with the server version it grew from; the save that lands
// for it clears the mirror, a save for an older document re-bases it; a save that fails
// while the browser is offline shows CONTENT.md's offline toast until the `online` event,
// which sends exactly one retry; a storage that throws costs nothing but the mirror.

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const SERVER_AT = "2026-09-11T12:00:00.000Z";
const SAVED_AT = "2026-09-11T12:00:07.000Z";
const SERVER_DOC = { ...DOC, blocks: [DOC.blocks[0]!], updatedAt: SERVER_AT };

const fetchSpy = vi.fn<typeof fetch>();

function saved() {
  return Response.json({ updatedAt: SAVED_AT });
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async () => saved());
  window.localStorage.clear();
  setOnline(true);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

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

// Clicks under fake timers go through `act` directly, as Builder.test.tsx does.
async function press(name: string) {
  await act(async () => {
    screen.getByRole("button", { name }).click();
  });
}

async function addBio() {
  await press("Bio");
  expect(frameOrder()).toEqual(["hero", "bio"]);
}

describe("Builder: the mirror", () => {
  it("mirrors every applied edit at once, based on the version the cat opened with", async () => {
    renderBuilder();
    expect(readMirror(window.localStorage, DOC.id)).toBeNull();
    await addBio();
    const mirror = readMirror(window.localStorage, DOC.id);
    expect(mirror?.doc.blocks.map((b) => b.type)).toEqual(["hero", "bio"]);
    expect(mirror?.basedOn).toBe(SERVER_AT);
  });

  it("clears the mirror once the save for the current document lands", async () => {
    renderBuilder();
    await addBio();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(readMirror(window.localStorage, DOC.id)).toBeNull();
    // The next edit is based on the version that save produced.
    await press("Quote");
    expect(readMirror(window.localStorage, DOC.id)?.basedOn).toBe(SAVED_AT);
  });

  it("re-bases, and keeps, the mirror when a save lands for an older document", async () => {
    let release: (() => void) | null = null;
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(saved());
        }),
    );
    // The follow-up send of the newer document stays in flight for the whole test.
    fetchSpy.mockImplementationOnce(() => new Promise(() => undefined));
    renderBuilder();
    await addBio();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await press("Quote");
    expect(frameOrder()).toEqual(["hero", "bio", "quote"]);
    expect(readMirror(window.localStorage, DOC.id)?.basedOn).toBe(SERVER_AT);
    await act(async () => {
      release?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    const mirror = readMirror(window.localStorage, DOC.id);
    expect(mirror?.doc.blocks.map((b) => b.type)).toEqual(["hero", "bio", "quote"]);
    expect(mirror?.basedOn).toBe(SAVED_AT);
  });

  it("mirrors an undo, so the mirror is what the canvas shows", async () => {
    renderBuilder();
    await addBio();
    await press("Undo");
    expect(readMirror(window.localStorage, DOC.id)?.doc.blocks).toEqual(SERVER_DOC.blocks);
    expect(readMirror(window.localStorage, DOC.id)?.basedOn).toBe(SERVER_AT);
  });

  it("works without a storage that lets nothing in", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    renderBuilder();
    await addBio();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/^Draft saved/)).toBeInTheDocument();
    setItem.mockRestore();
    getItem.mockRestore();
  });
});

describe("Builder: offline", () => {
  it("shows the offline toast when a save fails with the browser offline, and keeps the edit", async () => {
    setOnline(false);
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));
    renderBuilder();
    await addBio();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const toast = screen.getByText(OFFLINE_MESSAGE);
    expect(toast.closest('[role="status"]')).not.toBeNull();
    expect(frameOrder()).toEqual(["hero", "bio"]);
  });

  it("does not show the offline toast for a failure while online", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));
    renderBuilder();
    await addBio();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();
  });

  it("the online event sends exactly one retry, and the toast goes with it", async () => {
    setOnline(false);
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));
    renderBuilder();
    await addBio();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument();
    // Still offline after two seconds: the toast stays and nothing was re-sent.
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument();

    setOnline(true);
    fetchSpy.mockImplementation(async () => saved());
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/^Draft saved/)).toBeInTheDocument();
  });
});

describe("OfflineNotice", () => {
  it("is CONTENT.md's sentence as a status that renders nothing while online", () => {
    const { rerender } = render(<OfflineNotice offline={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(<OfflineNotice offline />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "You're offline. Your last change is saved here and will sync when you're back.",
    );
  });
});
