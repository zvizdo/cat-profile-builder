import { failureSentence, turnClauses, type Turn } from "@/core/helper/reducer";

// The two sentences a just-ended turn is summed up in (CONTENT.md → Helper, Applied /
// Failure), as plain strings: `TurnSummary.tsx` draws them in the panel, and the phone's
// peek bar (F45, `phone/peek-line.ts`) reads the same words on its one line — one source,
// so the bar can never say something the panel would not.

/** CONTENT.md's Applied line — `Applied — {what changed}.` — from the reducer's clauses. */
export function appliedLine(turn: Turn): string {
  return `Applied — ${turnClauses(turn)}.`;
}

/**
 * The failure line: when nothing landed before an error, what went wrong — the reducer's
 * own message, one of `use-helper.ts`'s three sentences ("I couldn't reach the model.",
 * CONTENT.md's; "The connection dropped."; "The helper stopped mid-step.", F42) —
 * followed by "Nothing on your page changed."; otherwise the reducer's own "cut off"
 * wording, which already names how far the turn got.
 */
export function failureLine(turn: Turn): string {
  const howFar = failureSentence(turn);
  if (turn.outcome?.kind !== "error" || turn.applied.length > 0) return howFar;
  return `${turn.outcome.message} ${howFar}`;
}
