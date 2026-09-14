import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "@/core/media/validation";
import { Builder } from "@/ui/builder/Builder";
import { HELPER_OVERLAY_QUERY } from "@/ui/helper/HelperPanel";
import { OFFLINE_MESSAGE } from "@/ui/builder/OfflineNotice";
import { DOC, frameOrder } from "./canvas-fixtures";
import { CAT, fileInput } from "./media-fixtures";

// The shell end to end in jsdom (FR-021, FR-023, FR-024, FR-025): a tile adds a section,
// ⌘Z / ⌘⇧Z walk the history, a refused edit is one toast and no change, the draft goes
// out as a PUT after a second, `pagehide` sends it at once with keepalive, and a 400
// keeps the page and says so.

vi.mock("@/app/actions/media", () => ({
  setAltText: vi.fn(),
  deleteMedia: vi.fn(),
  beginUpload: vi.fn(),
  finalizeUpload: vi.fn(),
}));

const fetchSpy = vi.fn<typeof fetch>();
const scrollSpy = vi.fn();

function stamped() {
  return Response.json({ updatedAt: "2026-09-11T12:00:00.000Z" });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async () => stamped());
  // The section picker's add (F2) reveals the new frame through `revealTarget`, which
  // reads the reduced-motion query and calls `scrollIntoView`; jsdom has neither. `useSurface`
  // also subscribes to a query list, hence the (unused here) listener methods.
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Element.prototype.scrollIntoView = scrollSpy;
  scrollSpy.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A page with only the fixed hero — the rail's tiles add everything else. */
const HERO_ONLY = { ...DOC, blocks: [DOC.blocks[0]!] };

function renderBuilder(doc = DOC) {
  return render(
    <Builder
      document={doc}
      assets={[]}
      publication={{ state: "draft", url: null }}
      now="2026-09-11T12:00:00.000Z"
    />,
  );
}

describe("Builder", () => {
  it("adds a section from the rail and undoes it with ⌘Z, redoes with ⌘⇧Z", async () => {
    const user = userEvent.setup();
    renderBuilder(HERO_ONLY);
    await user.click(screen.getByRole("button", { name: "Bio" }));
    expect(frameOrder()).toEqual(["hero", "bio"]);
    await user.keyboard("{Meta>}z{/Meta}");
    expect(frameOrder()).toEqual(["hero"]);
    await user.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");
    expect(frameOrder()).toEqual(["hero", "bio"]);
    await user.keyboard("{Control>}z{/Control}");
    expect(frameOrder()).toEqual(["hero"]);
    await user.keyboard("{Control>}y{/Control}");
    expect(frameOrder()).toEqual(["hero", "bio"]);
  });

  it("the canvas's add tile opens the section picker and adds through the real session (F2)", async () => {
    const user = userEvent.setup();
    renderBuilder(HERO_ONLY);
    await user.click(screen.getByRole("button", { name: "+ add section" }));
    const dialog = screen.getByRole("dialog", { name: "Add a section" });
    await user.click(within(dialog).getByRole("button", { name: /^BIO/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(frameOrder()).toEqual(["hero", "bio"]);
  });

  // F46 (F45 review round 1, finding 3): at 768–1179 the open CATalyst column lies over
  // the canvas, and a modal opened over it takes Escape first — the picker closes, the
  // column stays open; the next Escape folds the column.
  it("at 1024 Escape on the section picker closes the picker alone; the open overlay stays until its own Escape", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === HELPER_OVERLAY_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const user = userEvent.setup();
    renderBuilder({ ...HERO_ONLY });
    await user.click(screen.getByRole("button", { name: "open CATalyst" }));
    const body = document.querySelector("[data-helper-body]") as HTMLElement;
    expect(body).not.toHaveAttribute("hidden");
    await user.click(screen.getByRole("button", { name: "+ add section" }));
    expect(screen.getByRole("dialog", { name: "Add a section" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(body).not.toHaveAttribute("hidden");
    await user.keyboard("{Escape}");
    expect(body).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "open CATalyst" })).toHaveFocus();
  });

  it("ignores ⌘Z while a question is open", async () => {
    const user = userEvent.setup();
    renderBuilder(HERO_ONLY);
    await user.click(screen.getByRole("button", { name: "Bio" }));
    await user.click(
      within(screen.getByRole("region", { name: /BIO/ })).getByRole("button", { name: "remove" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Meta>}z{/Meta}");
    expect(frameOrder()).toEqual(["hero", "bio"]);
    await user.keyboard("{Escape}");
    await user.keyboard("{Meta>}z{/Meta}");
    expect(frameOrder()).toEqual(["hero"]);
  });

  it("shows the helper's locked line until the library holds a photo", () => {
    const { unmount } = renderBuilder();
    expect(screen.getByText("Add one photo and I can help.")).toBeInTheDocument();
    unmount();
    render(
      <Builder
        document={DOC}
        assets={[CAT]}
        publication={{ state: "draft", url: null }}
        now="2026-09-11T12:00:00.000Z"
      />,
    );
    expect(screen.queryByText("Add one photo and I can help.")).toBeNull();
    expect(screen.getByRole("complementary", { name: "CATalyst AI Assistant" })).toHaveTextContent(
      "sees this page · cannot publish",
    );
  });

  it("has no hero tile: every page already has one, mandatory and fixed at the top (F1)", () => {
    renderBuilder();
    expect(screen.queryByRole("button", { name: "Hero" })).toBeNull();
    // Neither can it be duplicated or removed from its own frame.
    expect(
      within(screen.getByRole("region", { name: /HERO/ })).queryByRole("button", {
        name: "duplicate",
      }),
    ).toBeNull();
    expect(
      within(screen.getByRole("region", { name: /HERO/ })).queryByRole("button", {
        name: "remove",
      }),
    ).toBeNull();
  });

  it("PUTs the draft one second after an edit and reports the save", async () => {
    vi.useFakeTimers();
    renderBuilder(HERO_ONLY);
    await act(async () => {
      screen.getByRole("button", { name: "Bio" }).click();
    });
    expect(screen.getByText("Saving draft")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("/api/profiles/abcdefgh/draft");
    expect(init?.method).toBe("PUT");
    const sent = JSON.parse(String(init?.body));
    expect(sent.blocks).toHaveLength(2);
    expect(sent.blocks[0].type).toBe("hero");
    expect(sent.blocks[1].type).toBe("bio");
    // The line's age reads the clock, which the fake timers also advance; the words the
    // clock chooses are Topbar's own test.
    expect(screen.getByText(/^Draft saved/)).toBeInTheDocument();
  });

  it("sends the pending draft at once with keepalive on pagehide", async () => {
    vi.useFakeTimers();
    renderBuilder(HERO_ONLY);
    await act(async () => {
      screen.getByRole("button", { name: "Bio" }).click();
    });
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]?.keepalive).toBe(true);
  });

  it("keeps the page and shows the server's sentence when the save is refused (FR-027)", async () => {
    vi.useFakeTimers();
    fetchSpy.mockImplementation(async () =>
      Response.json(
        { error: { code: "invalid", message: "The name is too long." } },
        { status: 400 },
      ),
    );
    renderBuilder(HERO_ONLY);
    await act(async () => {
      screen.getByRole("button", { name: "Bio" }).click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("The name is too long.")).toBeInTheDocument();
    expect(frameOrder()).toEqual(["hero", "bio"]);
  });

  it("keeps one toast stack: the library's refusal and the shell's own toast share it (F38)", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));
    renderBuilder(HERO_ONLY);
    // The library's own refusal (FR-007), raised from the rail…
    const big = new File([""], "long.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: LIMITS.videoBytes + 1 });
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [big] } });
    });
    // …and the shell's offline notice (FR-027), raised from the session's save.
    await act(async () => {
      screen.getByRole("button", { name: "Bio" }).click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const refusal = screen.getByRole("alert");
    expect(refusal).toHaveTextContent("That video is over 200MB.");
    const offline = screen.getByText(OFFLINE_MESSAGE).closest('[role="status"]');
    expect(offline).not.toBeNull();
    // Both in the one fixed stack, so neither can be painted under the other.
    expect(refusal.parentElement).toBe(offline?.parentElement);
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  });
});
