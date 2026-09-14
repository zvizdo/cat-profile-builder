import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Video } from "@/ui/profile/blocks/Video";
import { blockOf, stubMatchMedia, stubPlayback, videoEntry } from "./fixtures";

// The video section (FR-085, FR-069, ADR-006): plays by itself, silently, loops, and
// offers a visible pause — never a `controls` bar with a volume, never a way to turn
// sound on. Without a poster the striped placeholder stands under the clip, never a blank
// frame. Under reduced motion nothing plays until the person asks.

const block = blockOf("video");
const media = videoEntry(block.mediaId ?? "");

beforeEach(() => stubMatchMedia(false));
afterEach(() => vi.restoreAllMocks());

function video(): HTMLVideoElement {
  const element = document.querySelector("video");
  if (element === null) throw new Error("no video");
  return element;
}

describe("Video", () => {
  it("starts by itself, muted, loops, plays inline, and carries the manifest's poster", () => {
    const { play } = stubPlayback();
    render(<Video media={media} />);
    const element = video();
    expect(play).toHaveBeenCalledTimes(1);
    expect(element.muted).toBe(true);
    expect(element).not.toHaveAttribute("autoplay");
    expect(element).toHaveAttribute("loop");
    expect(element).toHaveAttribute("playsinline");
    expect(element).toHaveAttribute("poster", media.poster);
    expect(element).toHaveAttribute("src", media.src);
    expect(element).toHaveAttribute("aria-label", media.alt);
  });

  it("has no controls attribute and no sound control of any kind", () => {
    stubPlayback();
    render(<Video media={media} />);
    expect(video()).not.toHaveAttribute("controls");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /sound|mute|volume/i })).toBeNull();
    expect(screen.getByText("0:09 · no sound")).toBeInTheDocument();
  });

  it("shows the striped placeholder as the poster when the manifest has none", () => {
    stubPlayback();
    render(<Video media={{ ...media, poster: undefined }} />);
    expect(video()).not.toHaveAttribute("poster");
    expect(screen.getByText("clip")).toBeInTheDocument();
  });

  it("pauses and resumes from its one visible control", async () => {
    const { play, pause } = stubPlayback();
    render(<Video media={media} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("the pause control is reached by Tab and toggles from Enter and Space (keyboard path)", async () => {
    const { play, pause } = stubPlayback();
    render(<Video media={media} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "Pause" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play" })).toHaveFocus();
    await user.keyboard(" ");
    expect(play).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Pause" })).toHaveFocus();
  });

  it("does not play by itself under reduced motion", () => {
    stubMatchMedia(true);
    const { play, pause } = stubPlayback();
    render(<Video media={media} />);
    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(video().muted).toBe(true);
  });

  it("reads as paused when the browser refuses to start it", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("NotAllowed"));
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    render(<Video media={media} />);
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("draws the placeholder with no video at all when the clip is not in the manifest", () => {
    render(<Video media={undefined} />);
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByText("clip")).toBeInTheDocument();
  });
});
