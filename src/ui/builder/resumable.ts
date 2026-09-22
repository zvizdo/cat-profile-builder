// The rules of resuming a Google Cloud Storage resumable upload (spec 2026-09-22, §2), kept
// pure so the upload client's loop reads as steps. A dropped `PUT` is followed by a status
// check — an empty `PUT` with `Content-Range: bytes */{size}` — whose answer says what to do
// next: `308` with `Range: bytes=0-N` means resume from `N + 1`, a `308` without `Range`
// means nothing arrived, a `2xx` means the object is already complete.

/** The wait before each retry: three retries, about 20 s for a phone to find a network. */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 4000, 15000];

/**
 * How long a request may go without progress before it is abandoned and treated as no
 * answer. A stalled mobile connection can hang for minutes without the browser reporting
 * an error; this turns that into a retry instead of a wait.
 */
export const STALL_MS = 30_000;

/** True for a 2xx answer. */
export function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * True for a failure worth retrying: no answer at all (`0`), a timeout (`408`), a rate
 * limit (`429`) or a 5xx — GCS's own retry guidance. Never any other 4xx.
 */
export function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || (status >= 500 && status < 600);
}

/** What a status check's answer means for the next step. */
export type ResumePoint = { done: true } | { offset: number } | { retry: true } | { fail: true };

/** GCS's `Range` on a 308: always from byte 0, up to the last byte it holds. */
const HELD = /^bytes=0-(\d+)$/;

/**
 * Reads a status check's answer for a file of `size` bytes: resume from an offset, done,
 * check again, or fail. A 308 claiming every byte is odd but not fatal — the object is not
 * complete yet — so it earns another check rather than a resend of nothing.
 */
export function parseResumeOffset(status: number, range: string | null, size: number): ResumePoint {
  if (isSuccess(status)) return { done: true };
  if (status === 308) {
    if (range === null) return { offset: 0 };
    const match = HELD.exec(range.trim());
    if (match === null) return { fail: true };
    const offset = Number(match[1]) + 1;
    return offset >= size ? { retry: true } : { offset };
  }
  return isRetryable(status) ? { retry: true } : { fail: true };
}

/** The `Content-Range` of a status check over a file of `size` bytes. */
export function statusCheckRange(size: number): string {
  return `bytes */${size}`;
}

/** The `Content-Range` of a resumed `PUT` carrying bytes `offset` to the end. */
export function resumeRange(offset: number, size: number): string {
  return `bytes ${offset}-${size - 1}/${size}`;
}

/** Resolves after `ms` milliseconds; the upload client's default pause between retries. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
