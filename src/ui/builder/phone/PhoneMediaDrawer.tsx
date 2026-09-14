"use client";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { placementsOf } from "@/core/profile/image-slots";
import { describeOperation } from "@/core/profile/operations";
import { OpenEnhanceCompare } from "../EnhanceCompare";
import { ENHANCE_LABEL, IN_FLIGHT } from "../enhance-state";
import { MediaLibrary } from "../MediaLibrary";
import type { DocumentSession } from "../use-document";
import { useEnhance, type FocusAfter, type TextAction } from "../use-enhance";
import type { MediaLibraryState } from "../use-media-library";

// The Media drawer's content (design 2026-09-13 §5): the library inside the phone's
// Full sheet, whose own header carries the count and Close — Upload first, the tiles,
// and on a tile the F38/F39 card with `Focal point` / `Trim` / `Enhance…` / `Remove`
// and the `On the page` line. Focal point, trim and the compare open over the drawer
// (mounted inside it, so the sheet's key stack hands Escape to them first) and give
// focus back to the card. `Enhance…` is the frames' own enhance (T045) asked from the
// card: the compare's `Use enhanced` is one `replace_image` on the photo's first
// placement — a photo not on the page has no slot for the copy to go to, so its card
// offers nothing; the frame offers it once the photo is placed. Placing is never done
// here: a slot's picker is (`PhotoSlot`).

export interface PhoneMediaDrawerProps {
  session: DocumentSession;
  library: MediaLibraryState;
  /** Whether the focal and trim editors mount here (inside the sheet) — true while the
   * drawer is up; `PhoneMain` mounts them for the canvas while it is down. */
  editors: boolean;
}

/** The card's own words for the action: sentence case, the ellipsis for a step that asks. */
const CARD_LABEL: Record<string, string> = {
  [ENHANCE_LABEL.enhance]: "Enhance…",
  [ENHANCE_LABEL.revert]: "Revert to original",
  [IN_FLIGHT]: "Processing…",
};

/** The card action's element id — its own, apart from the frame's action for the same placement. */
function cardActionId(mediaId: string): string {
  return `media-card-${mediaId}-enhance`;
}

/** After the compare, focus returns to the card's action on the original. */
const cardAction: FocusAfter = ({ original }) => cardActionId(original.id);

/** The library in the sheet, with `Enhance…` on a placed photo's card. */
export function PhoneMediaDrawer({ session, library, editors }: PhoneMediaDrawerProps) {
  const { state, apply } = session;
  const enhancing = useEnhance(library.assets, library.enhance, cardAction);
  const tileActions = (asset: AssetView): TextAction[] => {
    const [placement] = placementsOf(state.doc, asset.id);
    if (placement === undefined) return [];
    const action = enhancing.actionFor(asset.id, placement, apply);
    if (action === null) return [];
    const label = CARD_LABEL[action.label] ?? action.label;
    return [{ ...action, id: cardActionId(asset.id), label }];
  };
  return (
    <>
      <MediaLibrary
        profileId={state.doc.id}
        library={library}
        doc={state.doc}
        heading={false}
        editors={editors}
        upload="first"
        tileActions={tileActions}
      />
      <OpenEnhanceCompare
        enhancing={enhancing}
        describe={(op) => describeOperation(state.doc, op, library.assets)}
        onApply={apply}
      />
    </>
  );
}
