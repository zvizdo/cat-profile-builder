"use client";
import { useMemo, useRef, useState } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { archive, publish, restore, unpublish } from "@/app/actions/publishing";
import type { ProfileDocument, Theme } from "@/core/profile/schema";
import { HelperPanel } from "@/ui/helper/HelperPanel";
import { useHelper, type Helper } from "@/ui/helper/use-helper";
import { WorkingBar } from "@/ui/helper/WorkingBar";
import { Toast, ToastRegion } from "@/ui/shared/Toast";
import { Canvas } from "./Canvas";
import { CatSexProvider } from "./cat-sex";
import { RevealProvider, type FollowMarks } from "./follow";
import { LibraryToasts } from "./LibraryToasts";
import { OfflineNotice } from "./OfflineNotice";
import { OpenEditorProvider } from "./open-editor";
import { PhoneBuilder } from "./phone/PhoneBuilder";
import { PublishButton } from "./PublishButton";
import { PublishQuestions, PublishToastView } from "./PublishNotices";
import { Rail, type RailProps } from "./Rail";
import { ReadinessList } from "./ReadinessList";
import { RestorePrompt } from "./RestorePrompt";
import { Topbar } from "./Topbar";
import { useDocument, type DocumentSession } from "./use-document";
import { useFollowHelper } from "./use-follow";
import { useMediaLibrary, type MediaLibraryState } from "./use-media-library";
import { usePublishing, type Publication, type Publishing } from "./use-publishing";
import { useSurface, type Surface } from "./use-surface";
import { useUndoKeys } from "./use-undo-keys";
import {
  HELPER_PANEL_ID,
  useLockFocus,
  WAIT_FOR_HELPER,
  WorkingLockProvider,
} from "./working-lock";

// The builder for one cat (hi-fi 3a; FR-021–FR-025): the topbar, then rail · canvas ·
// helper from 1180px, rail · canvas from 768px, and the phone builder under that (FR-091;
// `phone/PhoneBuilder.tsx`, F44). State is `useDocument` over the library's live list
// (`useMediaLibrary`, owned here so the rail, the slots and the ownership checks all see
// the same records); every edit either tree asks for goes through it, so the two are one
// session at two widths.

export interface BuilderProps {
  document: ProfileDocument;
  assets: AssetView[];
  /** Where the cat stands as the page opens, and its public address if it has one. */
  publication: Publication;
  /** The ISO instant the page rendered at, for the save line's first paint. */
  now: string;
}

/** The four publishing Server Actions, as the shell wires them. */
const PUBLISHING_ACTIONS = { publish, unpublish, archive, restore };

// The publishing state over the session and the library's live records.
function useBuilderPublishing(
  session: DocumentSession,
  assets: readonly AssetView[],
  initial: Publication,
): Publishing {
  return usePublishing({ session, assets, initial, actions: PUBLISHING_ACTIONS });
}

interface NoticesProps {
  session: DocumentSession;
  library: MediaLibraryState;
  publishing: Publishing;
  /** F44: on the phone the stack sits above the bottom bar. */
  surface: Surface;
}

// The one toast stack (TOKENS.json `toast.concurrent: 1`; F38): the library's progress
// and notice first, then a refused edit as the one error toast (the document is already
// untouched), the offline sentence while a save cannot reach the server, and
// publishing's one toast.
function Notices({ session, library, publishing, surface }: NoticesProps) {
  const { state, clearNotice, offline } = session;
  return (
    <ToastRegion aboveBar={surface === "phone"}>
      <LibraryToasts library={library} />
      <OfflineNotice offline={offline} />
      {state.notice === null ? null : (
        <Toast variant="error" onDismiss={clearNotice}>
          {state.notice}
        </Toast>
      )}
      <PublishToastView doc={state.doc} publishing={publishing} />
    </ToastRegion>
  );
}

interface RailColumnProps extends Pick<RailProps, "library" | "onPreviewTheme"> {
  session: DocumentSession;
}

// The rail from the tablet floor up: every tile and theme change is one `apply`. The hero
// is never one of its tiles — every page already has one, mandatory and fixed at the top.
function RailColumn({ session, library, onPreviewTheme }: RailColumnProps) {
  const { state, apply } = session;
  return (
    <div className="hidden md:flex">
      <Rail
        profileId={state.doc.id}
        library={library}
        doc={state.doc}
        onAdd={(block) => apply({ op: "add_block", block })}
        theme={state.doc.theme}
        onTheme={apply}
        onPreviewTheme={onPreviewTheme}
      />
    </div>
  );
}

interface TreeProps {
  session: DocumentSession;
  library: MediaLibraryState;
  publishing: Publishing;
  now: string;
  /** F11: one `useHelper`/`useChat` instance for the whole page, built once above the
   * surface split and handed down — so a resize across 768px re-renders the panel with
   * the exact same conversation and the same pending tool call, rather than remounting a
   * second `useChat` that never saw it. */
  helper: Helper;
  /** F34: the canvas's follow of the helper — one hook, above the split like `helper`,
   * so a resize mid-turn never loses which blocks were followed. */
  follow: FollowMarks;
}

// The full builder: the topbar and the columns. The canvas's own add tile opens a section
// picker (F2); the rail's tiles stay as a second way in. The helper column stays locked
// until the library holds a photo (FR-032, read from `session.state.helper`, the composed
// reducer's own gate — T036), and Publish refuses while it is working (FR-081). A refused
// publish lists its problems at the top of the canvas. F9: the rail and the canvas share
// one `WorkingLockProvider` and one focus-catchment ref (`lockedRegion`) — the helper
// column sits outside both, since a pending card is never locked.
function FullBuilder({ session, library, publishing, now, helper, follow }: TreeProps) {
  const { state, apply, duplicate, undo, redo } = session;
  const working = state.helper.status === "working";
  useUndoKeys(undo, redo, working);
  // The theme a held slider shows the canvas before it is recorded (T026).
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);
  const lockedRegion = useRef<HTMLDivElement>(null);
  useLockFocus(working, lockedRegion);

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <Topbar
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
          />
        }
      />
      {/* Hidden under the tablet floor, so a phone hydrates only the bar. */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <WorkingLockProvider working={working}>
          {/* F41: the canvas's block editors read the cat's own recorded sex for the
              copy that carries a pronoun (the bio's kicker, a needs card's placeholder,
              the quote's placeholder) — one provider here rather than a `catSex` prop
              threaded through `Canvas`/`CanvasStack`/`BlockFrame` the way `catName`
              already is. */}
          <CatSexProvider sex={state.doc.sex}>
            {/* `contents`: gives the rail + canvas one ref for F9's focus check only —
                never changes how the flex row lays the three columns out. */}
            <div ref={lockedRegion} className="contents">
              <RailColumn session={session} library={library} onPreviewTheme={setPreviewTheme} />
              {/* F9: while every control inside is disabled, the scroll region has no
                focusable descendant of its own to reach it by — `tabIndex={0}` while
                locked keeps it in the tab order so a keyboard user can still scroll it
                (the sanctioned technique for exactly this, WCAG SCR29; axe's own
                `scrollable-region-focusable` rule fails without it). jsx-a11y's blanket
                rule against tabindex on a non-interactive element doesn't know the
                region behind it just went inert. */}
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
              <main className="min-w-0 flex-1 overflow-y-auto" tabIndex={working ? 0 : undefined}>
                <ReadinessList {...publishing} />
                {/* F39: the hero's `focal point` opens the library's sheet from the canvas. */}
                <OpenEditorProvider open={library.openEditor}>
                  <Canvas
                    doc={state.doc}
                    theme={previewTheme ?? state.doc.theme}
                    assets={library.assets}
                    onApply={apply}
                    onDuplicate={duplicate}
                    onOpenTrim={(mediaId) => library.openEditor("trim", mediaId)}
                    onEnhance={library.enhance}
                    onAskHelper={helper.send}
                    follow={follow}
                  />
                </OpenEditorProvider>
              </main>
            </div>
          </CatSexProvider>
        </WorkingLockProvider>
        <HelperPanel
          id={HELPER_PANEL_ID}
          session={session}
          helper={helper}
          assets={library.assets}
        />
      </div>
    </div>
  );
}

/**
 * The client root: owns the library, the session, the publishing state, and the one
 * helper conversation, and renders the full builder or the phone builder by the window's
 * width (`useSurface`) — one session, one `useHelper`, two trees, so a phone's edits are
 * the same recorded operations and a resize never starts a second conversation. Under
 * either it shows a refused edit as one error toast that leaves the document as it was
 * (Principle VIII), and offers a mirror newer than the server's document back before
 * anything else.
 *
 * F11 (T038 review, finding 3): `useHelper` used to live inside `HelperPanel`, mounted
 * separately by `FullBuilder` and the old `PhoneMode` — two different trees a resize swaps
 * between, so crossing 768px tore down whichever `useChat` instance held the live
 * conversation and mounted a fresh one that had never seen the assistant's tool call. A
 * card or turn in flight survived the switch only in the shared document session
 * (`session.state.helper`); the new `useChat` instance's own message list did not, so
 * answering it (`resolveCard` below) threw reaching into a tool call the new instance
 * never received. Building `helper` once here, above the split, and handing the same
 * `Helper` down to whichever surface renders `HelperPanel` keeps it to the one instance a
 * resize can never remount.
 */
export function Builder({ document: initial, assets, publication, now }: BuilderProps) {
  const library = useMediaLibrary(initial.id, assets);
  const session = useDocument(initial, library.assets);
  const publishing = useBuilderPublishing(session, library.assets, publication);
  const helper = useHelper({ session, assets: library.assets });
  const surface = useSurface();
  const { state } = session;
  // F34: the canvas follows the helper's edits; `reveal` reaches the panel's change list
  // through the provider around both trees, since the panel is inside either.
  const { reveal, ...follow } = useFollowHelper(state);
  const onPage = useMemo(() => new Set(state.doc.blocks.map((b) => b.id)), [state.doc.blocks]);
  const tree = { session, library, publishing, now, helper, follow };

  return (
    <RevealProvider reveal={reveal} onPage={onPage}>
      {surface === "phone" ? <PhoneBuilder {...tree} /> : <FullBuilder {...tree} />}
      <Notices session={session} library={library} publishing={publishing} surface={surface} />
      <PublishQuestions doc={state.doc} publishing={publishing} />
      <RestorePrompt
        open={state.offer !== null}
        onRestore={session.restore}
        onDiscard={session.discard}
      />
    </RevealProvider>
  );
}
