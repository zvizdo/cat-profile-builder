"use client";
import { useMemo, useRef, useState } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { mediaChange, removalPreview } from "@/core/profile/media-change";
import type { Theme } from "@/core/profile/schema";
import { drawsBlock, textChange } from "@/core/profile/text-change";
import type { Helper } from "@/ui/helper/use-helper";
import { WorkingBar } from "@/ui/helper/WorkingBar";
import { CatSexProvider } from "../cat-sex";
import { displayName } from "../display-name";
import type { FollowMarks } from "../follow";
import { MediaEditors } from "../MediaEditors";
import { OpenEditorProvider } from "../open-editor";
import { PublishButton } from "../PublishButton";
import { ReadinessList } from "../ReadinessList";
import { Topbar, useSaveLine } from "../Topbar";
import type { DocumentSession, DocumentState } from "../use-document";
import type { MediaLibraryState } from "../use-media-library";
import type { Publishing } from "../use-publishing";
import { useUndoKeys } from "../use-undo-keys";
import { useLockFocus, WAIT_FOR_HELPER, WorkingLockProvider } from "../working-lock";
import { BottomBar } from "./BottomBar";
import { PhoneColumn } from "./PhoneColumn";
import { FullDrawers, LowDrawer } from "./PhoneDrawers";
import { useCatalystDrawer } from "./use-catalyst-drawer";
import { SHEET_IDS, TAB_IDS, useDrawerSignal, useSheet } from "./use-sheet";

// The phone builder (design 2026-09-13; FR-091 as rewritten): everything the full
// builder offers, in one column between two bars. The topbar (the name, undo/redo,
// Preview as a page, Publish), the canvas scrolling between the bars, the bottom bar's
// two tabs, and the Media and CATalyst drawers. The same session, the same helper, the
// same library as `FullBuilder` — `Builder.tsx` builds them once above the surface
// split and hands them down, so a resize across 768px keeps every edit, every
// conversation and every upload in flight.
//
// The column, top to bottom: the topbar, the canvas (`main`, flex-1), then — when the
// CATalyst drawer is at Half or Peek — the plain sheet or the peek bar in the flow, then
// the bottom bar. The two Full sheets are modal and fixed, so they sit last
// (`PhoneDrawers.tsx`). Half and Peek in the flow is what keeps the canvas whole above
// them: its box *is* the visible band, so F34's centring lands in it with nothing to pad.

export interface PhoneBuilderProps {
  session: DocumentSession;
  library: MediaLibraryState;
  publishing: Publishing;
  /** The ISO instant the page rendered at, for the save line's first paint. */
  now: string;
  /** F11: the one helper conversation `Builder.tsx` builds above the surface split. */
  helper: Helper;
  /** F34: the canvas's follow of the helper, built above the split like `helper`. */
  follow: FollowMarks;
}

type BarProps = Pick<PhoneBuilderProps, "session" | "publishing" | "now"> & { working: boolean };

// The phone's topbar (design §1): the save line's words go into the state menu as its
// note (`useSaveLine`), and the dot beside the name goes quiet once `Published` carries
// its own. `WorkingBar` stays: the one `role="status"` announcer for a turn.
function PhoneTop({ session, publishing, now, working }: BarProps) {
  const { state, undo, redo } = session;
  const note = useSaveLine(state.save, now);
  return (
    <Topbar
      phone
      quietSave={publishing.publication.state !== "draft"}
      profileId={state.doc.id}
      name={state.doc.name}
      save={state.save}
      now={now}
      canUndo={session.canUndo}
      canRedo={session.canRedo}
      onUndo={undo}
      onRedo={redo}
      working={working}
      helper={<WorkingBar working={working} />}
      publish={
        <PublishButton
          publishing={publishing}
          blocked={working}
          onBlocked={() => session.notice(WAIT_FOR_HELPER)}
          note={note}
          compact
        />
      }
    />
  );
}

type MainProps = Pick<PhoneBuilderProps, "session" | "library" | "publishing" | "follow"> & {
  working: boolean;
  /** A bio's `rewrite`/`shorten`: sends, and the CATalyst drawer peeks. */
  onAskHelper: (text: string) => void;
  /** Whether the focal and trim editors mount here — while the Media drawer is down. */
  editors: boolean;
};

// The canvas: the one `main`, scrolling between the two bars, so F34's centring lands
// in the visible band without any scroll padding. F9: `tabIndex={0}` while locked keeps
// the scroll region reachable by keyboard (WCAG SCR29) once every control inside is
// disabled — see `Builder.tsx`. The focal and trim editors are mounted here while the
// Media sheet is down, so the hero's `focal point` and a clip's `re-trim` open them
// from the canvas; while it is up they mount inside it (`PhoneMediaDrawer`), over it.
// F56: both copies read `useCatSex()` (`FocalPicker.tsx`'s `bodyFor`) — the provider
// sits once, around the whole tree in `PhoneBuilder` below, rather than around this
// `main` alone, so the drawer's own copy (outside this component, in `FullDrawers`) is
// never left reading "they" for a cat with a recorded sex.
function PhoneMain(props: MainProps) {
  const { session, library, publishing, follow, working, onAskHelper, editors } = props;
  const { state, apply, duplicate } = session;
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);
  const lockedRegion = useRef<HTMLElement>(null);
  useLockFocus(working, lockedRegion);
  return (
    <WorkingLockProvider working={working}>
      <main
        ref={lockedRegion}
        className="min-w-0 flex-1 overflow-y-auto"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={working ? 0 : undefined}
      >
        <ReadinessList {...publishing} />
        <OpenEditorProvider open={library.openEditor}>
          <PhoneColumn
            doc={state.doc}
            theme={previewTheme ?? state.doc.theme}
            assets={library.assets}
            onApply={apply}
            onDuplicate={duplicate}
            onOpenTrim={(mediaId) => library.openEditor("trim", mediaId)}
            onEnhance={library.enhance}
            onAskHelper={onAskHelper}
            onTheme={apply}
            onPreviewTheme={setPreviewTheme}
            problems={publishing.problems}
            follow={follow}
          />
        </OpenEditorProvider>
      </main>
      {editors ? (
        <MediaEditors
          profileId={state.doc.id}
          catName={displayName(state.doc.name)}
          library={library}
        />
      ) : null}
    </WorkingLockProvider>
  );
}

/** Whether the waiting card draws a change block, which would put Apply under the Half
 * sheet's fold: a text field's block (F58, `textChange`/`drawsBlock`), a photo swap or a
 * gallery's dropped faces (F59, `mediaChange` — always at least one 56px face), or a
 * removal with a face to draw beside its struck line (F59, `removalPreview().face`) —
 * the same readers the card itself draws from, computed once per card (the document
 * cannot change while one waits). A removal with no face is still just the one struck
 * line, no taller than the ledger's own one-line pair, and stays Half like that case
 * (F58). At 390×664, measured: a photo pair with two full alt-text lines each puts
 * Apply the same distance under Half's fold a long bio diff does. */
function useOpensFull(state: DocumentState, assets: readonly AssetView[]): boolean {
  const card = state.helper.turn.card;
  const doc = state.doc;
  return useMemo(() => {
    if (card === null) return false;
    const removal = removalPreview(doc, assets, card.op);
    return (
      drawsBlock(textChange(doc, card.op)) ||
      mediaChange(doc, assets, card.op) !== null ||
      (removal !== null && removal.face !== null)
    );
  }, [card, doc, assets]);
}

/**
 * The phone tree: the topbar, the canvas, the CATalyst drawer's low heights, the bottom
 * bar and the two Full drawers. A bio's `rewrite`/`shorten` sends straight from the
 * canvas: the drawer peeks, and the canvas follows the reply.
 *
 * F56: `CatSexProvider` wraps the whole tree, not just `PhoneMain`'s `main` — `main` and
 * `FullDrawers` (the Media sheet, over `Sheet`, `Portal`-rendered by neither, but both
 * still descendants of this tree) both mount their own copy of `MediaEditors`, and both
 * need the same recorded sex for the focal sheet's body (`her` / `his` / `their`,
 * `FocalPicker.tsx`'s `bodyFor`) as every other pronoun in the builder already reads
 * from this provider (`BioEditor`, `NeedsEditor`, `QuoteEditor`).
 */
export function PhoneBuilder(props: PhoneBuilderProps) {
  const { session, library, publishing, now, helper, follow } = props;
  const { state, undo, redo } = session;
  const working = state.helper.status === "working";
  useUndoKeys(undo, redo, working);
  const sheet = useSheet();
  const drawer = useCatalystDrawer(
    helper,
    state.helper,
    sheet,
    useOpensFull(state, library.assets),
  );
  // A turn the peek shows is a turn seen: the disc lights only for one that ended with
  // nothing of the drawer on screen (review round 1, finding 5).
  const signal = useDrawerSignal(state.helper, drawer.height !== "closed");

  return (
    <CatSexProvider sex={state.doc.sex}>
      <div className="flex h-dvh flex-col bg-paper">
        <PhoneTop session={session} publishing={publishing} now={now} working={working} />
        <PhoneMain
          session={session}
          library={library}
          publishing={publishing}
          follow={follow}
          working={working}
          onAskHelper={drawer.helper.send}
          editors={sheet.open !== "media"}
        />
        <LowDrawer session={session} drawer={drawer} library={library} />
        {/* Under a Full sheet the bar is covered, not unmounted: the sheet is modal, so
            it is inert to the keyboard and a screen reader, and it is still the element
            focus goes back to when the sheet closes. The CATalyst tab reads expanded at
            Full and Half — the two heights the panel is open at. */}
        <BottomBar
          open={sheet.open ?? (drawer.height === "half" ? "catalyst" : null)}
          onOpen={sheet.show}
          signal={signal}
          sheetIds={SHEET_IDS}
          tabIds={TAB_IDS}
        />
        <FullDrawers session={session} library={library} sheet={sheet} drawer={drawer} />
      </div>
    </CatSexProvider>
  );
}
