"use client";
import { useEffect, useRef } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { Badge } from "@/ui/shared/Badge";
import { Button } from "@/ui/shared/Button";
import { IconButton } from "@/ui/shared/IconButton";
import { Close } from "@/ui/shared/icons";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { AltTextField } from "./AltTextField";
import { durationLabel, originalLine, shortFileName } from "./media-state";
import type { TextAction } from "./use-enhance";
import { useWorkingLock } from "./working-lock";

// The media card (F38; media-sidebar-audit §3.2): the one desk for the selected record —
// its name and a way out in the header, an enhanced copy's provenance, the description,
// then the actions as the tools' own ghost buttons. The grid is the map and never moves;
// the card is drawn once, as a full-width row under the tiles, and follows the selected
// tile in the document so Tab reaches it next and `aria-expanded` points at something.

/** The editor a record can open (T023): the focal point sheet or the trim modal. */
export type TileEditor = "focal" | "trim";

export interface MediaCardProps {
  asset: AssetView;
  /** All the library's records, so an enhanced copy can name its original. */
  assets: readonly AssetView[];
  /** Where the record sits on the page — `On the page · hero` / `Not on the page yet` (F39; FR-013). */
  onPage: string;
  /** Clears the selection; the rail hands focus back to the tile. */
  onClose: () => void;
  /** Asks to remove; the library confirms first. */
  onRemove: () => void;
  onDescribe: (text: string) => Promise<boolean>;
  onEdit: (editor: TileEditor) => void;
  /**
   * The surface's own text actions for this record, after the editor's — none today;
   * the phone's Media drawer puts `Enhance…` here (design 2026-09-13 §5, Task 2).
   */
  actions?: TextAction[];
}

/** The element id of the card, so the selected tile can say what it expands. */
export function mediaCardId(mediaId: string): string {
  return `media-card-${mediaId}`;
}

/**
 * How many characters the header line holds: the mono `reading` voice (11px, no
 * tracking — a file name is read back against a camera roll, so its case stays as
 * written) runs about 6.6px a character, and the rail's card gives the name 142px
 * beside the 44px Close button. Under the tablet floor the card is the phone's width
 * and the whole name fits, so the cut form only shows from `md` (F38 review, minor 1).
 */
const HEADER_CHARS = 20;

/** The editor a record can open and the word on its button; `busy` while the server is still cutting. */
function editorFor(asset: AssetView): { editor: TileEditor; label: string; busy: boolean } {
  const busy = asset.status === "processing";
  if (asset.kind === "photo") return { editor: "focal", label: "Focal point", busy };
  return { editor: "trim", label: asset.trim === undefined ? "Trim" : "Re-trim", busy };
}

// The header's name: the clip length first for a clip, then the file name — whole on
// the phone, cut from the middle to what fits in the rail. A cut name keeps its full
// form for assistive tech, so what the tile said and what the card says are one and the
// same. The `id` names the card's row.
function CardName({ asset, id }: { asset: AssetView; id: string }) {
  const duration = durationLabel(asset);
  const prefix = duration === null ? "" : `${duration} · `;
  const short = shortFileName(asset.fileName, HEADER_CHARS - prefix.length);
  if (short === asset.fileName) {
    return (
      <MonoLabel as="p" id={id} variant="reading" className="min-w-0 flex-1 truncate text-meta">
        {prefix}
        {asset.fileName}
      </MonoLabel>
    );
  }
  return (
    <MonoLabel as="p" id={id} variant="reading" className="min-w-0 flex-1 truncate text-meta">
      <span aria-hidden="true" className="max-md:hidden">
        {prefix}
        {short}
      </span>
      <span className="md:sr-only">
        {prefix}
        {asset.fileName}
      </span>
    </MonoLabel>
  );
}

// What an enhanced copy says about itself (FR-052, FR-054): the badge, and its original
// by description — just the badge when the original has left the library.
function Provenance({ asset, assets }: { asset: AssetView; assets: readonly AssetView[] }) {
  const original = originalLine(asset, assets);
  return (
    <div className="flex flex-wrap items-center gap-8">
      <Badge status="enhanced" />
      {original === null ? null : (
        <MonoLabel as="p" variant="reading" className="min-w-0 text-meta">
          {original}
        </MonoLabel>
      )}
    </div>
  );
}

type ActionsProps = Pick<MediaCardProps, "asset" | "onRemove" | "onEdit"> & {
  actions: TextAction[];
  working: boolean;
};

// The row under the description: the editor for its kind (disabled, not gone, while the
// server is cutting a clip), the surface's own actions, then Remove — the same ghost
// button, in clay: destructive is never blue (DESIGN.md §4). The row is pulled the
// card's whole 12px padding outward, so the first button's box sits on the card's edge
// and its label starts 4px off the left line the header, the field and the note share
// — near enough to read as one line, with the focus ring still inside the card (F38
// review, minor 2; `-mx-16` would put the ring 4px outside it).
function CardActions({ asset, onRemove, onEdit, actions, working }: ActionsProps) {
  const edit = editorFor(asset);
  return (
    <div className="-mx-12 flex flex-wrap">
      {/* Stays mounted while the cut runs, so the closing editor has it to hand focus back to. */}
      <Button
        variant="ghost"
        dense
        aria-disabled={edit.busy}
        disabled={working}
        onClick={() => {
          if (!edit.busy) onEdit(edit.editor);
        }}
        className="aria-disabled:opacity-50"
      >
        {edit.label}
      </Button>
      {actions.map((action) => (
        <Button
          key={action.id}
          id={action.id}
          variant="ghost"
          dense
          disabled={working || action.disabled === true}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
      <Button variant="danger" dense aria-label={`Remove ${asset.fileName}`} onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}

/**
 * The card for the selected record: its name and the 44px `Close` in the header over a
 * hairline, where it sits on the page (`On the page · hero`, or `Not on the page yet` —
 * FR-013's answer, F39), provenance for an enhanced copy, the `Description` field with
 * its source note, then `Focal point` / `Trim` / `Re-trim`, the surface's actions and
 * `Remove {file}` as ghost buttons; `Close` last in the Tab order, drawn in the top-right
 * corner. A `group` named by its header, so the row reads as the record's (F38 review,
 * minor 8). Scrolls itself just into view when it opens (`block: "nearest"`), so a
 * last-row tile and its card are both on screen.
 */
export function MediaCard(props: MediaCardProps) {
  const { asset, assets, onPage, onClose, onRemove, onDescribe, onEdit, actions = [] } = props;
  const ref = useRef<HTMLDivElement>(null);
  const nameId = `${mediaCardId(asset.id)}-name`;
  // F9: the library's own edit actions — focal point / trim, the description, enhance —
  // lock while the helper works; browsing (opening or closing a tile) and Remove are not touched.
  const working = useWorkingLock();

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [asset.id]);

  return (
    <div
      ref={ref}
      id={mediaCardId(asset.id)}
      role="group"
      aria-labelledby={nameId}
      className="enter-panel relative flex flex-col gap-12 rounded-panel bg-paper p-12"
    >
      {/* The header keeps the corner clear for Close, which sits there but comes last in
          the document: Tab runs Description → the actions → Close → the next tile. */}
      <div className="-mt-8 flex min-h-44 items-center border-b border-line-panel pr-44">
        <CardName asset={asset} id={nameId} />
      </div>
      <MonoLabel as="p" variant="reading" className="text-meta">
        {onPage}
      </MonoLabel>
      {asset.enhancement === undefined ? null : <Provenance asset={asset} assets={assets} />}
      <AltTextField
        id={`alt-${asset.id}`}
        kind={asset.kind}
        text={asset.alt?.text ?? ""}
        source={asset.alt?.source ?? null}
        failed={asset.descriptionStatus === "failed"}
        disabled={working}
        onSave={onDescribe}
      />
      <CardActions
        asset={asset}
        onRemove={onRemove}
        onEdit={onEdit}
        actions={actions}
        working={working}
      />
      <IconButton
        icon={Close}
        aria-label="Close"
        onClick={onClose}
        className="absolute top-4 right-4 text-meta"
      />
    </div>
  );
}
