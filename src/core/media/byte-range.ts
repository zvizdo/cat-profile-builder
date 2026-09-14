import type { ByteRange } from "../ports";

// Byte ranges over a file (F23): the HTTP `Range` grammar the `/media` route honours, and
// the clamping rule every MediaStore applies to a range it is asked to stream. All pure, so
// the three adapters and the route share one reading of "inclusive, end clamped to the last
// byte, a start past it cannot be served".

/** `bytes=start-end`, `bytes=start-` or `bytes=-suffix`: one range, whole numbers, one unit. */
const RANGE = /^\s*bytes\s*=\s*(?:(\d+)\s*-\s*(\d*)|-\s*(\d+))\s*$/;

/**
 * What a `Range` header asks for, before the file's size is known: a slice from `start`
 * (to `end`, or to the last byte when `end` is absent), or the last `suffix` bytes.
 */
export type RangeRequest = { start: number; end?: number } | { suffix: number };

/**
 * The slice of a `size`-byte file that `range` names, with an end past the last byte
 * clamped to it; no range is the whole file. `null` when the range starts past the last
 * byte (or the file is empty), which is the one case a store cannot stream at all.
 */
export function clampByteRange(range: ByteRange | undefined, size: number): ByteRange | null {
  const start = range?.start ?? 0;
  const end = Math.min(range?.end ?? size - 1, size - 1);
  return start >= size || end < start ? null : { start, end };
}

/**
 * The one range a `Range` header names (RFC 9110 §14.1.2), or `null` for anything outside
 * the grammar: another unit, more than one range, letters. A suffix of nothing (`bytes=-0`)
 * parses — it is {@link resolveRange} that finds it unsatisfiable.
 */
export function parseRangeHeader(header: string): RangeRequest | null {
  const match = RANGE.exec(header);
  if (match === null) return null;
  const [, first, last, suffix] = match;
  if (suffix !== undefined) return { suffix: Number(suffix) };
  return last === undefined || last === ""
    ? { start: Number(first) }
    : { start: Number(first), end: Number(last) };
}

/**
 * The inclusive slice of a `size`-byte file that `request` names: an end past the file, or
 * none, is clamped to the last byte; a suffix names the last `n` bytes, at most the whole
 * file. `null` when it cannot be satisfied: a start past the last byte, or an end before it.
 */
export function resolveRange(request: RangeRequest, size: number): ByteRange | null {
  if ("suffix" in request) {
    if (request.suffix === 0) return null;
    return clampByteRange({ start: Math.max(size - request.suffix, 0), end: size - 1 }, size);
  }
  return clampByteRange({ start: request.start, end: request.end ?? size - 1 }, size);
}

/**
 * The single byte range a `Range` header asks for within `size` bytes, or `null` when it
 * cannot be satisfied — {@link parseRangeHeader} then {@link resolveRange}.
 */
export function parseByteRange(header: string, size: number): ByteRange | null {
  const request = parseRangeHeader(header);
  return request === null ? null : resolveRange(request, size);
}
