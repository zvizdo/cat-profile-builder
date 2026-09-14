import { formatClock } from "@/core/format/clock";

// The trim editor's live label (CONTENT.md → Modals `0:28 – 0:40 · muted · loops`; the
// block label `trim 0:04 – 0:12 of 2:07`): one function, so the editor and the block
// write a range the same way. The clock format itself is core's; a stretch under ten
// seconds adds tenths, so a half-second stretch reads as `0:00.0 – 0:00.5` and not `0:00 –
// 0:00`.

/** Stretches shorter than this are written in tenths of a second. */
const TENTHS_UNDER_SECONDS = 10;

/** `m:ss.t` — the clock to the nearest tenth, so `4.26` is `0:04.3` and `2.3` never `0:02.2`. */
function formatTenths(seconds: number): string {
  const tenths = Math.round(seconds * 10);
  return `${formatClock(Math.floor(tenths / 10))}.${tenths % 10}`;
}

/**
 * `0:04 – 0:12 of 2:07 · muted · loops` for a range into an original of `total` seconds;
 * both ends in tenths (`0:00.0 – 0:00.5`) when the stretch is under ten seconds.
 */
export function trimLabel(start: number, end: number, total: number): string {
  const clock = end - start < TENTHS_UNDER_SECONDS ? formatTenths : formatClock;
  return `${clock(start)} – ${clock(end)} of ${formatClock(total)} · muted · loops`;
}
