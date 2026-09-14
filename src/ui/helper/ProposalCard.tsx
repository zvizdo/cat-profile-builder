"use client";
import { useEffect, useRef } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import type { PendingCard } from "@/core/helper/reducer";
import type { MediaChange, RemovalPreview } from "@/core/profile/media-change";
import type { Description, EditOperation, Readout } from "@/core/profile/operations";
import type { Theme } from "@/core/profile/schema";
import { drawsBlock, type TextChange } from "@/core/profile/text-change";
import { themeStyle } from "@/ui/builder/theme-css";
import { Button } from "@/ui/shared/Button";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { consequenceHeading, ledgerKey, operationsHeader, rowSentence } from "./card-text";
import { ConsequenceNotice } from "./ConsequenceNotice";
import { PhotoChange } from "./PhotoChange";
import { RemovalBlock } from "./RemovalPreview";
import { ChangeBlock } from "./TextChange";

// CONTENT.md → Helper, Proposal / Consequence / Applied / Dismissed (DESIGN.md §4; hi-fi
// 3a's card): the mono header counting the turn's pending operations — always one today,
// since `turn.card` (T036's reducer) only ever holds a single op — then the **ledger**
// (F26, audit §3.5): one row per operation, a mono key on the left naming what the edit
// touches (`bio`, `order`, `theme`), the plain sentence `describeOperation` gave the card
// on the right, and beside it the before → after readout where the edit has one (`41 → 9
// words`, `4 → 2`, a swatch pair for a theme). The ledger is the panel's one bold element:
// it rhymes with the block labels on the canvas and is what the comp actually drew. The
// consequence notice follows when the same op is destructive, then Apply / Not this. Tab
// reaches Apply, then Not this, in that DOM order; Escape is Not this, from anywhere
// inside the card (parity with the canvas's own Remove-section question). Apply is
// guarded against a second dispatch: a slow double click's two events must still only
// ever tell the model once.
//
// F58: for a text edit the readout grows into the change itself (`TextChange.tsx`) — the
// text the edit replaces and the text it puts there — read from core's `textChange(doc,
// op)`, which the caller hands in as `change`. A pair short enough to read on the line
// (`Charlotte → Marmalade`) keeps the readout as it was; a longer text field draws its two
// values under the sentence in place of the word count; the bio keeps its count beside the
// sentence and draws its word diff under the row. The card's own later states
// (`DismissedCard`, `NotAppliedNote`) are in `CardStates.tsx`.

export interface ProposalCardProps {
  card: PendingCard;
  /** `textChange(doc, card.op)` — the before → after of a text edit, or `null` for an
   * operation that has none (a photo swap, a removal: `media`/`removal` draw those). */
  change: TextChange | null;
  /** F59: `mediaChange(doc, assets, card.op)` — the before → after of a `replace_image`
   * or a gallery's dropped/kept ids, or `null` for every other operation. */
  media: MediaChange | null;
  /** F59: `removalPreview(doc, assets, card.op)` — a `remove_block`'s struck line and
   * its face, or `null` for every other operation. */
  removal: RemovalPreview | null;
  /** F59: `library.assets` — the thumbnails `media`/`removal` draw are the exact ones
   * the rail already shows, cached, no new request. */
  assets: readonly AssetView[];
  /** The same describer every editor uses (editor-props.ts) — never guessed here from the
   * operation's shape, so a future non-destructive card would just as correctly show no
   * notice. */
  describe: (op: EditOperation) => Description;
  onApply: () => void;
  onDecline: () => void;
}

/** A theme readout's swatch: the theme's two backgrounds as the rail's own gradient,
 * painted from `themeStyle`'s custom properties — data on the element, colour in CSS. */
function Swatch({ theme }: { theme: Theme }) {
  return (
    <span
      aria-hidden="true"
      style={themeStyle(theme)}
      className="theme-swatch inline-block size-16 shrink-0 rounded-control border border-line-tag align-middle"
    />
  );
}

/** `41 → 9 words` in the reading mono voice; a theme's pair sits between its two swatches. */
function ReadoutLine({ readout }: { readout: Readout }) {
  const text = `${readout.before} → ${readout.after}${readout.unit === undefined ? "" : ` ${readout.unit}`}`;
  return (
    <MonoLabel variant="reading" className="inline-flex items-center gap-6 text-meta">
      {readout.themes ? <Swatch theme={readout.themes.before} /> : null}
      <span>{text}</span>
      {readout.themes ? <Swatch theme={readout.themes.after} /> : null}
    </MonoLabel>
  );
}

interface LedgerRowProps {
  card: PendingCard;
  description: Description;
  /** The change block to draw — `null` when the card draws none. */
  change: TextChange | null;
}

/** One ledger row: the mono key, the sentence, the readout when there is one, and a text
 * field's two lines under the sentence. */
function LedgerRow({ card, description, change }: LedgerRowProps) {
  const { destructive, readout } = description;
  const pair = change?.kind === "text" ? change : null;
  return (
    <div className="flex items-baseline gap-12">
      <MonoLabel variant="reading" className="w-56 shrink-0 text-meta">
        {ledgerKey(card.op)}
      </MonoLabel>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-8 gap-y-4 text-ui-dense font-normal text-body">
        <span>{rowSentence(card.summary, destructive)}</span>
        {readout === undefined || pair !== null ? null : <ReadoutLine readout={readout} />}
        {pair === null ? null : <ChangeBlock change={pair} />}
      </div>
    </div>
  );
}

/** Wraps `onApply` so a slow double click's two events — a second dispatch — never
 * tell the model twice. */
function useApplyOnce(onApply: () => void): () => void {
  const resolved = useRef(false);
  return () => {
    if (resolved.current) return;
    resolved.current = true;
    onApply();
  };
}

/** Escape is "Not this" from anywhere on the page — on `document`, as `Modal.tsx`'s own
 * Escape does (reads there, not the panel, still arrive when focus has wandered off it);
 * the card is never wrapped in an interactive element of its own. */
function useEscapeDecline(onDecline: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onDecline();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDecline]);
}

/** F59: the image half of the change block, drawn under the ledger row exactly like a
 * `richText`/`cards` `ChangeBlock` is — a photo swap or a gallery's dropped/kept faces,
 * or a removal's struck line and face, whichever the operation answers (never both). */
function ImagePreview(props: Pick<ProposalCardProps, "media" | "removal" | "assets">) {
  const { media, removal, assets } = props;
  if (media !== null) return <PhotoChange change={media} assets={assets} />;
  if (removal !== null) return <RemovalBlock preview={removal} assets={assets} />;
  return null;
}

export function ProposalCard({
  card,
  change,
  media,
  removal,
  assets,
  describe,
  onApply,
  onDecline,
}: ProposalCardProps) {
  const description = describe(card.op);
  // A pair that reads on the line keeps the readout and draws no block.
  const block = drawsBlock(change) ? change : null;
  const apply = useApplyOnce(onApply);
  useEscapeDecline(onDecline);

  return (
    <div className="flex flex-col overflow-hidden rounded-panel border border-line-tag">
      <div className="border-b border-line-panel px-12 py-8">
        <MonoLabel className="text-meta">{operationsHeader(1)}</MonoLabel>
      </div>
      <div className="flex flex-col gap-8 px-12 py-12">
        <LedgerRow card={card} description={description} change={block} />
        {block !== null && block.kind !== "text" ? <ChangeBlock change={block} /> : null}
        <ImagePreview media={media} removal={removal} assets={assets} />
      </div>
      {description.destructive ? (
        <ConsequenceNotice heading={consequenceHeading(card.summary)} detail={description.detail} />
      ) : null}
      <div className="flex items-center gap-8 border-t border-line-panel px-12 py-12">
        <Button dense onClick={apply}>
          Apply
        </Button>
        <Button dense variant="secondary" onClick={onDecline}>
          Not this
        </Button>
        <MonoLabel variant="reading" className="ml-auto text-meta">
          one undo
        </MonoLabel>
      </div>
    </div>
  );
}
