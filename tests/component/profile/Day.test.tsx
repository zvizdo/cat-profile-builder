import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Day } from "@/ui/profile/blocks/Day";
import { blockOf, manifestFor, MAXIMAL, stubMatchMedia } from "./fixtures";

// The pinned three-scene day (ADR-009; FR-069): three photo-and-caption figures in scene
// order, every caption in the tree — under reduced motion the stylesheet lays the same
// three out stacked (`profile.module.css`), so the DOM must already be complete and
// unhidden; nothing is revealed by motion alone. A scene with no photo is striped.

const block = blockOf("day");
const media = manifestFor(MAXIMAL);
const strings = { day: "A day in her life" };

beforeEach(() => stubMatchMedia(true));

describe("Day", () => {
  it("renders the heading before the three scenes, each a figure with photo and caption, in order", () => {
    render(<Day block={block} media={media} strings={strings} />);
    const heading = screen.getByRole("heading", { level: 2, name: "A day in her life" });
    const figures = screen.getAllByRole("figure");
    expect(figures).toHaveLength(3);
    const first = figures[0];
    if (first === undefined) throw new Error("fixture");
    expect(heading.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    figures.forEach((figure, index) => {
      const scene = block.scenes[index];
      if (scene === undefined || scene.mediaId === null) throw new Error("fixture");
      expect(within(figure).getByRole("img")).toHaveAttribute("alt", `Photo ${scene.mediaId}`);
      expect(within(figure).getByText(scene.caption)).toBeInTheDocument();
      expect(figure.closest("[aria-hidden='true']")).toBeNull();
    });
  });

  it("marks the three progress dashes decorative and numbers nothing a reader hears", () => {
    render(<Day block={block} media={media} strings={strings} />);
    const dashes = document.querySelector("[data-dashes]");
    expect(dashes).toHaveAttribute("aria-hidden", "true");
  });

  it("stripes a scene whose photo is not in the manifest", () => {
    const scenes = block.scenes.map((scene, index) =>
      index === 1 ? { ...scene, mediaId: null } : scene,
    ) as typeof block.scenes;
    render(<Day block={{ ...block, scenes }} media={media} strings={strings} />);
    expect(screen.getAllByRole("figure")).toHaveLength(3);
    expect(screen.getByText("photo")).toBeInTheDocument();
  });
});
