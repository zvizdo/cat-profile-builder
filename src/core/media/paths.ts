import { parseOrThrow } from "../errors";
import { MediaIdSchema, ProfileIdSchema } from "../profile/schema";
import { RevSchema } from "./schema";

// The only place object names are built (ADR-015 layout). Every id and rev is validated
// against its schema before it is joined, so a name can never contain `..`, a slash or
// anything else that would leave `profiles/{pid}/` — adapters concatenate nothing themselves.

/** `profiles/` — the one prefix every cat lives under; a listing over it sees them all. */
export const PROFILES_PREFIX = "profiles/";

/** `profiles/{pid}/` — the prefix that holds everything about one cat in both buckets. */
export function profilePrefix(pid: string): string {
  return `${PROFILES_PREFIX}${parseOrThrow(ProfileIdSchema, pid)}/`;
}

/** `profiles/{pid}/media/` — the prefix that holds every media folder of one cat, in both buckets. */
export function mediaPrefix(pid: string): string {
  return `${profilePrefix(pid)}media/`;
}

/** `profiles/{pid}/{state}.json` — the draft, published or archived document (private bucket). */
export function documentName(pid: string, state: "draft" | "published" | "archived"): string {
  return `${profilePrefix(pid)}${state}.json`;
}

/**
 * `profiles/{pid}/media/{mid}/asset.json` (the media record) or `.../original` (the bytes
 * as uploaded), both in the private bucket.
 */
export function objectName(pid: string, mid: string, kind: "asset" | "original"): string {
  const folder = `${mediaPrefix(pid)}${parseOrThrow(MediaIdSchema, mid)}/`;
  return kind === "asset" ? `${folder}asset.json` : `${folder}original`;
}

const DERIVED_EXTENSION = { clean: "jpg", web: "mp4", poster: "jpg" };

/**
 * `profiles/{pid}/media/{mid}/{kind}.{rev}.{ext}` in the public bucket: `clean.{rev}.jpg`,
 * `web.{rev}.mp4` or `poster.{rev}.jpg`. The rev is in the name, so a derived file is
 * immutable and a URL never changes meaning.
 */
export function derivedName(
  pid: string,
  mid: string,
  kind: "clean" | "web" | "poster",
  rev: string,
): string {
  const folder = `${mediaPrefix(pid)}${parseOrThrow(MediaIdSchema, mid)}/`;
  return `${folder}${kind}.${parseOrThrow(RevSchema, rev)}.${DERIVED_EXTENSION[kind]}`;
}

/** `base` and an object name joined with exactly one slash, whatever `base` ends with. */
export function publicUrl(base: string, name: string): string {
  return `${base.replace(/\/+$/, "")}/${name}`;
}
