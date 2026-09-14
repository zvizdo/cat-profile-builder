import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOVER_IDLE_MS } from "@/ui/carousel/use-beat";
import { KIOSK_IDLE_RESUME_MS } from "@/ui/carousel/use-idle-resume";
import { KIOSK_POLL_MS } from "@/ui/carousel/use-kiosk-poll";
import { KioskShell } from "@/ui/carousel/KioskShell";
import { stubMatchMedia, stubPlayback } from "../profile/fixtures";
import { OLIVE, ROSTER, SOLO } from "./fixtures";

// The kiosk (T043; FR-063–FR-067, FR-069; server-boundary.md → `/kiosk`): the carousel
// frame — not a link here — and nothing else, the controls shown while the pointer moves
// or presses and faded after three still seconds — still in the DOM, still focusable, and
// shown again when one takes keyboard focus (a click's focus does not pin them) — the
// arrows and Space from anywhere in every state, a pause giving up after a minute without
// input, fullscreen asked for on the first press, the screen kept awake, the five-minute
// poll landing at a beat boundary, and the offline note while the feed is quiet.

const HOLD = 8;
const MS = HOLD * 1000;
const LOADED_AT = new Date(2026, 8, 12, 14, 2).getTime();

const fetchMock = vi.fn<typeof fetch>();

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stage(): HTMLElement {
  const root = document.querySelector("[data-beat]");
  if (root === null) throw new Error("no stage");
  return root as HTMLElement;
}

function strip(): HTMLElement {
  const root = document.querySelector("[data-shown]");
  if (root === null) throw new Error("no control strip");
  return root as HTMLElement;
}

async function interval(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(KIOSK_POLL_MS);
  });
}

const realRequestFullscreen = document.documentElement.requestFullscreen;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(LOADED_AT);
  stubMatchMedia(false);
  stubPlayback();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => answer({ cats: ROSTER }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // jsdom has no requestFullscreen; a test that stubs one puts the element back as it was.
  if (realRequestFullscreen === undefined) {
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
  } else {
    document.documentElement.requestFullscreen = realRequestFullscreen;
  }
});

describe("KioskShell — the frame and nothing else (FR-065)", () => {
  it("shows the carousel's frame with no chrome around it", () => {
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
    expect(screen.getByText("01 / 03")).toBeInTheDocument();
    expect(stage().style.getPropertyValue("--hold")).toBe("8s");
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.getByRole("group", { name: "Carousel controls" })).toBeInTheDocument();
  });

  it("the frame is not a link: the only way to a profile is the strip's open control (FR-064)", () => {
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open Solo's page" })).toHaveAttribute(
      "href",
      SOLO.url,
    );
    expect(stage().querySelector("a[aria-labelledby]")).toBeNull();
  });

  it("shows the empty rotation when nothing is live", () => {
    render(<KioskShell roster={[]} hold={HOLD} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Nothing in the rotation" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group")).toBeNull();
  });
});

describe("KioskShell — the controls (FR-063)", () => {
  it("are faded until the pointer moves, and fade again after three still seconds", () => {
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    expect(strip()).toHaveAttribute("data-shown", "false");
    fireEvent.pointerMove(stage());
    expect(strip()).toHaveAttribute("data-shown", "true");
    act(() => vi.advanceTimersByTime(HOVER_IDLE_MS - 1));
    expect(strip()).toHaveAttribute("data-shown", "true");
    // Every move restarts the three seconds.
    fireEvent.pointerMove(stage());
    act(() => vi.advanceTimersByTime(HOVER_IDLE_MS - 1));
    expect(strip()).toHaveAttribute("data-shown", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(strip()).toHaveAttribute("data-shown", "false");
  });

  it("a press — a tap on a touch screen — shows them too", () => {
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    fireEvent.pointerDown(stage(), { pointerType: "touch" });
    expect(strip()).toHaveAttribute("data-shown", "true");
    expect(stage()).toHaveAttribute("data-paused", "true");
    act(() => vi.advanceTimersByTime(HOVER_IDLE_MS));
    expect(strip()).toHaveAttribute("data-shown", "false");
  });

  it("a clicked control does not pin them: the pointer-idle clock still fades them", async () => {
    vi.useRealTimers();
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next cat" }));
    expect(screen.getByRole("button", { name: "Next cat" })).toHaveFocus();
    expect(screen.getByText("02 / 03")).toBeInTheDocument();
    // Shown by the pointer that clicked, not by the focus the click left behind.
    expect(strip()).toHaveAttribute("data-shown", "true");
    fireEvent.pointerLeave(stage());
    expect(strip()).toHaveAttribute("data-shown", "false");
  });

  it("stay in the DOM while faded, and the keyboard still works: arrows page, Space pauses", () => {
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    expect(strip()).toHaveAttribute("data-shown", "false");
    expect(screen.getByRole("button", { name: "Next cat" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { level: 1, name: "Clip" })).toBeInTheDocument();
    expect(strip()).toHaveAttribute("data-shown", "false");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: " " });
    expect(stage()).toHaveAttribute("data-paused", "false");
    fireEvent.keyDown(window, { key: " " });
    expect(stage()).toHaveAttribute("data-paused", "true");
  });

  it("come back while one of them has focus, and fade once focus leaves the strip (keyboard path)", async () => {
    vi.useRealTimers();
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    const user = userEvent.setup();
    expect(strip()).toHaveAttribute("data-shown", "false");
    // No frame link: the first Tab lands on the strip.
    await user.tab();
    expect(screen.getByRole("button", { name: "Previous cat" })).toHaveFocus();
    expect(strip()).toHaveAttribute("data-shown", "true");
    await user.tab();
    expect(screen.getByRole("button", { name: "Pause" })).toHaveFocus();
    expect(strip()).toHaveAttribute("data-shown", "true");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Resume" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Next cat" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Open Solo's page" })).toHaveFocus();
    await user.tab();
    expect(strip()).toHaveAttribute("data-shown", "false");
  });

  it("under reduced motion nothing fades: the strip is always shown", () => {
    stubMatchMedia(true);
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    expect(strip()).toHaveAttribute("data-shown", "true");
    expect(screen.queryByRole("button", { name: /Pause|Resume/ })).toBeNull();
    fireEvent.pointerMove(stage());
    act(() => vi.advanceTimersByTime(HOVER_IDLE_MS));
    expect(strip()).toHaveAttribute("data-shown", "true");
  });
});

describe("KioskShell — a pause gives up after a minute without input", () => {
  it("an arrow's pause resumes by itself after KIOSK_IDLE_RESUME_MS; any input restarts the wait", () => {
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(stage()).toHaveAttribute("data-paused", "true");
    act(() => vi.advanceTimersByTime(KIOSK_IDLE_RESUME_MS - 1));
    expect(stage()).toHaveAttribute("data-paused", "true");
    fireEvent.pointerMove(window);
    act(() => vi.advanceTimersByTime(KIOSK_IDLE_RESUME_MS - 1));
    expect(stage()).toHaveAttribute("data-paused", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(stage()).toHaveAttribute("data-paused", "false");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    // Playing again, the beat goes on from the cat the arrow chose.
    act(() => vi.advanceTimersByTime(MS));
    expect(screen.getByRole("heading", { level: 1, name: "Olive" })).toBeInTheDocument();
  });

  it("a Space pause resumes the same way", () => {
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    fireEvent.keyDown(window, { key: " " });
    expect(stage()).toHaveAttribute("data-paused", "true");
    act(() => vi.advanceTimersByTime(KIOSK_IDLE_RESUME_MS));
    expect(stage()).toHaveAttribute("data-paused", "false");
  });
});

describe("KioskShell — fullscreen and the screen kept awake (FR-065)", () => {
  it("asks for fullscreen on the first press — pointer or key — and only then", async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    document.documentElement.requestFullscreen = requestFullscreen;
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    fireEvent.pointerMove(stage());
    expect(requestFullscreen).not.toHaveBeenCalled();
    fireEvent.pointerDown(stage());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(stage());
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("a key press counts as the first interaction too, and a refusal is quietly left alone", async () => {
    const requestFullscreen = vi.fn(() => Promise.reject(new TypeError("not allowed")));
    document.documentElement.requestFullscreen = requestFullscreen;
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { level: 1, name: "Clip" })).toBeInTheDocument();
  });

  it("requests a screen wake lock, again when the page becomes visible, and releases it on unmount", async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(async () => ({ release }) as unknown as WakeLockSentinel);
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    const { unmount } = render(<KioskShell roster={ROSTER} hold={HOLD} />);
    expect(request).toHaveBeenCalledWith("screen");
    await act(async () => {
      await Promise.resolve();
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(request).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    expect(release).toHaveBeenCalled();
  });

  it("a wake lock the browser refuses, or does not offer, changes nothing", async () => {
    const request = vi.fn(() => Promise.reject(new DOMException("hidden", "NotAllowedError")));
    vi.stubGlobal("navigator", { ...navigator, wakeLock: { request } });
    const { unmount } = render(<KioskShell roster={ROSTER} hold={HOLD} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
    unmount();
    vi.stubGlobal("navigator", { ...navigator, wakeLock: undefined });
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
  });
});

describe("KioskShell — the five-minute poll (FR-061, FR-066)", () => {
  it("a roster that arrives mid-beat lands at the next beat boundary, never before", async () => {
    fetchMock.mockImplementation(async () => answer({ cats: [SOLO, OLIVE] }));
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    // One act fires one beat (React commits the next beat's timer once the act ends), so
    // after the poll's five minutes the beat on show has its whole hold left to run.
    await interval();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/\/ 03$/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MS - 1);
    });
    expect(screen.getByText(/\/ 03$/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText(/\/ 02$/)).toBeInTheDocument();
  });

  it("a manual move is a boundary too", async () => {
    fetchMock.mockImplementation(async () => answer({ cats: [SOLO, OLIVE] }));
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    await interval();
    expect(screen.getByText(/\/ 03$/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText(/\/ 02$/)).toBeInTheDocument();
  });

  it("from the empty rotation, the first cat published appears as soon as the poll brings it", async () => {
    fetchMock.mockImplementation(async () => answer({ cats: [SOLO] }));
    render(<KioskShell roster={[]} hold={HOLD} />);
    await interval();
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
    expect(screen.getByText("01 / 01")).toBeInTheDocument();
  });

  it("under reduced motion, where no beat runs, a roster lands as it arrives", async () => {
    stubMatchMedia(true);
    fetchMock.mockImplementation(async () => answer({ cats: [SOLO, OLIVE] }));
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    await interval();
    expect(screen.getByText("01 / 02")).toBeInTheDocument();
  });
});

describe("KioskShell — offline (CONTENT.md → Event carousel → Offline)", () => {
  it("a failed poll keeps the loop going and shows the sentence with the last good time; the next success clears it", async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("Failed to fetch");
    });
    render(<KioskShell roster={ROSTER} hold={HOLD} />);
    // The live region is there from the start, empty, so its first words are announced.
    const note = screen.getByRole("status");
    expect(note).toBeEmptyDOMElement();
    await interval();
    expect(note).toHaveTextContent("The carousel keeps looping on yesterday's cats.");
    expect(note).toHaveTextContent("Last updated 14:02");
    // The loop goes on underneath: the roster is unchanged and the beat still moves.
    expect(screen.getByText(/\/ 03$/)).toBeInTheDocument();
    const before = screen.getByRole("heading", { level: 1 }).textContent;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MS);
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe(before);
    await interval();
    expect(note).toBeEmptyDOMElement();
  });

  it("on the empty rotation only the dated line is said — nothing is looping", async () => {
    fetchMock.mockImplementation(async () => answer({}, 502));
    render(<KioskShell roster={[]} hold={HOLD} />);
    await interval();
    expect(screen.getByRole("status")).toHaveTextContent(/^Last updated 14:02$/);
    expect(
      screen.getByRole("heading", { level: 1, name: "Nothing in the rotation" }),
    ).toBeInTheDocument();
  });
});
