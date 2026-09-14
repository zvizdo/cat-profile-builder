import type { UIMessage } from "ai";
import { currentRejection, type HelperState } from "@/core/helper/reducer";
import { appliedLine, failureLine } from "@/ui/helper/turn-lines";

// The CATalyst peek bar's one line (design 2026-09-13 §4; CONTENT.md → Phone peek line):
// nothing new is ever written for it. While a turn streams it is the working sentence;
// while a card waits, the card's own sentence; once the turn has ended, the receipt
// (`Applied — …`), the failure sentence, the refusal, or the helper's last words — the
// proposal's `Want me to build this now?` among them. Pure over the helper's state and
// the conversation, so the bar and its tests read one function.

/** The working sentence (CONTENT.md → Builder, Chrome; `WorkingBar.tsx` announces it). */
export const WORKING_LINE = "CATalyst is working…";

/** The slice of the helper's state the line reads. */
export type HelperTurn = Pick<HelperState, "status" | "turn">;

type TextPart = Extract<UIMessage["parts"][number], { type: "text" }>;

/** The text of the conversation's last assistant message, or `""` when there is none. */
function lastWords(messages: readonly UIMessage[]): string {
  const last = messages.findLast((message) => message.role === "assistant");
  if (last === undefined) return "";
  return last.parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

/** The one line the peek bar shows for `helper` and the conversation as they stand. */
export function peekLine(helper: HelperTurn, messages: readonly UIMessage[]): string {
  const { status, turn } = helper;
  if (turn.card !== null) return turn.card.summary;
  if (status === "working") return WORKING_LINE;
  if (turn.outcome !== null && turn.outcome.kind !== "done") return failureLine(turn);
  if (turn.applied.length > 0) return appliedLine(turn);
  return currentRejection(turn) ?? lastWords(messages);
}

/** Whether the line asks something — what raises the drawer to Half at a turn's end. */
export function isQuestion(line: string): boolean {
  return line.trimEnd().endsWith("?");
}
