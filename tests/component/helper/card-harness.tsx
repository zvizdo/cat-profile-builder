import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { PendingCard } from "@/core/helper/reducer";
import type { MediaChange, RemovalPreview } from "@/core/profile/media-change";
import type { Description, EditOperation } from "@/core/profile/operations";
import type { TextChange } from "@/core/profile/text-change";
import { ProposalCard } from "@/ui/helper/ProposalCard";

// The one way the two `ProposalCard` test files render a card on its own (split in F58 so
// neither file is over the 400-line ceiling): a `describe` stub that answers whatever the
// test says, so the card is proven to draw what it is handed and never to guess.

export const CARD: PendingCard = {
  toolCallId: "call-1",
  op: { op: "remove_block", blockId: "video1aaaaa" },
  summary: "Remove the video. Removing the video takes the clip off Charlotte's page.",
};

function describing(
  destructive: boolean,
  detail = "Detail text for the notice.",
  readout?: Description["readout"],
) {
  return (_op: EditOperation): Description => ({
    summary: CARD.summary,
    destructive,
    detail,
    ...(readout === undefined ? {} : { readout }),
  });
}

interface RenderOptions {
  destructive?: boolean;
  readout?: Description["readout"];
  card?: PendingCard;
  change?: TextChange | null;
  /** F59: the `replace_image` / gallery `set_field mediaIds` before → after. */
  media?: MediaChange | null;
  /** F59: the `remove_block` struck line and its face. */
  removal?: RemovalPreview | null;
  /** F59: `library.assets`, for `media`/`removal`'s thumbnails. */
  assets?: readonly AssetView[];
  onApply?: () => void;
  onDecline?: () => void;
}

export function renderCard(options: RenderOptions = {}) {
  const onApply = options.onApply ?? vi.fn();
  const onDecline = options.onDecline ?? vi.fn();
  const view = render(
    <ProposalCard
      card={options.card ?? CARD}
      change={options.change ?? null}
      media={options.media ?? null}
      removal={options.removal ?? null}
      assets={options.assets ?? []}
      describe={describing(options.destructive ?? true, undefined, options.readout)}
      onApply={onApply}
      onDecline={onDecline}
    />,
  );
  return { onApply, onDecline, container: view.container };
}
