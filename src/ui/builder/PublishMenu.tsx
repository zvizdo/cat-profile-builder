"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ProfileState } from "@/core/ports";
import { Button } from "@/ui/shared/Button";

// The state of a published cat in the topbar (hi-fi 3a): `Published` with a 6px blue dot, or
// `Archived` with a quiet one, opening a small menu of the ways on. A real menu: arrow
// keys walk the items, Escape closes and hands focus back, a click elsewhere closes.

/** One way on. `href` items open the page in a new tab; the rest run their action. */
export interface MenuItem {
  label: string;
  href?: string;
  onSelect?: () => void;
}

export interface PublishMenuProps {
  state: Exclude<ProfileState, "draft">;
  items: MenuItem[];
  /** While a call is on its way the trigger is inert but keeps focus. */
  busy: boolean;
  /** F44: one plain line above the items — the phone's save state (`Draft saved 2s ago`),
   * which its bar has no room to draw beside the name. Never an item. */
  note?: string;
  /**
   * F44: the phone's trigger, which keeps the cat's name the bar's width. F55 item 7
   * amends F44's dot-only square: a first-timer cannot read a lone dot, so the dot
   * keeps one short word beside it — `● Live` / `● Archived` — which still fits 390px
   * with `Undo` `Redo` `Preview` and a `Charlotte`-length name whole.
   */
  compact?: boolean;
}

const LABEL: Record<PublishMenuProps["state"], string> = {
  live: "Published",
  archived: "Archived",
};

/** The phone's shorter word (F55): the list already says `Live`, so the bar does too. */
const COMPACT_LABEL: Record<PublishMenuProps["state"], string> = {
  live: "Live",
  archived: "Archived",
};

const ITEM_CLASSES =
  "flex min-h-44 w-full items-center rounded-control px-12 text-left text-ui text-ink transition-colors duration-hover ease-default hover:bg-paper focus-visible:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue";

const ITEM_SELECTOR = '[role="menuitem"]';

// The open menu closes on a click outside; the trigger does not take focus back then.
function useCloseOnOutside(open: boolean, close: () => void, root: HTMLElement | null) {
  useEffect(() => {
    if (!open || root === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close, root]);
}

interface ItemsProps extends Pick<PublishMenuProps, "note"> {
  id: string;
  label: string;
  items: MenuItem[];
  /** Closes the menu; `refocus` says whether the trigger takes focus back. */
  onClose: (refocus: boolean) => void;
}

// One item: a link to the page in a new tab, or a button that closes the menu and runs.
function Item({ item, onClose }: { item: MenuItem; onClose: ItemsProps["onClose"] }) {
  if (item.href === undefined) {
    return (
      <button
        type="button"
        role="menuitem"
        className={ITEM_CLASSES}
        onClick={() => {
          onClose(true);
          item.onSelect?.();
        }}
      >
        {item.label}
      </button>
    );
  }
  return (
    <a
      role="menuitem"
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className={ITEM_CLASSES}
      onClick={() => onClose(false)}
    >
      {item.label}
    </a>
  );
}

// The list itself: focus lands on the first item when it opens, ArrowDown and ArrowUp
// walk the items round, Home and End jump to the ends, Escape and Tab close and hand
// focus back to the trigger. The list is focusable itself only so the keys it handles
// have somewhere to land (a11y rule). The note, when there is one, sits in the popover
// above the `menu` — outside it, so the menu's children stay items alone.
function Items({ id, label, items, note, onClose }: ItemsProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    const index = entries.findIndex((entry) => entry === document.activeElement);
    const to: Record<string, number | undefined> = {
      ArrowDown: (index + 1) % entries.length,
      ArrowUp: (index - 1 + entries.length) % entries.length,
      Home: 0,
      End: entries.length - 1,
    };
    const next = to[event.key];
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      onClose(true);
    } else if (next !== undefined) {
      event.preventDefault();
      entries[next]?.focus();
    }
  };
  return (
    <div className="enter-panel absolute top-full right-0 z-10 mt-8 flex min-w-[200px] flex-col gap-4 rounded-panel border border-line-panel bg-card p-8 shadow-lifted">
      {note === undefined ? null : (
        <p className="border-b border-line-panel px-12 pt-4 pb-8 font-label text-mono-label tracking-normal text-meta">
          {note}
        </p>
      )}
      <div
        ref={ref}
        id={id}
        role="menu"
        tabIndex={-1}
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex flex-col gap-4"
      >
        {items.map((item) => (
          <Item key={item.label} item={item} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}

/** The menu trigger and, while open, the items; `View page` is a link, the rest buttons. */
export function PublishMenu({ state, items, busy, note, compact = false }: PublishMenuProps) {
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  useCloseOnOutside(open, () => setOpen(false), root);
  const label = compact ? COMPACT_LABEL[state] : LABEL[state];

  return (
    <div ref={setRoot} className="relative">
      <Button
        ref={triggerRef}
        variant="secondary"
        dense
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-disabled={busy}
        className={`gap-8 aria-disabled:opacity-50 ${compact ? "shrink-0" : ""}`}
        onClick={busy ? undefined : () => setOpen((was) => !was)}
      >
        <span
          aria-hidden="true"
          className={`size-6 rounded-pill ${state === "live" ? "bg-blue" : "bg-meta"}`}
        />
        {label}
      </Button>
      {open ? <Items id={menuId} label={label} items={items} note={note} onClose={close} /> : null}
    </div>
  );
}
