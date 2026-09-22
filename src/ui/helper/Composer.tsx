"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/ui/shared/Button";
import { Send } from "@/ui/shared/icons";
import { Textarea } from "@/ui/shared/Textarea";

// CONTENT.md → Helper, Input: `Ask for a change…` · `Send`. Enter sends, Shift+Enter starts
// a new line — the one keyboard rule the brief names — built on the shared `Textarea` so the
// composer reads as the same field family as every other box in the tools (DESIGN.md §4).
// F65: a Send button sits beside the box (not over it, so the box can grow to its ceiling
// without text running under it) and sends exactly what Enter would. It is `Button`'s own
// primary in its 44px `icon` size, so the one filled control in the panel matches Publish.
// One line to start (hi-fi 3a: a ~44px field) in the panel's own 13px, growing as a
// request is typed — the shared field's `dense` size, so the two-line void the old box
// kept under an empty placeholder is gone.

const PLACEHOLDER = "Ask for a change…";

export interface ComposerProps {
  /** While `true` (locked, or the helper is already working) the box takes no input. */
  disabled: boolean;
  onSend: (text: string) => void;
}

/** The composer: a controlled field, one line that grows, cleared once a request is sent. */
export function Composer({ disabled, onSend }: ComposerProps) {
  const [value, setValue] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  // Sending disables the box for the turn, and a disabled field drops focus to `<body>`
  // — the next Tab would land on the chips, a Shift+Tab short of asking again. When the
  // box comes back, it takes focus back, but only if nothing else has claimed it since
  // (a card's Apply, a toast's Undo): focus that a volunteer placed is theirs. Without
  // scrolling (F34 review, finding 1): the turn ends with the canvas following the
  // helper's last edit, and a focus that scrolled would pull the view back to this box
  // before the overview glide. On the desktop the box is always in view; on the phone
  // (F44) it sits in the CATalyst drawer, a fixed, self-scrolling sheet over the canvas
  // rather than the page itself — `preventScroll` keeps the canvas where the follow left it.
  useEffect(() => {
    if (disabled || document.activeElement !== document.body) return;
    field.current?.focus({ preventScroll: true });
  }, [disabled]);

  const send = () => {
    const text = value.trim();
    if (text === "") return;
    onSend(text);
    setValue("");
    // Space or Enter on the button leaves focus on it; the volunteer is mid-conversation,
    // so it goes back to the box (without scrolling — the same F34 rule as the effect above).
    // A pointer press never moved it (`onMouseDown` below), so this is a no-op for a click.
    field.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    send();
  };

  return (
    <div className="flex items-end gap-8">
      <div className="min-w-0 flex-1">
        <Textarea
          id="helper-composer"
          name="message"
          label="Ask for a change"
          hideLabel
          rows={1}
          dense
          ref={field}
          placeholder={PLACEHOLDER}
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <SendButton disabled={disabled || value.trim() === ""} onSend={send} />
    </div>
  );
}

/** F65: the Send button, `Button`'s own primary in its 44px `icon` size. */
function SendButton({ disabled, onSend }: { disabled: boolean; onSend: () => void }) {
  return (
    /*
      A pointer press keeps focus in the box: on a phone, moving it would close the
      keyboard and the refocus in `send` would reopen it as the drawer drops to Peek. On
      this wrapper, not the button: Send is disabled exactly while the box is empty, and
      React (matching the native rule) never calls a disabled control's own `onMouseDown`
      — an ancestor's still fires, so the guard holds in that state too. The wrapper
      carries no interaction of its own — it is not a control.
    */
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onMouseDown={(event) => event.preventDefault()}>
      <Button variant="primary" size="icon" aria-label="Send" disabled={disabled} onClick={onSend}>
        <Send />
      </Button>
    </div>
  );
}
