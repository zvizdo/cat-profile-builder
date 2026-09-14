"use client";
import { useMemo, useState } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import {
  cardResolution,
  currentRejection,
  turnStanding,
  type PendingCard,
  type Turn,
} from "@/core/helper/reducer";
import {
  mediaChange,
  removalPreview,
  type MediaChange,
  type RemovalPreview,
} from "@/core/profile/media-change";
import { describeOperation, type EditOperation } from "@/core/profile/operations";
import type { ProfileDocument } from "@/core/profile/schema";
import { textChange, type TextChange } from "@/core/profile/text-change";
import type { DocumentSession } from "@/ui/builder/use-document";
import { DismissedCard, NotAppliedNote } from "./CardStates";
import { ProposalCard } from "./ProposalCard";
import { RefusedNotice } from "./RefusedNotice";
import { TurnSummary } from "./TurnSummary";
import type { Helper } from "./use-helper";

// The one thing shown between the conversation and the composer (split from
// `HelperPanel.tsx`, F45, so the shell file stays about the shell): the live card, its
// own Dismissed state once declined, a single tool call's own refusal, or the turn's
// own summary once it has ended.

export interface CardSlotProps {
  session: DocumentSession;
  helper: Helper;
  turn: Turn;
  /** F59: `library.assets` — the photo and removal previews' thumbnails, threaded down
   * from `HelperPanel` (`Builder.tsx` / `PhoneDrawers.tsx`, where `library` is already
   * in scope). */
  assets: readonly AssetView[];
}

/**
 * The turn's last card while its own `declined` is still the newest thing that happened
 * this turn (`cardResolution`), else `null`. Remembered here — adjusted during render, not
 * in an effect — because a decline sets `turn.card` back to `null`, and the note that
 * follows still needs the card's id (for `cardResolution`) and its summary ("Not applied:
 * …"). `turn.results` is turn-scoped, so a card from an earlier turn finds nothing.
 */
function useDeclinedCard(turn: Turn): PendingCard | null {
  const [prevCard, setPrevCard] = useState(turn.card);
  const [lastCard, setLastCard] = useState<PendingCard | null>(turn.card);
  if (turn.card !== prevCard) {
    setPrevCard(turn.card);
    if (turn.card !== null) setLastCard(turn.card);
  }
  if (lastCard === null) return null;
  return cardResolution(turn, lastCard.toolCallId)?.status === "declined" ? lastCard : null;
}

interface CardPreviews {
  change: TextChange | null;
  media: MediaChange | null;
  removal: RemovalPreview | null;
}

/**
 * `card`'s own before → after, against the live document — which is what Apply will
 * change (F58): the card cannot describe a value the volunteer has since edited, because
 * every editor is locked for as long as it waits, so once per card is enough. Exactly one
 * of the three is ever non-null for a given card, since each reads a disjoint set of
 * operation kinds (F59 adds `media`/`removal` beside F58's own `change`).
 */
function useCardPreviews(
  doc: ProfileDocument,
  assets: readonly AssetView[],
  op: EditOperation | undefined,
): CardPreviews {
  return useMemo(
    () => ({
      change: op === undefined ? null : textChange(doc, op),
      media: op === undefined ? null : mediaChange(doc, assets, op),
      removal: op === undefined ? null : removalPreview(doc, assets, op),
    }),
    [doc, assets, op],
  );
}

/**
 * The live card, its own Dismissed state once declined (T038 review, finding 1), a
 * single tool call's own refusal, or the turn's own summary once it has ended — one
 * four-way choice, kept somewhere it can be read on its own.
 *
 * F26 (audit §1): a turn that applied an edit *and then* carded one the volunteer
 * declined has done two things, and both are reported — `TurnSummary` ("Applied — …",
 * "Undo these") with the decline as a one-line `NotAppliedNote` under it. The full
 * `DismissedCard` ("Nothing on your page changed.") is reserved for a turn where that is
 * true: nothing applied.
 *
 * There is no inline "Applied" state to match: `cardResolution` can already tell an
 * applied card apart from a declined one, but the turn stays `working` (and
 * `session.undo` stays refused, `reduceManual` in use-document.ts) until it ends — an
 * inline "↶ undo" shown in that window would be a control that visibly does nothing.
 * `TurnSummary`'s own "Undo these" already covers applied edits correctly once the turn
 * ends, which is the one thing the controller asked to leave alone.
 */
export function CardSlot({ session, helper, turn, assets }: CardSlotProps) {
  const { state } = session;
  const rejection = currentRejection(turn);
  const declined = useDeclinedCard(turn);
  const { change, media, removal } = useCardPreviews(state.doc, assets, turn.card?.op);

  if (turn.card !== null) {
    return (
      <ProposalCard
        card={turn.card}
        change={change}
        media={media}
        removal={removal}
        assets={assets}
        describe={(op) => describeOperation(state.doc, op, state.helper.assets)}
        onApply={helper.applyCard}
        onDecline={helper.declineCard}
      />
    );
  }
  if (declined !== null && turn.applied.length === 0) {
    return <DismissedCard onReopen={helper.retry} />;
  }
  if (rejection !== null) {
    return <RefusedNotice reason={rejection} onRetry={helper.retry} />;
  }
  const summary = (
    <TurnSummary
      turn={turn}
      standing={turnStanding({ history: state.history, turn })}
      onUndo={session.undo}
      onRedo={session.redo}
      onRetry={helper.retry}
    />
  );
  if (declined === null) return summary;
  return (
    <div className="flex flex-col gap-8">
      {summary}
      <NotAppliedNote summary={declined.summary} onReopen={helper.retry} />
    </div>
  );
}
