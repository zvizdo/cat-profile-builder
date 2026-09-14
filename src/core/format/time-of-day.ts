// The `14:02` in the kiosk's `Last updated 14:02` line (CONTENT.md → Event carousel →
// Offline): local wall-clock time, twenty-four hours, so a volunteer glancing at the TV
// reads the same clock the room runs on.

/** `date` as local `HH:MM` — hours and minutes each two digits, seconds dropped. */
export function formatTimeOfDay(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
