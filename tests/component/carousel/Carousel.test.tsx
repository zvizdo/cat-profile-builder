import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Carousel } from "@/ui/carousel/Carousel";
import layerStyles from "@/ui/carousel/carousel.module.css";
import { stubMatchMedia, stubPlayback } from "../profile/fixtures";
import { CLIP, OLIVE, ROSTER, SOLO } from "./fixtures";

// The carousel (T042; FR-062–FR-064, FR-067, FR-069, FR-084, FR-088): one beat per hold
// with the A/B parity from beat.ts on the frame, the whole frame a link to the cat, Space
// and the arrows from anywhere on the page, the clip cut at its window, the single-photo
// cat never skipped, and the empty rotation's three sentences when nothing is live.

const HOLD = 8;
const MS = HOLD * 1000;

function frame(): HTMLElement {
  return screen.getByRole("link", { name: /Loves a sunny windowsill|Will trade purrs|Olive/ });
}

function stage(): HTMLElement {
  const root = document.querySelector("[data-beat]");
  if (root === null) throw new Error("no stage");
  return root as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  stubMatchMedia(false);
  stubPlayback();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Carousel — one beat", () => {
  it("shows the first cat: name, line, facts, counter, and the frame link", () => {
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
    expect(screen.getByText("Loves a sunny windowsill.")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("4 months")).toBeInTheDocument();
    expect(screen.getByText("Sex")).toBeInTheDocument();
    expect(screen.getByText("Female")).toBeInTheDocument();
    expect(screen.getByText("01 / 03")).toBeInTheDocument();
    expect(screen.getByText("Adoptable now")).toBeInTheDocument();
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-thumb]")).toHaveLength(2);
    const link = frame();
    expect(link).toHaveAttribute("href", SOLO.url);
    expect(link).toHaveAccessibleName("Solo Loves a sunny windowsill.");
    expect(within(link).queryByRole("button")).toBeNull();
    expect(screen.getByRole("img", { name: "Scan — Solo's page" }).tagName).toBe("svg");
    // No counter text ("Photo N of N", "Loop N") anywhere on the frame (user request).
    expect(screen.queryByText(/Photo \d+ of \d+|Loop \d+/)).toBeNull();
    // F64: use-stage-fit.ts measures synchronously on mount (the ref callback runs during
    // the commit), so the stage is already snapped by the time this render settles.
    expect(stage()).toHaveAttribute("data-fit", "snapped");
    expect(stage().style.getPropertyValue("--stage-scale")).not.toBe("");
  });

  it("carries the hold as --hold and puts beat.ts's parity on the stage, alternating per beat", () => {
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    expect(stage().style.getPropertyValue("--hold")).toBe("8s");
    expect(stage()).toHaveAttribute("data-beat", "a");
    act(() => vi.advanceTimersByTime(MS));
    expect(stage()).toHaveAttribute("data-beat", "b");
    expect(screen.getByRole("heading", { level: 1, name: "Clip" })).toBeInTheDocument();
    expect(screen.getByText("02 / 03")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(MS));
    expect(stage()).toHaveAttribute("data-beat", "a");
    expect(screen.getByRole("heading", { level: 1, name: "Olive" })).toBeInTheDocument();
  });

  // F55 item 8 (the phone sweep, finding 8): with one cat live there is no next cat, so
  // the footer's `Up next` label has nothing under it and is not drawn; the QR card
  // keeps its place at the right.
  it("draws no Up next when the rotation holds one cat", () => {
    render(<Carousel roster={[SOLO]} hold={HOLD} />);
    expect(screen.queryByText("Up next")).toBeNull();
    expect(document.querySelectorAll("[data-thumb]")).toHaveLength(0);
    expect(screen.getByRole("img", { name: "Scan — Solo's page" })).toBeInTheDocument();
  });

  it("two layers swap roles each beat: the outgoing one keeps the previous beat's picture", () => {
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    const layers = document.querySelectorAll("[data-layer]");
    expect(layers).toHaveLength(2);
    expect(layers[0]).toHaveAttribute("data-role", "incoming");
    expect(layers[1]).toHaveAttribute("data-role", "outgoing");
    act(() => vi.advanceTimersByTime(MS));
    expect(document.querySelectorAll("[data-layer]")).toHaveLength(2);
    expect(layers[0]).toHaveAttribute("data-role", "outgoing");
    expect(layers[0]).toHaveAttribute("aria-hidden", "true");
    expect(layers[0]?.querySelector("[data-slat] > div")).toHaveStyle({
      backgroundImage: `url("${SOLO.photos[0]?.src}")`,
    });
    expect(layers[1]).toHaveAttribute("data-role", "incoming");
    const incoming = screen.getByRole("img", { name: CLIP.photos[0]?.alt });
    expect(layers[1]?.contains(incoming)).toBe(true);
    expect(incoming.querySelectorAll("[data-slat]")).toHaveLength(6);
  });

  // F62: carousel.module.css keys its z-index rules off .layer[data-role] and off
  // .scrim/.bloom/.column, not off DOM order — the two layer nodes are fixed and only
  // swap `data-role` each beat, so paint order can no longer follow the DOM. jsdom never
  // loads the module's real stylesheet (verified: getComputedStyle(...).zIndex reads
  // "auto" here even with the rule in place), so this asserts the class/role contract the
  // CSS keys off; the real proof that the incoming layer paints on top is the e2e's
  // elementFromPoint check over live beats.
  it("every node the CSS's z-index rules select is present, by its exact class, on every beat", () => {
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    for (let i = 0; i < 4; i++) {
      const incoming = document.querySelector(`.${layerStyles.layer}[data-role="incoming"]`);
      const outgoing = document.querySelector(`.${layerStyles.layer}[data-role="outgoing"]`);
      expect(incoming).not.toBeNull();
      expect(outgoing).not.toBeNull();
      expect(incoming).not.toBe(outgoing);
      expect(document.querySelector(`.${layerStyles.scrim}`)).not.toBeNull();
      expect(document.querySelector(`.${layerStyles.bloom}`)).not.toBeNull();
      expect(document.querySelector(`.${layerStyles.column}`)).not.toBeNull();
      act(() => vi.advanceTimersByTime(MS));
    }
  });

  it("a manual move hands the outgoing layer the transform it had at that moment", () => {
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = computed(element, pseudo);
      if (element instanceof HTMLElement && element.dataset.layer !== undefined) {
        return { ...style, transform: "matrix(1.1, 0, 0, 1.1, -10, -5)" } as CSSStyleDeclaration;
      }
      return style;
    });
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const outgoing = document.querySelector("[data-role='outgoing']") as HTMLElement;
    expect(outgoing.style.transform).toBe("matrix(1.1, 0, 0, 1.1, -10, -5)");
    const incoming = document.querySelector("[data-role='incoming']") as HTMLElement;
    expect(incoming.style.transform).toBe("");
  });

  it("omits the facts row when a cat has neither age nor sex", () => {
    render(<Carousel roster={[OLIVE]} hold={HOLD} />);
    expect(screen.queryByText("Age")).toBeNull();
    expect(screen.queryByText("Sex")).toBeNull();
  });

  it("names the next three cats' hero photos as thumbnails, wrapping, fewer when fewer exist", () => {
    const { unmount } = render(<Carousel roster={ROSTER} hold={HOLD} />);
    let thumbs = document.querySelectorAll("[data-thumb]");
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveStyle({ backgroundImage: `url("${CLIP.photos[0]?.src}")` });
    expect(thumbs[1]).toHaveStyle({ backgroundImage: `url("${OLIVE.photos[0]?.src}")` });
    unmount();
    render(<Carousel roster={[SOLO, CLIP, OLIVE, { ...OLIVE, name: "Ivy" }]} hold={HOLD} />);
    thumbs = document.querySelectorAll("[data-thumb]");
    expect(thumbs).toHaveLength(3);
  });
});

describe("Carousel — the loop (FR-084)", () => {
  it("shows each cat's next photo each loop and the single-photo cat's one photo every loop", () => {
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(MS));
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: SOLO.photos[0]?.alt })).toBeInTheDocument();
    for (let i = 0; i < 2; i++) act(() => vi.advanceTimersByTime(MS));
    expect(screen.getByRole("heading", { level: 1, name: "Olive" })).toBeInTheDocument();
    expect(document.querySelector("[data-role='incoming'] [data-slat] > div")).toHaveStyle({
      backgroundImage: `url("${OLIVE.photos[1]?.src}")`,
    });
  });

  it("plays the clip on its loop — muted, looping, inline — and cuts it at the hold", () => {
    const { play } = stubPlayback();
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(MS));
    expect(screen.getByRole("heading", { level: 1, name: "Clip" })).toBeInTheDocument();
    const video = document.querySelector("video");
    if (video === null) throw new Error("no video");
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video).not.toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("src", CLIP.video?.src);
    expect(video).toHaveAttribute("poster", CLIP.video?.poster);
    expect(video).toHaveAttribute("aria-label", CLIP.video?.alt);
    expect(play).toHaveBeenCalled();
  });

  it("the beat after a clip keeps that very video, paused, as the outgoing layer", () => {
    const { pause } = stubPlayback();
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(MS));
    const video = document.querySelector("video");
    expect(video?.closest("[data-layer]")).toHaveAttribute("data-role", "incoming");
    pause.mockClear();
    act(() => vi.advanceTimersByTime(MS));
    expect(screen.getByRole("heading", { level: 1, name: "Olive" })).toBeInTheDocument();
    expect(document.querySelectorAll("video")).toHaveLength(1);
    expect(document.querySelector("video")).toBe(video);
    expect(video?.closest("[data-layer]")).toHaveAttribute("data-role", "outgoing");
    expect(pause).toHaveBeenCalled();
    // And on the beat after that, the layer is reused for a photo again.
    act(() => vi.advanceTimersByTime(MS));
    expect(document.querySelectorAll("video")).toHaveLength(0);
    expect(document.querySelectorAll("[data-layer]")).toHaveLength(2);
  });

  // F62: this is exactly the shape the bug hid in — a clip that just went outgoing stays
  // fully visible unless its layer is truly beneath the incoming one. jsdom cannot compute
  // that (see the class/role-contract test above), so this proves the DOM side of the fix:
  // the next cat's picture is the *incoming* layer (the one z-index:1 lifts above the
  // paused video's outgoing layer) and not, say, left on the layer the video still owns.
  it("the beat after a clip: the next cat's picture is the incoming layer, above the paused clip", () => {
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(MS)); // Clip's beat
    act(() => vi.advanceTimersByTime(MS)); // the beat after: Olive
    expect(screen.getByRole("heading", { level: 1, name: "Olive" })).toBeInTheDocument();
    const incoming = document.querySelector(`.${layerStyles.layer}[data-role="incoming"]`);
    const outgoing = document.querySelector(`.${layerStyles.layer}[data-role="outgoing"]`);
    expect(incoming?.querySelector("video")).toBeNull();
    expect(incoming?.querySelector(`.${layerStyles.slats}`)).not.toBeNull();
    expect(outgoing?.querySelector("video")).not.toBeNull();
  });
});

describe("Carousel — controls (FR-063, FR-064)", () => {
  it("Space toggles pause from anywhere; the stage freezes and the control says Resume", () => {
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    // Past the first beat's entrance, so a pause freezes at once.
    act(() => vi.advanceTimersByTime(4000));
    expect(stage()).toHaveAttribute("data-frozen", "false");
    fireEvent.keyDown(window, { key: " " });
    expect(stage()).toHaveAttribute("data-frozen", "true");
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(MS * 2));
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(stage()).toHaveAttribute("data-frozen", "false");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("the arrow keys and the previous/next controls move and pause auto-advance", () => {
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { level: 1, name: "Clip" })).toBeInTheDocument();
    expect(stage()).toHaveAttribute("data-beat", "b");
    act(() => vi.advanceTimersByTime(MS * 3));
    expect(screen.getByRole("heading", { level: 1, name: "Clip" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous cat" }));
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next cat" }));
    fireEvent.click(screen.getByRole("button", { name: "Next cat" }));
    expect(screen.getByRole("heading", { level: 1, name: "Olive" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Olive's page" })).toHaveAttribute(
      "href",
      OLIVE.url,
    );
  });

  it("a pointer moving over the frame pauses; still for 3 s or leaving resumes", () => {
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    act(() => vi.advanceTimersByTime(4000));
    fireEvent.pointerMove(stage());
    expect(stage()).toHaveAttribute("data-paused", "true");
    act(() => vi.advanceTimersByTime(2999));
    expect(stage()).toHaveAttribute("data-paused", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(stage()).toHaveAttribute("data-paused", "false");
    fireEvent.pointerMove(stage());
    expect(stage()).toHaveAttribute("data-paused", "true");
    fireEvent.pointerLeave(stage());
    expect(stage()).toHaveAttribute("data-paused", "false");
    act(() => vi.advanceTimersByTime(MS - 4000));
    expect(screen.getByRole("heading", { level: 1, name: "Clip" })).toBeInTheDocument();
  });

  it("the controls are reached by Tab in order and sit outside the frame link (keyboard path)", async () => {
    // user-event types on the real clock; nothing here needs the beat's timer.
    vi.useRealTimers();
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    const user = userEvent.setup();
    await user.tab();
    expect(frame()).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Previous cat" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Pause" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Resume" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Next cat" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Open Solo's page" })).toHaveFocus();
    const group = screen.getByRole("group", { name: "Carousel controls" });
    expect(frame().contains(group)).toBe(false);
  });

  it("Next fires from Enter and Space, Previous from Enter; Space on a control is not the page's pause (keyboard path)", async () => {
    vi.useRealTimers();
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    const user = userEvent.setup();
    screen.getByRole("button", { name: "Next cat" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 1, name: "Clip" })).toBeInTheDocument();
    // A manual move pauses (FR-064); Space on the focused button is that button's own
    // activation, not a second toggle — so the loop stays paused and the cat moves on.
    expect(stage()).toHaveAttribute("data-paused", "true");
    await user.keyboard(" ");
    expect(screen.getByRole("heading", { level: 1, name: "Olive" })).toBeInTheDocument();
    expect(stage()).toHaveAttribute("data-paused", "true");
    expect(screen.getByRole("button", { name: "Next cat" })).toHaveFocus();
    await user.tab({ shift: true });
    // Pause sits between the two; Shift+Tab again reaches Previous.
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Previous cat" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 1, name: "Clip" })).toBeInTheDocument();
  });
});

// F62 (ADR-009, FR-066): the slow-network gap — the incoming photo is a CSS
// background-image set at the boundary with nothing warming it ahead of time, so on a
// slow connection the wipe reveals nothing until the file lands. `usePreloadNext` warms
// one beat ahead without ever touching the beat clock (the timer assertions above are
// untouched by this).
describe("Carousel — preloads the next beat (F62, ADR-009, FR-066)", () => {
  function preloadLinks(): HTMLLinkElement[] {
    return Array.from(document.head.querySelectorAll('link[rel="preload"]'));
  }

  it("preloads the next beat's photo pick with a <link rel=preload>, one beat ahead, replacing it as the beat advances", () => {
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    // On show: Solo (index 0, loop 0). The next beat is Clip's loop-0 pick — its photo,
    // since Clip's candidates cycle photo (loop 0) then video (loop 1).
    expect(preloadLinks()).toHaveLength(1);
    expect(preloadLinks()[0]).toHaveAttribute("as", "image");
    expect(preloadLinks()[0]).toHaveAttribute("href", CLIP.photos[0]?.src);

    act(() => vi.advanceTimersByTime(MS)); // now Clip, loop 0
    expect(preloadLinks()).toHaveLength(1); // the old preload is gone, not accumulated
    expect(preloadLinks()[0]).toHaveAttribute("href", OLIVE.photos[0]?.src);

    act(() => vi.advanceTimersByTime(MS)); // now Olive, loop 0 — the last cat in the roster
    expect(preloadLinks()).toHaveLength(1);
    // Wrapping past the end bumps the loop: the next beat is Solo's *loop-1* pick.
    expect(preloadLinks()[0]).toHaveAttribute("href", SOLO.photos[0]?.src);
  });

  it("removes its preload link on unmount, leaving nothing behind in <head>", () => {
    const { unmount } = render(<Carousel roster={ROSTER} hold={HOLD} />);
    expect(preloadLinks()).toHaveLength(1);
    unmount();
    expect(preloadLinks()).toHaveLength(0);
  });

  // A clip is warmed by a detached `<video preload="auto">`, never attached to the page —
  // its only job is starting the fetch a beat early. Neither this nor a
  // `<link rel="preload" as="video">` (tried first) was seen to reliably let the later
  // *visible* `<video>` skip its own fetch under a throttled connection (see the e2e's
  // throttled case and `paint.ts`'s `BoundaryCheckOptions` doc for the diagnosis); this
  // test only pins the DOM contract — the element's shape and its release — not a
  // reuse guarantee neither technique can make.
  it("warms the next beat's clip with a detached <video preload=auto>, not a <link>", () => {
    const created: HTMLVideoElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = create(tag);
      if (tag === "video") created.push(el as HTMLVideoElement);
      return el;
    });
    render(<Carousel roster={ROSTER} hold={HOLD} />);
    act(() => vi.advanceTimersByTime(MS)); // now Clip, loop 0 (its photo)
    act(() => vi.advanceTimersByTime(MS)); // now Olive, loop 0
    act(() => vi.advanceTimersByTime(MS)); // now Solo, loop 1 — next is Clip's loop-1 pick: its clip
    expect(created).toHaveLength(1); // nothing on show is a clip yet, so only the preload's
    const [video] = created;
    expect(document.body.contains(video ?? null)).toBe(false);
    expect(video?.preload).toBe("auto");
    expect(video?.muted).toBe(true);
    expect(video?.src).toContain(CLIP.video?.src ?? "");
    expect(preloadLinks()).toHaveLength(0); // no stray <link> for the clip

    // FR-066 (an 8-hour run): the next beat lands (Clip's clip, now shown for real), which
    // runs this effect's cleanup on the beat before — the detached video is released, not
    // held onto, so a full day of beats never accumulates a buffered clip per beat.
    act(() => vi.advanceTimersByTime(MS));
    expect(video?.hasAttribute("src")).toBe(false);
  });
});

describe("Carousel — reduced motion (FR-069)", () => {
  it("installs no timer, never plays the clip, and still pages by arrow", () => {
    stubMatchMedia(true);
    const { play, pause } = stubPlayback();
    render(<Carousel roster={[CLIP, SOLO]} hold={HOLD} />);
    // Loop 0 is Clip's photo; a manual wrap forward reaches loop 1, the clip.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("heading", { level: 1, name: "Clip" })).toBeInTheDocument();
    expect(document.querySelector("video")).toHaveAttribute("poster", CLIP.video?.poster);
    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(stage()).toHaveAttribute("data-reduced", "true");
    // Nothing moves by itself, so there is nothing to pause: no such control is offered.
    expect(screen.queryByRole("button", { name: /Pause|Resume/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Next cat" })).toBeInTheDocument();
  });
});

describe("Carousel — a roster that changes (FR-061, FR-066)", () => {
  it("a roster that shrinks under the beat shows its last cat, never a hole", () => {
    const { rerender } = render(<Carousel roster={ROSTER} hold={HOLD} />);
    for (let i = 0; i < 2; i++) act(() => vi.advanceTimersByTime(MS));
    expect(screen.getByRole("heading", { level: 1, name: "Olive" })).toBeInTheDocument();
    rerender(<Carousel roster={[SOLO]} hold={HOLD} />);
    expect(screen.getByRole("heading", { level: 1, name: "Solo" })).toBeInTheDocument();
    expect(screen.getByText("01 / 01")).toBeInTheDocument();
  });
});

describe("Carousel — empty rotation (FR-067)", () => {
  it("says the three sentences and draws no frame", () => {
    render(<Carousel roster={[]} hold={HOLD} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Nothing in the rotation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No cats are on the carousel right now.")).toBeInTheDocument();
    expect(screen.getByText(/Switch a cat back to IN/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
