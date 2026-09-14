// The `0:10` a video tile and a trim label show (CONTENT.md → block labels): seconds as
// `m:ss`. One function, so every surface writes a duration the same way.

/** `seconds` as `m:ss` — minutes unpadded, seconds two digits, the fraction dropped (10.5 s is `0:10`). */
export function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}
