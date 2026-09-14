"use client";
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import {
  clearTrim,
  deleteMedia,
  enhancePhoto,
  setAltText,
  setFocalPoint,
  trimVideo,
} from "@/app/actions/media";
import type { ActionResult } from "@/app/actions/_lib/guard";
import type { EditedAsset } from "@/app/actions/_lib/media";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { UNSUPPORTED_MESSAGE } from "@/core/media/validation";
import { enhancedCopyOf } from "./enhance-state";
import type { Focal } from "./focal-math";
import { useUploadQueue, type UploadRefusal } from "./use-upload-queue";

// The library's state and every change to it, kept out of the markup: the records, the
// one toast, the unsupported-file question, which tile is selected and which editor. Uploads
// run through `useUploadQueue`; every sentence shown comes from core, the server, or
// CONTENT.md. A Server Action call that cannot be made at all (the server is down: the
// call rejects) is a toast with `Try again` that runs the same call — never silence.

/** The editor open over a tile (T023): the focal point sheet or the trim modal. */
export interface OpenEditor {
  kind: "focal" | "trim";
  mediaId: string;
}

/** The one toast that stays until dismissed: a warning to accept, or an error, with a retry when one makes sense. */
export type Notice =
  { kind: "warning"; text: string } | { kind: "error"; text: string; retry: (() => void) | null };

/** Failures worth a `Try again`: the bytes or the call did not get through. */
const RETRYABLE = new Set(["network", "internal", "upstream"]);

/** The sentences for a save, a delete or an enhance whose call never reached the server (CONTENT.md voice). */
const COULD_NOT = {
  save: "We couldn't save that.",
  remove: "We couldn't remove that.",
  enhance: "We couldn't enhance that.",
} as const;

/** Oldest first, so a new upload appended at the end sits where a reload will show it. */
function byCreation(list: AssetView[]): AssetView[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * What an upload refusal becomes: the sniff's refusal is the unsupported-file question;
 * anything else is its sentence as an error, with `Try again` when the bytes can simply
 * be resent.
 */
function noticeFor(refusal: UploadRefusal, resend: () => void): Notice | "unsupported" {
  if (refusal.code === "unsupported" && refusal.message === UNSUPPORTED_MESSAGE) {
    return "unsupported";
  }
  const retry = RETRYABLE.has(refusal.code) ? resend : null;
  return { kind: "error", text: refusal.message, retry };
}

interface Edits {
  profileId: string;
  assets: AssetView[];
  setAssets: Dispatch<SetStateAction<AssetView[]>>;
  setNotice: (notice: Notice | null) => void;
}

/** A refusal in the server's words, no retry. */
function refused(edits: Edits, message: string): false {
  edits.setNotice({ kind: "error", text: message, retry: null });
  return false;
}

/** A call that never got an answer: the sentence for `what`, and `Try again` runs `again`. */
function unreached(edits: Edits, what: keyof typeof COULD_NOT, again: () => void): false {
  edits.setNotice({ kind: "error", text: COULD_NOT[what], retry: again });
  return false;
}

/** `list` with the record `asset.id` replaced by `asset`. */
function replaced(list: AssetView[], asset: AssetView): AssetView[] {
  return list.map((a) => (a.id === asset.id ? asset : a));
}

/**
 * One edit of one record: `call` answers the new record, which replaces the old one; a
 * refusal is shown in the server's words; a call that never got an answer offers to run
 * `call` again. `settle` runs after either outcome (the trim editor uses it to lift the
 * tile's `processing` stripes when the call failed).
 */
async function editWith(
  edits: Edits,
  call: () => Promise<ActionResult<EditedAsset>>,
  settle: () => void = () => {},
): Promise<boolean> {
  try {
    const result = await call();
    if (!result.ok) {
      settle();
      return refused(edits, result.error.message);
    }
    edits.setAssets((list) => replaced(list, result.asset));
    edits.setNotice(null);
    return true;
  } catch {
    settle();
    return unreached(edits, "save", () => void editWith(edits, call, settle));
  }
}

/** The volunteer's own words for a record (FR-011, FR-073); true once they are stored. */
function describeWith(edits: Edits, mediaId: string, text: string): Promise<boolean> {
  const { profileId } = edits;
  return editWith(edits, () => setAltText({ profileId, mediaId, text }));
}

/** Where every crop of a photo centres (data-model.md → `focal`); true once stored. */
function focalWith(edits: Edits, mediaId: string, focal: Focal): Promise<boolean> {
  const { profileId } = edits;
  return editWith(edits, () => setFocalPoint({ profileId, mediaId, focal }));
}

/**
 * Cuts the clip to `start`–`end` (FR-078). The tile is striped `processing` while the
 * server transcodes, and shows the previous record again if the cut did not land.
 */
function trimWith(edits: Edits, mediaId: string, start: number, end: number): Promise<boolean> {
  const { profileId, setAssets } = edits;
  const before = edits.assets.find((a) => a.id === mediaId);
  if (before !== undefined)
    setAssets((list) => replaced(list, { ...before, status: "processing" }));
  const restore = () => {
    if (before !== undefined) setAssets((list) => replaced(list, before));
  };
  return editWith(edits, () => trimVideo({ profileId, mediaId, start, end }), restore);
}

/** Removes the trim; a long original goes back to needing one (FR-078). */
function untrimWith(edits: Edits, mediaId: string): Promise<boolean> {
  const { profileId } = edits;
  return editWith(edits, () => clearTrim({ profileId, mediaId }));
}

/** Where an enhanced record goes once it has landed: the caller's compare view. */
type Landed = (asset: AssetView) => void;

/**
 * Runs the `auto-v1` recipe on a photo (T045; ADR-016): the new record joins the library
 * and goes to `onEnhanced` — the caller's compare view; a refusal is shown in the
 * server's words; a call that never got an answer offers to run it again, and a retry
 * that lands still reaches `onEnhanced`. A copy the library already holds is handed
 * over without a call: the recipe is deterministic (FR-051), so the server would only
 * answer the same bytes under a new id.
 */
async function enhanceWith(edits: Edits, mediaId: string, onEnhanced: Landed): Promise<boolean> {
  const { profileId, setAssets } = edits;
  const existing = enhancedCopyOf(mediaId, edits.assets);
  if (existing !== undefined) {
    onEnhanced(existing);
    return true;
  }
  try {
    const result = await enhancePhoto({ profileId, mediaId });
    if (!result.ok) return refused(edits, result.error.message);
    setAssets((list) => [...list, result.asset]);
    edits.setNotice(null);
    onEnhanced(result.asset);
    return true;
  } catch {
    return unreached(edits, "enhance", () => void enhanceWith(edits, mediaId, onEnhanced));
  }
}

/** Removes a record after the modal has asked; a refusal names the cat (FR-076). */
async function removeWith(edits: Edits, mediaId: string, onRemoved: () => void): Promise<boolean> {
  const { profileId, setAssets } = edits;
  try {
    const result = await deleteMedia({ profileId, mediaId });
    if (!result.ok) return refused(edits, result.error.message);
    setAssets((list) => list.filter((a) => a.id !== mediaId));
    edits.setNotice(null);
    onRemoved();
    return true;
  } catch {
    return unreached(edits, "remove", () => void removeWith(edits, mediaId, onRemoved));
  }
}

/**
 * The upload queue over the library's state: a landed record joins the list, its last
 * warning becomes the notice, and `onLanded` sees it; a refusal is the unsupported-file
 * question or the notice, with `Try again` resending the same file.
 */
function useLibraryQueue(
  profileId: string,
  edits: Pick<Edits, "setAssets" | "setNotice">,
  onLanded: (asset: AssetView) => void,
  onUnsupported: () => void,
) {
  const queue = useUploadQueue(profileId, {
    onLanded: (asset, warnings) => {
      edits.setAssets((list) => [...list, asset]);
      const warning = warnings.at(-1);
      if (warning !== undefined) edits.setNotice({ kind: "warning", text: warning });
      onLanded(asset);
    },
    onRefused: (file, refusal) => {
      const notice = noticeFor(refusal, () => addFiles([file]));
      if (notice === "unsupported") onUnsupported();
      else edits.setNotice(notice);
    },
  });
  const addFiles = (files: File[]) => {
    edits.setNotice(null);
    queue.addFiles(files);
  };
  return { pending: queue.pending, progress: queue.progress, addFiles };
}

/** Everything `useMediaLibrary` answers: the state and the changes. */
export type MediaLibraryState = ReturnType<typeof useMediaLibrary>;

export function useMediaLibrary(profileId: string, initial: AssetView[]) {
  const [assets, setAssets] = useState(() => byCreation(initial));
  const [notice, setNotice] = useState<Notice | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editor, setEditor] = useState<OpenEditor | null>(null);
  const edits: Edits = { profileId, assets, setAssets, setNotice };
  // A failed description opens the record's tile, so the volunteer lands where the work is (FR-073).
  const queue = useLibraryQueue(
    profileId,
    edits,
    (asset) => {
      if (asset.descriptionStatus === "failed") setExpanded(asset.id);
    },
    () => setUnsupported(true),
  );

  return {
    assets,
    pending: queue.pending,
    progress: queue.progress,
    notice,
    clearNotice: () => setNotice(null),
    unsupported,
    closeUnsupported: () => setUnsupported(false),
    expanded,
    toggle: (mediaId: string) => setExpanded((open) => (open === mediaId ? null : mediaId)),
    /** Clears the selection (F38: Escape, Close, a pointer-down outside the rail); stable. */
    close: useCallback(() => setExpanded(null), []),
    addFiles: queue.addFiles,
    editor,
    openEditor: (kind: OpenEditor["kind"], mediaId: string) => setEditor({ kind, mediaId }),
    closeEditor: () => setEditor(null),
    describe: (mediaId: string, text: string) => describeWith(edits, mediaId, text),
    focal: (mediaId: string, focal: Focal) => focalWith(edits, mediaId, focal),
    trim: (mediaId: string, start: number, end: number) => trimWith(edits, mediaId, start, end),
    untrim: (mediaId: string) => untrimWith(edits, mediaId),
    enhance: (mediaId: string, landed: Landed) => enhanceWith(edits, mediaId, landed),
    remove: (mediaId: string, onRemoved: () => void) =>
      removeWith(edits, mediaId, () => {
        setExpanded((open) => (open === mediaId ? null : open));
        onRemoved();
      }),
  };
}
