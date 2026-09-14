"use client";
import { HelperPanel } from "@/ui/helper/HelperPanel";
import { countLabel } from "../MediaLibrary";
import type { DocumentSession } from "../use-document";
import type { MediaLibraryState } from "../use-media-library";
import { HELPER_PANEL_ID, WorkingLockProvider } from "../working-lock";
import { PeekBar } from "./PeekBar";
import { PhoneMediaDrawer } from "./PhoneMediaDrawer";
import { Sheet } from "./Sheet";
import type { CatalystDrawer } from "./use-catalyst-drawer";
import { SHEET_IDS, type SheetController } from "./use-sheet";

// The phone's drawers (design 2026-09-13 §3–§5), split from `PhoneBuilder.tsx`: the two
// Full sheets (modal, fixed — last in the tree) and the CATalyst drawer's two low
// heights (in the column's flow, above the bottom bar).

/** The CATalyst sheet's name (CONTENT.md → Helper, Header); the Full panel draws it. */
const HELPER_TITLE = "CATalyst AI Assistant";

export interface DrawerProps {
  session: DocumentSession;
  library: MediaLibraryState;
  sheet: SheetController;
  drawer: CatalystDrawer;
}

// The two Full drawers. Media sits inside the working lock like the rail does (every
// tile and the upload refuse while the helper works); CATalyst sits outside it, since a
// pending card is never locked. Both keep their state across a close: the library and
// the conversation live above, in `library` and `helper`.
export function FullDrawers({ session, library, sheet, drawer }: DrawerProps) {
  const { state } = session;
  return (
    <>
      <WorkingLockProvider working={state.helper.status === "working"}>
        <Sheet
          id={SHEET_IDS.media}
          mode="modal"
          open={sheet.open === "media"}
          title={countLabel(library.assets.length)}
          returnFocus={sheet.returnFocus}
          onClose={sheet.close}
        >
          <PhoneMediaDrawer session={session} library={library} editors />
        </Sheet>
      </WorkingLockProvider>
      <Sheet
        id={SHEET_IDS.catalyst}
        mode="modal"
        open={drawer.height === "full"}
        title={HELPER_TITLE}
        titleVisible={false}
        padded={false}
        returnFocus={sheet.returnFocus}
        onClose={drawer.toPeek}
      >
        <HelperPanel
          id={HELPER_PANEL_ID}
          session={session}
          helper={drawer.helper}
          layout="sheet"
          assets={library.assets}
        />
      </Sheet>
    </>
  );
}

export type LowDrawerProps = Pick<DrawerProps, "session" | "drawer" | "library">;

// The CATalyst drawer's two low heights, in the column's flow above the bottom bar: the
// Half sheet (a plain region — the sheet's own title row names it and carries Close, so
// the panel starts at the conversation) or the peek bar; nothing before the first request.
export function LowDrawer({ session, drawer, library }: LowDrawerProps) {
  if (drawer.height === "half") {
    return (
      <Sheet
        id={SHEET_IDS.catalyst}
        mode="plain"
        open
        title={HELPER_TITLE}
        padded={false}
        onClose={drawer.toPeek}
      >
        <HelperPanel
          id={HELPER_PANEL_ID}
          session={session}
          helper={drawer.helper}
          layout="sheet"
          header={false}
          assets={library.assets}
        />
      </Sheet>
    );
  }
  if (drawer.height === "peek") {
    return (
      <PeekBar
        line={drawer.line}
        working={session.state.helper.status === "working"}
        onOpen={drawer.toFull}
        onHide={drawer.hide}
      />
    );
  }
  return null;
}
