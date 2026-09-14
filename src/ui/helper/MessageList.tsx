"use client";
import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { Markdown } from "./Markdown";

// The conversation (hi-fi 3a): the volunteer's own requests, as literal text, and the
// helper's replies, rendered as the safe Markdown subset `systemPrompt` allows (F31,
// ADR-017) — as bubbles, never the tool activity itself, which the turn's card and
// `TurnSummary` show instead (an `add_block` has no words of its own to bubble). Marked
// `aria-live="polite"` so a reply is announced to a screen reader without moving focus
// off the composer — FR-068's keyboard/assistive-technology requirement, not a quoted
// contract line.
//
// F27: once the thread outgrows the list it scrolls, and a scroll region with no focusable
// child inside it is unreachable from a keyboard (axe `scrollable-region-focusable`; the
// same rule `Builder.tsx` answers for the locked canvas, WCAG SCR29). So the list is a
// named `log` in the tab order — `Conversation`, the one word for what it holds — with
// the panel's focus ring; `log` already means "polite live region", and the explicit
// `aria-live` keeps the announcement where it was.

/** The list's accessible name (no CONTENT.md string names the thread; this is the plain word). */
const CONVERSATION = "Conversation";

export interface MessageListProps {
  messages: UIMessage[];
  /** The surface's own bound on the list — the phone caps its height (F27). */
  className?: string;
}

interface Bubble {
  id: string;
  role: "user" | "assistant";
  text: string;
}

/** Every text part of `message`, joined — a message built only of tool parts has none. */
function textOf(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<UIMessage["parts"][number], { type: "text" }> => {
      return part.type === "text";
    })
    .map((part) => part.text)
    .join("");
}

function bubblesOf(messages: UIMessage[]): Bubble[] {
  return messages
    .filter((message): message is UIMessage & { role: "user" | "assistant" } => {
      return message.role === "user" || message.role === "assistant";
    })
    .map((message) => ({ id: message.id, role: message.role, text: textOf(message) }))
    .filter((bubble) => bubble.text.trim() !== "");
}

// The volunteer's bubble is the only right-aligned thing in the panel: paper, the speech
// shape (`bubble-volunteer`, globals.css), its text always literal — a volunteer's own
// words are never markup (constitution, Principle VI). The helper's reply is bare text — no
// bubble, no avatar, no name; the panel itself is the helper speaking.
/** The helper's reply voice — the one text style the panel speaks in (F55: the empty
 * thread's greeting uses it too, so the two can never drift apart). */
export const ASSISTANT_TEXT = "text-ui-dense font-normal leading-[1.55] text-body";

const BUBBLE = {
  user: "self-end max-w-[82%] whitespace-pre-wrap bubble-volunteer bg-paper px-12 py-8 text-ui-dense font-normal text-body",
  assistant: `max-w-[90%] whitespace-pre-wrap ${ASSISTANT_TEXT}`,
} as const;

/** The scrolling conversation, oldest first; empty until the first request is sent. */
export function MessageList({ messages, className = "" }: MessageListProps) {
  const bubbles = bubblesOf(messages);
  const list = useRef<HTMLDivElement>(null);

  // The newest message is the one being read: keep the list scrolled to it as it streams
  // in. A plain scroll assignment — `scroll-behavior: auto` under reduced motion is the
  // global rule's, and there is no smooth scroll to fall back from.
  useEffect(() => {
    const element = list.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={list}
      role="log"
      aria-label={CONVERSATION}
      aria-live="polite"
      // The tab stop is the sanctioned technique for a scroll region (SCR29; see the
      // header comment) — jsx-a11y's blanket rule doesn't know the region scrolls.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      // F49 (F28 review #8): `shrink`, never `flex-1` — the list only takes its content's
      // own height and never grows to fill the panel. `flex-1` here left a void at the
      // list's own bottom on a short thread, pushing the card (or receipt, or failure box)
      // that follows it ~330px down to the composer instead of right under the last
      // message. `min-h-0` still lets it compress below content height on a long thread,
      // so it — not the card slot or the composer stack, both `shrink-0` — is what scrolls.
      className={`flex min-h-0 shrink flex-col gap-12 overflow-y-auto rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${className}`}
    >
      {bubbles.map((bubble) =>
        bubble.role === "user" ? (
          <p key={bubble.id} className={BUBBLE.user}>
            {bubble.text}
          </p>
        ) : (
          <div key={bubble.id} className={BUBBLE.assistant}>
            <Markdown text={bubble.text} />
          </div>
        ),
      )}
    </div>
  );
}
