"use client";
import { useState } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { EditOperation } from "@/core/profile/operations";
import {
  ENHANCE_LABEL,
  enhanceActionFor,
  IN_FLIGHT,
  readyPhoto,
  replaceIn,
  type Placement,
  type ReadyPhoto,
} from "./enhance-state";
import { useRefocus } from "./use-refocus";

// One placement's enhancement, from the click to the compare view (T045). The server call
// and the library append are the library's (`useMediaLibrary.enhance`); this hook only
// remembers which placement is waiting on it and which compare is open, so an editor
// with several slots (a gallery, a day) marks the one slot that is `processing`.

/**
 * The library's `enhance`: runs the recipe on `mediaId`, appends the new record to the
 * library, and hands it to `onEnhanced` — after a `Try again` as well, so a compare can
 * still open from a retried call. Answers whether the call landed.
 */
export type EnhanceFn = (
  mediaId: string,
  onEnhanced: (asset: AssetView) => void,
) => Promise<boolean>;

/** The compare view's subject: the two records and the placement it was opened from. */
export interface OpenCompare {
  original: ReadyPhoto;
  enhanced: ReadyPhoto;
  placement: Placement;
}

/** One text action as a label row or a slot chip draws it; `id` is where focus returns after the compare closes. */
export interface TextAction {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** The element id of a placement's enhance/revert action, stable across the two words it wears. */
export function enhanceActionId({ blockId, slot }: Placement): string {
  return slot === undefined ? `${blockId}-enhance` : `${blockId}-${slot}-enhance`;
}

/** Where focus goes once a compare closes: an element id, from the compare that was open. */
export type FocusAfter = (compare: OpenCompare) => string;

/** The default: the placement's own action — now `revert to original`, or `enhance` again. */
const actionOf: FocusAfter = ({ placement }) => enhanceActionId(placement);

/** What `useEnhance` answers. */
export interface Enhancing {
  compare: OpenCompare | null;
  /** Closes the compare and returns focus where `focusAfter` says. */
  closeCompare: (compare: OpenCompare) => void;
  /**
   * The action `placement` offers for `mediaId`, ready to draw: `enhance` (reads
   * `processing` and is disabled while its call runs), `revert to original` (one
   * `replace_image` back to the source through `onApply`), or `null` for none.
   */
  actionFor: (
    mediaId: string | null,
    placement: Placement,
    onApply: (op: EditOperation) => void,
  ) => TextAction | null;
}

/**
 * The enhancement state of one editor's placements over the library's `enhance`.
 * `focusAfter` names where focus lands when the compare closes — by default the
 * placement's own action (the block editors); phone mode, whose action button leaves
 * with the swap, names the tile instead.
 */
export function useEnhance(
  assets: readonly AssetView[],
  onEnhance: EnhanceFn,
  focusAfter: FocusAfter = actionOf,
): Enhancing {
  const [busy, setBusy] = useState<string | null>(null);
  const [compare, setCompare] = useState<OpenCompare | null>(null);
  const refocus = useRefocus();

  const start = async (original: ReadyPhoto, placement: Placement) => {
    setBusy(enhanceActionId(placement));
    await onEnhance(original.id, (landed) => {
      // `enhancePhoto` always answers a ready photo with its clean file (ADR-016), but the
      // view's type keeps `cleanUrl` optional, so it is narrowed here rather than asserted.
      const enhanced = readyPhoto(landed);
      if (enhanced !== undefined) setCompare({ original, enhanced, placement });
    });
    setBusy(null);
  };

  const actionFor: Enhancing["actionFor"] = (mediaId, placement, onApply) => {
    const action = enhanceActionFor(mediaId, assets);
    if (action === null) return null;
    const id = enhanceActionId(placement);
    if (action.kind === "revert") {
      const op = replaceIn(placement, action.sourceMediaId);
      return { id, label: ENHANCE_LABEL.revert, onClick: () => onApply(op) };
    }
    const inFlight = busy === id;
    return {
      id,
      label: inFlight ? IN_FLIGHT : ENHANCE_LABEL.enhance,
      disabled: inFlight,
      onClick: () => void start(action.original, placement),
    };
  };

  // The action's button lost focus when it went `processing` (a disabled control cannot
  // hold it), so the modal has no opener to return to: focus goes where `focusAfter`
  // says, by id, once the render lands.
  const closeCompare = (open: OpenCompare) => {
    refocus(focusAfter(open));
    setCompare(null);
  };

  return { compare, closeCompare, actionFor };
}
