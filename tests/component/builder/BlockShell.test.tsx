import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockFrame } from "@/ui/builder/BlockFrame";
import { TOUCH_QUERY } from "@/ui/builder/blocks/use-touch-band";
import { block } from "./canvas-fixtures";

// F47 (F28 review #6; comp 7c "iPad 1024×768 · touch-first"): between the phone floor
// (768) and the docked `wide` column (1180) a finger cannot summon a hover-revealed
// row, so the label row's actions — the editor's own, `duplicate`, `remove` — draw as
// always-visible ≥44px bordered pills instead (comp 7c's own bordered chips win over
// the task's plain-text `ghost`/`danger` reading — ruling, 2026-09-13). At `wide`
// (1180) and up the hover-gated text row is unchanged. Below 768 the phone builder's
// own row (`PhoneLabelRow`) is untouched — out of scope here.

/** A `matchMedia` answering `matches` for the touch query, as the window would at a
 *  given width. */
function stubMatchMedia(touchBandMatches: boolean) {
  // Only the touch query answers `touchBandMatches`; every other query (`useSurface`'s
  // phone query included) answers `false` — the window this test stands in is never
  // under 768px, whichever band it names.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: media === TOUCH_QUERY ? touchBandMatches : false,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderBio() {
  const handlers = {
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    onApply: vi.fn(),
    onOpenTrim: vi.fn(),
    onEnhance: vi.fn(() => Promise.resolve(false)),
    onAskHelper: vi.fn(),
  };
  render(
    <DndContext>
      <SortableContext items={["bioaaaaaaaaa"]}>
        <ol>
          <BlockFrame
            block={block("bio", "bioaaaaaaaaa")}
            index={0}
            count={1}
            catName="Charlotte"
            assets={[]}
            describe={() => ({ summary: "", destructive: false, detail: "" })}
            {...handlers}
          />
        </ol>
      </SortableContext>
    </DndContext>,
  );
  return handlers;
}

describe("BlockShell's label row across the touch band", () => {
  it("at 1024 (touch band): every action is a bordered pill, visible with no hover, ≥44px, remove keeps clay", () => {
    stubMatchMedia(true);
    renderBio();
    const rewrite = screen.getByRole("button", { name: "rewrite" });
    const duplicate = screen.getByRole("button", { name: "duplicate" });
    const remove = screen.getByRole("button", { name: "remove" });
    const row = duplicate.parentElement;
    // Visible at rest: no hover-gating classes on the row that holds the pills.
    expect(row).not.toHaveClass("opacity-0");
    expect(row).not.toHaveClass("hidden");
    expect(row).not.toHaveClass("group-hover:opacity-100");
    // The tap floor, on every pill.
    for (const el of [rewrite, duplicate, remove]) {
      expect(el).toHaveClass("min-h-44");
    }
    // Comp 7c's bordered chip (`secondary`), not the bare text link.
    expect(rewrite).toHaveClass("border", "border-line-button", "text-ink");
    expect(duplicate).toHaveClass("border", "border-line-button", "text-ink");
    // `remove` keeps clay, but as the `destructive` chip's own border + fill-on-hover.
    expect(remove).toHaveClass("border", "border-clay", "text-clay");
    // Comp 7c's pills are fully rounded (`radius.pill`, 99px) — `Pill` overrides
    // `Button`'s own square 4px `rounded-control` in the compiled stylesheet (F47 review
    // finding #1; the override is a real CSS cascade fact jsdom cannot see, measured
    // directly in the browser instead — see the report).
    for (const el of [rewrite, duplicate, remove]) {
      expect(el).toHaveClass("rounded-pill");
    }
  });

  it("at 1440 (wide, pointer): the row is still hover-gated, exactly as before", () => {
    stubMatchMedia(false);
    renderBio();
    const duplicate = screen.getByRole("button", { name: "duplicate" });
    const row = duplicate.parentElement;
    // JS-gated (only ever mounts at `wide` and up), so no breakpoint class is needed —
    // just the hover/focus reveal (F47 review finding #4: no vestigial `md:flex`).
    expect(row).toHaveClass(
      "flex",
      "opacity-0",
      "group-hover:opacity-100",
      "group-focus-within:opacity-100",
    );
    expect(row).not.toHaveClass("hidden");
    expect(row).not.toHaveClass("md:flex");
  });

  it("clicking the pills still calls the handlers", () => {
    stubMatchMedia(true);
    const handlers = renderBio();
    screen.getByRole("button", { name: "duplicate" }).click();
    screen.getByRole("button", { name: "remove" }).click();
    expect(handlers.onDuplicate).toHaveBeenCalledTimes(1);
    expect(handlers.onRemove).toHaveBeenCalledTimes(1);
  });
});
