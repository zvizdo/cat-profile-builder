"use client";
import { useId } from "react";
import type { BlockInput } from "@/core/profile/operations";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { BLOCK_TYPES, emptyBlock, tileName } from "./block-content";
import { useWorkingLock } from "./working-lock";

// The `Add section` tiles (hi-fi 3a; CONTENT.md → Rail): a 2-up grid of the seven addable
// types — the hero is never one of them, since every profile already has one, mandatory
// and fixed at the top (F1, FR-021). Each adds its empty block at the end of the stack.
// Whether the add is legal is core's call, not the tile's.

export interface AddSectionTilesProps {
  onAdd: (block: BlockInput) => void;
}

const TILE =
  "min-h-44 rounded-control border border-line-tag px-12 py-8 text-left font-text text-ui-dense font-medium text-ink " +
  "transition-colors duration-hover ease-default hover:border-blue hover:text-blue " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue " +
  "disabled:pointer-events-none disabled:opacity-50";

/** A region named `Add section`: one button per type, ≥44px, in the rail's order. */
export function AddSectionTiles({ onAdd }: AddSectionTilesProps) {
  const labelId = useId();
  const working = useWorkingLock();
  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-12">
      <h2 id={labelId}>
        <MonoLabel className="text-meta">Add section</MonoLabel>
      </h2>
      <div className="grid grid-cols-2 gap-8">
        {BLOCK_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            data-add-section={type}
            disabled={working}
            className={TILE}
            onClick={() => onAdd(emptyBlock(type))}
          >
            {tileName(type)}
          </button>
        ))}
      </div>
    </section>
  );
}
