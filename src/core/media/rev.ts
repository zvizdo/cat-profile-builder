import { createHash } from "node:crypto";

/**
 * The revision a derived file is named by (ADR-015): the first 10 hex characters of the
 * SHA-256 of its bytes. The same bytes always give the same rev, so re-writing an identical
 * file lands on the same immutable name, and a changed file never overwrites an old one.
 * Lives apart from the schema because it needs `node:crypto`, which a browser bundle of the
 * schema must not pull in.
 */
export function revOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 10);
}
