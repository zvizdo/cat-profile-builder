import { describe, expect, it } from "vitest";
import { navItems, sectionId } from "@/ui/profile/nav-items";
import type { Block } from "@/core/profile/schema";

// The in-page nav is built from the blocks present (T028): one link per section kind that
// has a name, pointing at the first block of that kind, in page order. Photo and quote
// sections are photographic beats with no entry; a block's own id never appears.

const blocks: Block[] = [
  { id: "blockaaaaaaa", type: "hero", mediaId: "media2aa" },
  { id: "blockaaaaaab", type: "quote", mediaId: "media2aa", text: "A line." },
  { id: "blockaaaaaac", type: "bio", content: { paragraphs: [] } },
  { id: "blockaaaaaad", type: "bio", content: { paragraphs: [] } },
  { id: "blockaaaaaae", type: "gallery", mediaIds: [] },
  { id: "blockaaaaaaf", type: "video", mediaId: null },
  {
    id: "blockaaaaaag",
    type: "day",
    scenes: [
      { mediaId: null, caption: "" },
      { mediaId: null, caption: "" },
      { mediaId: null, caption: "" },
    ],
  },
  { id: "blockaaaaaah", type: "needs", cards: [{ title: "", text: "" }] },
  { id: "blockaaaaaai", type: "photo", mediaId: null },
];

describe("navItems", () => {
  it("lists one link per named section kind, first occurrence, in page order", () => {
    expect(navItems(blocks, "female")).toEqual([
      { href: "#story", label: "Story" },
      { href: "#photos", label: "Photos" },
      { href: "#film", label: "Film" },
      { href: "#day", label: "Her day" },
      { href: "#needs", label: "Needs" },
    ]);
  });

  it("is empty for a page of hero, photo and quote sections only", () => {
    expect(
      navItems(
        blocks.filter((b) => ["hero", "photo", "quote"].includes(b.type)),
        "male",
      ),
    ).toEqual([]);
  });
});

describe("sectionId", () => {
  it("names the first block of a kind and no other", () => {
    expect(sectionId(blocks, "blockaaaaaac")).toBe("story");
    expect(sectionId(blocks, "blockaaaaaad")).toBeUndefined();
    expect(sectionId(blocks, "blockaaaaaab")).toBeUndefined();
    expect(sectionId(blocks, "blockaaaaaag")).toBe("day");
  });
});
