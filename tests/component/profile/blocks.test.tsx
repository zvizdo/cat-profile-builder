import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { contrastRatio, PRESETS, type ResolvedTheme } from "@/core/profile/theme";
import { Bio } from "@/ui/profile/blocks/Bio";
import { Gallery } from "@/ui/profile/blocks/Gallery";
import { Needs } from "@/ui/profile/blocks/Needs";
import { Photo } from "@/ui/profile/blocks/Photo";
import { Quote } from "@/ui/profile/blocks/Quote";
import { ProfileImage } from "@/ui/profile/ProfileImage";
import { RichText } from "@/ui/profile/RichText";
import { blockOf, manifestFor, MAXIMAL, photoEntry } from "./fixtures";

// The read-only renderers given the maximal document (constitution I: document and
// manifest in, React out; VI: user text is never HTML). Layout is the stylesheet's and is
// checked in the browser; what is asserted here is the content and its semantics.

const media = manifestFor(MAXIMAL);

describe("RichText", () => {
  it("renders runs as p, strong, em and a[rel=noopener], never as HTML", () => {
    render(
      <RichText
        content={{
          paragraphs: [
            {
              runs: [
                { text: "She is " },
                { text: "patient", bold: true },
                { text: " and ", italic: true },
                { text: "here", href: "https://example.org/x" },
                { text: " <b>not bold</b>" },
              ],
            },
            { runs: [] },
          ],
        }}
      />,
    );
    expect(document.querySelectorAll("p")).toHaveLength(2);
    expect(screen.getByText("patient").tagName).toBe("STRONG");
    expect(screen.getByText("and").tagName).toBe("EM");
    const link = screen.getByRole("link", { name: "here" });
    expect(link).toHaveAttribute("href", "https://example.org/x");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(screen.getByText("<b>not bold</b>")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("nests every mark of one run", () => {
    render(
      <RichText
        content={{
          paragraphs: [
            { runs: [{ text: "all", bold: true, italic: true, href: "https://example.org" }] },
          ],
        }}
      />,
    );
    const link = screen.getByRole("link", { name: "all" });
    expect(link.querySelector("strong em")).not.toBeNull();
  });
});

describe("Bio", () => {
  const strings = { who: "Who she is" };

  it("leads with the heading and the display line, then the prose", () => {
    render(<Bio block={blockOf("bio")} lead="Loves sunbeams." strings={strings} id="story" />);
    expect(screen.getByRole("heading", { level: 2, name: "Who she is" })).toBeInTheDocument();
    expect(screen.getByText("Loves sunbeams.")).toBeInTheDocument();
    expect(screen.getByText(/showed up the way good things do/)).toBeInTheDocument();
    expect(document.querySelector("section")).toHaveAttribute("id", "story");
  });

  it("renders a later bio as prose alone", () => {
    render(<Bio block={blockOf("bio")} strings={strings} />);
    expect(screen.queryByText("Who she is")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(document.querySelector("section")).not.toHaveAttribute("id");
  });

  // F43: a following bio used to render an empty `<div />` as the grid's first cell — a
  // phantom row that cost an extra grid-gap on the one-column phone layout. The grid
  // should hold the prose and nothing else.
  it("renders the prose as the grid's only child when it has no lead", () => {
    render(<Bio block={blockOf("bio")} strings={strings} />);
    const grid = document.querySelector("section")?.firstElementChild;
    expect(grid?.children).toHaveLength(1);
    expect(grid?.firstElementChild).toHaveTextContent(/showed up the way good things do/);
  });
});

describe("Photo", () => {
  it("shows the photo on its focal point with the caption", () => {
    const block = blockOf("photo");
    render(<Photo block={block} media={media[block.mediaId ?? ""]} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("alt", `Photo ${block.mediaId}`);
    expect(img).toHaveStyle({ objectPosition: "64% 44%" });
    expect(screen.getByText(block.caption ?? "")).toBeInTheDocument();
  });

  it("stripes an empty slot and keeps the caption", () => {
    const block = blockOf("photo");
    render(<Photo block={block} media={undefined} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("photo")).toBeInTheDocument();
  });
});

describe("Gallery", () => {
  it("renders every photo as a list item with its description, under a heading", () => {
    const block = blockOf("gallery");
    render(<Gallery block={block} media={media} id="photos" />);
    expect(screen.getByRole("heading", { level: 2, name: "Photos" })).toBeInTheDocument();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(12);
    expect(within(items[0] ?? items[0]!).getByRole("img")).toHaveAttribute("alt", "Photo media2aa");
    expect(document.querySelector("section")).toHaveAttribute("id", "photos");
  });

  it("stripes a photo the manifest lacks", () => {
    const block = blockOf("gallery");
    render(<Gallery block={{ ...block, mediaIds: ["media2aa", "nothere1"] }} media={media} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("photo")).toBeInTheDocument();
  });
});

describe("Needs", () => {
  it("renders the heading and every card as a titled item", () => {
    render(<Needs block={blockOf("needs")} strings={{ needs: "What she needs in a home" }} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "What she needs in a home" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "A quiet home",
      "Another cat, eventually",
      "A sunny windowsill",
    ]);
    expect(screen.getByText(/startles at loud noises/)).toBeInTheDocument();
  });

  // F28 review #2: `01`/`02` was `--profile-accent` (the theme's blue) on the card's own
  // ground (`--profile-bg-b`) — 4.27:1 on Paper, an axe `color-contrast` violation. The
  // card's index and its background are read straight from the stylesheet (never
  // hard-coded here), resolved against every preset a volunteer can pick, and each must
  // clear AA (4.5:1) — the fix has to hold for Card, Night and Sand too, not just Paper.
  function cssVarOf(css: string, selector: string, property: string): string {
    const rule = new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`).exec(css);
    if (rule === null) throw new Error(`no .${selector} rule in profile.module.css`);
    const declaration = new RegExp(`${property}:\\s*var\\((--[\\w-]+)\\)`).exec(rule[0]);
    if (declaration?.[1] === undefined) {
      throw new Error(`.${selector} has no var()-valued ${property}`);
    }
    return declaration[1];
  }

  /** `#RRGGBB` `hex` at `alpha` (0..1) over the opaque `backdrop`, both `#RRGGBB`. */
  function blend(hex: string, alpha: number, backdrop: string): string {
    const channel = (colour: string, at: number): number =>
      Number.parseInt(colour.slice(at, at + 2), 16);
    const mix = (fg: number, bg: number): string =>
      Math.round(fg * alpha + bg * (1 - alpha))
        .toString(16)
        .padStart(2, "0");
    return `#${[0, 2, 4]
      .map((at) => mix(channel(hex, at + 1), channel(backdrop, at + 1)))
      .join("")}`.toUpperCase();
  }

  /** Resolves one of the page's `--profile-*`/derived custom properties for a preset. */
  function resolveProfileVar(name: string, preset: ResolvedTheme): string {
    switch (name) {
      case "--profile-accent":
        return preset.accent;
      case "--profile-ink":
        return preset.ink;
      case "--profile-bg-a":
        return preset.backgroundA;
      case "--profile-bg-b":
        return preset.backgroundB;
      // ink-body/meta are `color-mix(in srgb, var(--profile-ink) N%, transparent)`,
      // painted over whatever ground the text sits on (here, the card's own).
      case "--ink-body":
        return blend(preset.ink, 0.86, preset.backgroundB);
      case "--ink-meta":
        return blend(preset.ink, 0.68, preset.backgroundB);
      case "--color-card":
        return "#FFFFFF";
      default:
        throw new Error(`test does not resolve ${name} yet`);
    }
  }

  it("keeps the card index at AA contrast on its card, on every theme preset", () => {
    const css = readFileSync(resolve(process.cwd(), "src/ui/profile/profile.module.css"), "utf8");
    const indexVar = cssVarOf(css, "cardIndex", "color");
    const cardVar = cssVarOf(css, "card", "background");
    for (const [name, preset] of Object.entries(PRESETS)) {
      const index = resolveProfileVar(indexVar, preset);
      const card = resolveProfileVar(cardVar, preset);
      expect(
        contrastRatio(index, card),
        `${name}: ${indexVar} on ${cardVar}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("Quote", () => {
  it("renders the line as a blockquote over the photo, with its attribution", () => {
    const block = blockOf("quote");
    render(<Quote block={block} media={media[block.mediaId ?? ""]} />);
    expect(screen.getByText(block.text).closest("blockquote")).not.toBeNull();
    expect(screen.getByText("Her foster, Priya")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("alt", `Photo ${block.mediaId}`);
  });

  it("stands without an attribution or a photo", () => {
    const block = blockOf("quote");
    render(<Quote block={{ ...block, attribution: undefined }} media={undefined} />);
    expect(screen.getByText(block.text)).toBeInTheDocument();
    expect(screen.queryByText("Her foster, Priya")).toBeNull();
    expect(screen.getByText("photo")).toBeInTheDocument();
  });
});

describe("ProfileImage", () => {
  it("sets object-position from the focal point and sizes per surface", () => {
    render(<ProfileImage media={photoEntry("media2aa", { x: 12, y: 87 })} sizes="100vw" />);
    const img = screen.getByRole("img");
    expect(img).toHaveStyle({ objectPosition: "12% 87%" });
    expect(img).toHaveAttribute("sizes", "100vw");
    expect(img).toHaveAttribute("alt", "Photo media2aa");
  });

  it("optimises a bucket photo and a root-relative one alike", () => {
    const optimised = /^\/_next\/image\?url=/;
    const { unmount } = render(<ProfileImage media={photoEntry("media2aa")} sizes="100vw" />);
    expect(screen.getByRole("img").getAttribute("src")).toMatch(optimised);
    unmount();
    const relative = { ...photoEntry("media2aa"), src: "/media/x/clean.0.jpg" };
    render(<ProfileImage media={relative} sizes="100vw" />);
    expect(screen.getByRole("img").getAttribute("src")).toMatch(optimised);
  });

  it("loads a priority image eagerly and every other one lazily", () => {
    const { unmount } = render(
      <ProfileImage media={photoEntry("media2aa")} sizes="100vw" priority />,
    );
    expect(screen.getByRole("img")).not.toHaveAttribute("loading", "lazy");
    unmount();
    render(<ProfileImage media={photoEntry("media2aa")} sizes="100vw" />);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
  });
});
