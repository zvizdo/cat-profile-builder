import { z } from "zod";
import { ProfileDocumentSchema, type ProfileDocument } from "@/core/profile/schema";

// The offline mirror (FR-024; ADR-004): a copy of the working document in the browser's
// own storage, under `draft:{id}`, with the server version (`updatedAt`) it is based on.
// The builder writes it while the document is unsaved and clears it when a save lands.
// On open, a mirror based on exactly the version the server holds, and saying something
// different, is offered back; one based on an older version — the server moved on, from
// another device — is dropped. No clock is consulted anywhere: identity, not time,
// decides. Everything here is pure over an injected storage, and a storage that throws
// (a private window, a full quota, cookies blocked) makes every call a no-op: the
// builder works without it.

/** The three calls the mirror makes; `localStorage` satisfies it. */
export interface MirrorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const MirrorSchema = z.object({ doc: ProfileDocumentSchema, basedOn: z.iso.datetime() });

/** What the mirror holds: the unsaved document and the server `updatedAt` it grew from. */
export type Mirror = z.infer<typeof MirrorSchema>;

/**
 * Whether a mirror is worth offering against the document the server holds: `applies`
 * (same version underneath, different content), `stale` (the server has moved on),
 * `identical` (nothing the server does not have), `none`.
 */
export type MirrorStanding = "applies" | "stale" | "identical" | "none";

/** The storage key for a cat's mirror. */
export function mirrorKey(id: string): string {
  return `draft:${id}`;
}

// Every call to the storage goes through here, so a throw is one branch, not five.
function attempt<T>(storage: MirrorStorage | null, call: (storage: MirrorStorage) => T): T | null {
  if (storage === null) return null;
  try {
    return call(storage);
  } catch {
    return null;
  }
}

/** Writes `doc` under its id as based on the server version `basedOn`; false when the storage refused. */
export function writeMirror(
  storage: MirrorStorage | null,
  doc: ProfileDocument,
  basedOn: string,
): boolean {
  const mirror: Mirror = { doc, basedOn };
  return (
    attempt(storage, (s) => {
      s.setItem(mirrorKey(doc.id), JSON.stringify(mirror));
      return true;
    }) === true
  );
}

/**
 * The mirror for `id`, or `null` when there is none, the storage refused, or what it holds
 * is not a valid mirror — a stored value is outside data (Principle IV) and a corrupt one
 * is treated as absent rather than restored.
 */
export function readMirror(storage: MirrorStorage | null, id: string): Mirror | null {
  const raw = attempt(storage, (s) => s.getItem(mirrorKey(id)));
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = MirrorSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/** Removes the mirror for `id`; false when the storage refused. */
export function clearMirror(storage: MirrorStorage | null, id: string): boolean {
  return (
    attempt(storage, (s) => {
      s.removeItem(mirrorKey(id));
      return true;
    }) === true
  );
}

/**
 * The mirror's standing against `server`, the document as loaded: it applies only when it
 * is based on exactly `server.updatedAt` and its content differs. Content is compared as
 * serialised JSON — the document is plain data with a fixed key order from the schema.
 */
export function mirrorApplies(mirror: Mirror | null, server: ProfileDocument): MirrorStanding {
  if (mirror === null) return "none";
  if (mirror.basedOn !== server.updatedAt) return "stale";
  return JSON.stringify(mirror.doc) === JSON.stringify(server) ? "identical" : "applies";
}

/**
 * The window's `localStorage`, or `null` where touching it throws — a document with
 * storage access denied — so the builder carries on without a mirror.
 */
export function browserStorage(): MirrorStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
