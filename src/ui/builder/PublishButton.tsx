"use client";
import { Button } from "@/ui/shared/Button";
import { PublishMenu, type MenuItem } from "./PublishMenu";
import type { Publishing } from "./use-publishing";

// The topbar's Publish (hi-fi 3a; FR-056): the one primary button while the cat is a
// draft; once live, `Published` with the ways on — the page, a republish, unpublish,
// archive; once archived, `Archived` with restore and unpublish. Publishing is always
// the volunteer's own press: nothing here runs on its own (constitution VIII).

export interface PublishButtonProps {
  publishing: Publishing;
  /**
   * T036 (FR-081): while true, every action here is refused — `onBlocked` runs instead —
   * because the helper is mid-turn and the document must not move under it. The button
   * itself stays as clickable as ever (DESIGN.md's own note: "Publish stays clickable and
   * explains … it never silently disables itself").
   */
  blocked?: boolean;
  onBlocked?: () => void;
  /** F44: the phone's save line, drawn as the first plain line of the state menu. */
  note?: string;
  /** F44: the phone's row — the state trigger is a 44px dot button; Publish keeps its word. */
  compact?: boolean;
}

/** `fn` unless `blocked`, in which case `onBlocked` runs and `fn` never does. */
function gate(blocked: boolean, onBlocked: (() => void) | undefined, fn: () => void): () => void {
  return () => (blocked ? onBlocked?.() : fn());
}

/** The menu's items for a live or archived cat. */
function itemsFor(
  publishing: Publishing,
  blocked: boolean,
  onBlocked: (() => void) | undefined,
): MenuItem[] {
  const { publication } = publishing;
  const go = (fn: () => void) => gate(blocked, onBlocked, fn);
  if (publication.state === "archived") {
    return [
      { label: "Restore", onSelect: go(publishing.restore) },
      { label: "Unpublish", onSelect: go(() => publishing.ask("unpublish")) },
    ];
  }
  return [
    ...(publication.url === null ? [] : [{ label: "View page", href: publication.url }]),
    { label: "Republish", onSelect: go(publishing.publish) },
    { label: "Unpublish", onSelect: go(() => publishing.ask("unpublish")) },
    { label: "Archive", onSelect: go(() => publishing.ask("archive")) },
  ];
}

/** Publish for a draft; the state menu otherwise. Inert, not disabled, while a call runs. */
export function PublishButton(props: PublishButtonProps) {
  const { publishing, blocked = false, onBlocked, note, compact = false } = props;
  const { publication, busy } = publishing;
  if (publication.state === "draft") {
    return (
      <Button
        dense
        aria-disabled={busy}
        className="aria-disabled:opacity-50"
        onClick={busy ? undefined : gate(blocked, onBlocked, publishing.publish)}
      >
        Publish
      </Button>
    );
  }
  return (
    <PublishMenu
      state={publication.state}
      items={itemsFor(publishing, blocked, onBlocked)}
      busy={busy}
      note={note}
      compact={compact}
    />
  );
}
