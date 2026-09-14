import { useEffect, useRef } from "react";

// Focus re-placed by element id after a move (FR-022, acceptance 1.3): React moves a
// reordered node to its new place in the DOM, and a moved node loses focus in the
// browser, so the canvas and the gallery ask for it back once the render has landed.
// F44: the moved block is then brought into view (`nearest`, so an in-view block does
// not jump; instant, so reduced motion needs no case) — a Move down leaves the pressed
// button where it was in the DOM while its sibling moves, so a plain `focus()` on the
// still-focused button scrolls nothing and a phone-tall section slides under the bar.

/** Returns `refocus(id)`: the element with `id` gets focus after the next render. */
export function useRefocus(): (id: string) => void {
  const wanted = useRef<string | null>(null);
  useEffect(() => {
    const id = wanted.current;
    if (id === null) return;
    wanted.current = null;
    const element = document.getElementById(id);
    element?.focus();
    element?.scrollIntoView?.({ block: "nearest" });
  });
  return (id) => {
    wanted.current = id;
  };
}
