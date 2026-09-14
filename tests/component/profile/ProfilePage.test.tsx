import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Facts } from "@/ui/profile/Facts";
import { Nav } from "@/ui/profile/Nav";
import { ProfilePage } from "@/ui/profile/ProfilePage";
import { manifestFor, MAXIMAL, stubMatchMedia, stubPlayback } from "./fixtures";

// The whole page from the maximal document (FR-059, spec Clarifications 2026-09-10): the
// name as the one h1, the facts strip, the in-page nav, one section per block — and
// nothing the volunteer did not put there: no footer, no "updated" line, no adoption
// CTA, no block id, no timestamp, no sound control.

const media = manifestFor(MAXIMAL);

beforeEach(() => {
  stubMatchMedia(false);
  stubPlayback();
});
afterEach(() => vi.restoreAllMocks());

describe("ProfilePage", () => {
  it("renders the name as the h1, the display line, the facts and one section per block", () => {
    render(<ProfilePage document={MAXIMAL} media={media} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Charlotte" })).toBeInTheDocument();
    expect(screen.getAllByText("Loves sunbeams and gentle chin scratches.").length).toBeGreaterThan(
      0,
    );
    const facts = screen.getByRole("list", { name: "Facts" });
    expect(within(facts).getByText("3 years")).toBeInTheDocument();
    expect(within(facts).getByText("Female")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main.querySelectorAll(":scope > section")).toHaveLength(MAXIMAL.blocks.length);
  });

  it("embedded, keeps its content in a div so the page around it holds the one main", () => {
    const { container } = render(<ProfilePage document={MAXIMAL} media={media} embedded />);
    expect(screen.queryByRole("main")).toBeNull();
    const content = container.querySelector("header + div") as HTMLElement;
    expect(content.querySelectorAll(":scope > section")).toHaveLength(MAXIMAL.blocks.length);
    expect(screen.getByRole("heading", { level: 1, name: "Charlotte" })).toBeInTheDocument();
  });

  it("carries the theme as the four --profile-* properties on its root", () => {
    const { container } = render(<ProfilePage document={MAXIMAL} media={media} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--profile-bg-a")).toMatch(/^#/);
    expect(root.style.getPropertyValue("--profile-accent")).toMatch(/^#/);
  });

  it("has no footer, no 'updated' line, no adoption call to action", () => {
    const { container } = render(<ProfilePage document={MAXIMAL} media={media} />);
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
    expect(container.textContent).not.toMatch(/updated/i);
    expect(container.textContent).not.toMatch(/adopt|application/i);
  });

  it("puts no block id, timestamp or draft field into the markup", () => {
    const { container } = render(<ProfilePage document={MAXIMAL} media={media} />);
    const html = container.innerHTML;
    for (const block of MAXIMAL.blocks) expect(html).not.toContain(block.id);
    expect(html).not.toContain(MAXIMAL.updatedAt);
    expect(html).not.toContain("schemaVersion");
  });

  it("renders every video muted, without controls, each with its pause", () => {
    render(<ProfilePage document={MAXIMAL} media={media} />);
    const videos = document.querySelectorAll("video");
    expect(videos).toHaveLength(2);
    videos.forEach((video) => {
      expect(video.muted).toBe(true);
      expect(video).not.toHaveAttribute("controls");
    });
    expect(screen.getAllByRole("button", { name: "Pause" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /sound|mute|volume/i })).toBeNull();
  });

  it("hides the facts list when neither age nor sex is set", () => {
    const doc = { ...MAXIMAL, age: undefined, sex: undefined };
    render(<ProfilePage document={doc} media={media} />);
    expect(screen.getByRole("heading", { level: 1, name: "Charlotte" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Facts" })).toBeNull();
  });

  it("stripes a hero whose photo is not in the manifest", () => {
    const rest = Object.fromEntries(Object.entries(media).filter(([id]) => id !== "media2aa"));
    render(<ProfilePage document={MAXIMAL} media={rest} />);
    expect(screen.getByRole("heading", { level: 1, name: "Charlotte" })).toBeInTheDocument();
    expect(screen.getAllByText("photo").length).toBeGreaterThan(0);
  });
});

describe("Nav", () => {
  it("is a labelled navigation of in-page links, with a way back to the index", () => {
    render(
      <Nav
        name="Charlotte"
        items={[
          { href: "#story", label: "Story" },
          { href: "#day", label: "Her day" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getByRole("link", { name: "Story" })).toHaveAttribute("href", "#story");
    expect(within(nav).getByRole("link", { name: "Her day" })).toHaveAttribute("href", "#day");
    const home = screen.getByRole("link", { name: "South County Cats" });
    expect(home).toHaveAttribute("href", "/cats");
    expect(within(home).getByRole("img", { name: "South County Cats" })).toHaveAttribute(
      "src",
      "/logo.png",
    );
  });

  it("Tab reaches the way back, then every section link in order (keyboard path)", async () => {
    const user = userEvent.setup();
    render(
      <Nav
        name="Charlotte"
        items={[
          { href: "#story", label: "Story" },
          { href: "#day", label: "Her day" },
        ]}
      />,
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "South County Cats" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Story" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Her day" })).toHaveFocus();
  });

  it("omits the navigation landmark when there are no sections to link", () => {
    render(<Nav name="Charlotte" items={[]} />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("link", { name: "South County Cats" })).toBeInTheDocument();
  });
});

describe("Facts", () => {
  it("shows Age and Sex, capitalised, and skips what is missing", () => {
    render(<Facts age="3 years" sex="male" />);
    const list = screen.getByRole("list", { name: "Facts" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Age")).toBeInTheDocument();
    expect(within(list).getByText("Male")).toBeInTheDocument();
  });

  it("renders nothing for an unknown sex and no age", () => {
    const { container } = render(<Facts sex="unknown" />);
    expect(container).toBeEmptyDOMElement();
  });
});
