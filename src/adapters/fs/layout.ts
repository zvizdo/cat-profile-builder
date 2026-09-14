import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { AppError, UpstreamError } from "@/core/errors";

// What both filesystem stores share (ADR-015 → Local development): the layout under
// DATA_DIR, the guard that keeps every path inside it, atomic writes, and the one way an
// I/O failure is reported. `private/` and `public/` mirror the two buckets; an object name
// from `src/core/media/paths.ts` is the path under either, byte for byte.

/** The sentence a person sees when the local store cannot be read or written. */
export const STORE_FAILED = "The storage service didn't respond.";

const PRIVATE_DIR = "private";
const PUBLIC_DIR = "public";
/** Sits beside a document and holds its custom metadata as JSON. */
const META_SUFFIX = ".meta.json";

/**
 * `name` joined under `root`, checked to still resolve inside it. Object names come from the
 * validated builders and cannot contain `..`, so this throwing would be a bug elsewhere —
 * the check is the guarantee, not a branch the app relies on.
 */
export function underRoot(root: string, name: string): string {
  const base = resolve(root);
  const full = resolve(base, name);
  if (!full.startsWith(base + sep)) {
    throw new Error(`Path "${name}" resolves outside the data folder.`);
  }
  return full;
}

/** The file that holds the private-bucket object `name`. */
export function privatePath(root: string, name: string): string {
  return underRoot(root, join(PRIVATE_DIR, name));
}

/** The file that holds the public-bucket object `name`. */
export function publicPath(root: string, name: string): string {
  return underRoot(root, join(PUBLIC_DIR, name));
}

/** The sidecar that holds the custom metadata of the document at `file`. */
export function metaPath(file: string): string {
  return `${file}${META_SUFFIX}`;
}

/** Whether an `fs` error is a "no such file" — the case the port maps to `null`. */
export function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/** Whether an `fs` error is "already exists" — the case an exclusive create refuses. */
export function isExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

/**
 * The app's error for a failed operation: an `AppError` raised before any I/O (a bad id from
 * a path builder) passes through unchanged; anything else is the one storage failure, with
 * the Node error kept as `cause` for the log.
 */
function asAppError(error: unknown): AppError {
  return error instanceof AppError ? error : new UpstreamError(STORE_FAILED, { cause: error });
}

/** Runs `operation` and rethrows any failure through {@link asAppError}. */
export async function io<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw asAppError(error);
  }
}

/** Like {@link io}, but a missing file is `null` rather than a failure. */
export async function ioOrNull<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (isMissing(error)) return null;
    throw asAppError(error);
  }
}

/**
 * Writes `bytes` to `file` atomically: the bytes go to a temporary sibling first and are
 * renamed into place, so a reader never sees a half-written file and a crash leaves the
 * previous version intact. Creates the folder when it is not there yet.
 */
export async function writeAtomic(file: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Writes a JSON document atomically, as the UTF-8 bytes of `JSON.stringify`. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await writeAtomic(file, encoder.encode(JSON.stringify(value)));
}

/** Reads a JSON file back as the `unknown` a store hands its caller. */
export async function readJson(file: string): Promise<unknown> {
  return JSON.parse(decoder.decode(await readFile(file)));
}
