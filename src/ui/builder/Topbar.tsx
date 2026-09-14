"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { relativeTimeSeconds } from "@/core/format/relative-time";
import { buttonClasses } from "@/ui/shared/Button";
import { IconButton } from "@/ui/shared/IconButton";
import { Open, Redo, Undo } from "@/ui/shared/icons";
import { Logo, LOGO_HEIGHT } from "@/ui/shared/Logo";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { displayName } from "./display-name";
import type { SaveState } from "./use-document";

// The builder's one bar (hi-fi 3a; CONTENT.md → Chrome): the mark, `All cats /`, the cat's
// name, the save line with its blue dot, undo and redo, Preview and Publish. Publish is handed
// in by the shell (`PublishButton`), since what it shows depends on where the cat stands.
// F44 (design 2026-09-13 §1): the phone variant keeps the same order in 390px — the mark
// is the way back, the name truncates, the save line keeps its dot but not its words,
// Preview is an icon that opens the preview page, and Publish is the same control.

export interface TopbarProps {
  profileId: string;
  name: string;
  save: SaveState;
  /** The ISO instant the page rendered at, so the first paint agrees on both sides. */
  now: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** F9: a real `disabled` on Undo/Redo while the helper works, on top of `aria-disabled`
   * for "nothing to do" — the two are independent reasons a press would do nothing. */
  working?: boolean;
  /** The Publish control, or the state menu once the cat is live or archived. */
  publish: ReactNode;
  /** T036: `WorkingBar`, shown beside the save line while the helper streams. */
  helper?: ReactNode;
  /** F44: the phone's arrangement — one row at 390px, Preview as an icon. */
  phone?: boolean;
  /** Phone only: hide the save dot as well, once the `Published` trigger carries its own. */
  quietSave?: boolean;
}

/** The save line's words, in CONTENT.md's voice; the error keeps the server's sentence. */
export function saveLine(save: SaveState, now: Date): string {
  switch (save.status) {
    case "saved": {
      const age = relativeTimeSeconds(save.savedAt, now);
      return age === "just now" ? "Draft saved just now" : `Draft saved ${age} ago`;
    }
    case "saving":
    case "dirty":
      return "Saving draft";
    case "error":
      return save.message;
  }
}

// The clock the save line reads: the server's instant first, then the browser's, once a
// second — so `2s ago` becomes `3s ago` without an edit.
function useClock(initial: string): Date {
  const [now, setNow] = useState(() => new Date(initial));
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);
  return now;
}

/** The save line's words, kept to the second — the phone's state menu draws them as its note (F44). */
export function useSaveLine(save: SaveState, now: string): string {
  return saveLine(save, useClock(now));
}

export interface SaveLineProps {
  save: SaveState;
  now: string;
  /** The dot alone on the phone's slim bar; the sentence stays for a screen reader. */
  compact?: boolean;
  /**
   * Hide the blue dot as well (the phone bar beside a `Published` trigger, which carries
   * its own); a failed save still shows its clay dot, and the sentence stays announced.
   */
  quiet?: boolean;
}

/** The save state: the 6px blue (or clay) dot and its sentence, as one live region. */
export function SaveLine({ save, now, compact = false, quiet = false }: SaveLineProps) {
  const clock = useClock(now);
  const failed = save.status === "error";
  const dot = failed || !quiet;
  return (
    <span
      role="status"
      className={`flex items-center gap-8 font-label text-mono-label tracking-normal ${failed ? "text-clay" : "text-meta"}`}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={`size-6 shrink-0 rounded-pill ${failed ? "bg-clay" : "bg-blue"}`}
        />
      ) : null}
      <span className={compact ? "sr-only" : undefined}>{saveLine(save, clock)}</span>
    </span>
  );
}

// Undo and Redo are bordered mini-buttons in the comp (3a), the field hairline; the one
// with nothing to do fades rather than taking a lighter line, which has no token.
const UNDO_CLASSES = "border border-line-field aria-disabled:opacity-50";

const BACK_LINK =
  "flex min-h-44 items-center rounded-control transition-colors duration-hover ease-default hover:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";

type HistoryProps = Pick<TopbarProps, "canUndo" | "canRedo" | "onUndo" | "onRedo"> & {
  working: boolean;
};

// Undo and Redo: real buttons that also answer ⌘Z / ⌘⇧Z from the shell — `aria-disabled`
// when there is nothing to do, so focus never falls off them; F9's real `disabled` on top.
function History({ canUndo, canRedo, onUndo, onRedo, working }: HistoryProps) {
  return (
    <div className="flex gap-6">
      <IconButton
        icon={Undo}
        aria-label="Undo"
        aria-disabled={!canUndo}
        disabled={working}
        className={UNDO_CLASSES}
        onClick={canUndo && !working ? onUndo : undefined}
      />
      <IconButton
        icon={Redo}
        aria-label="Redo"
        aria-disabled={!canRedo}
        disabled={working}
        className={UNDO_CLASSES}
        onClick={canRedo && !working ? onRedo : undefined}
      />
    </div>
  );
}

/**
 * The phone's bar (F44; design §1 lists no mark and no breadcrumb): the name first, the
 * save dot with its sentence for the screen reader alone, then `↶` `↷`, Preview as the
 * `Open` icon (a link to the preview route, the page itself), and Publish — the state
 * trigger compact. The way back to the list is the `All cats /` row at the top of the
 * column (`PhoneColumn`). `WorkingBar` stays in the row, visually hidden, since it is
 * the one announcer.
 */
function PhoneTopbar(props: TopbarProps) {
  const { profileId, name, save, now, publish, helper, quietSave = false } = props;
  const { working = false } = props;
  return (
    <header className="flex min-h-topbar shrink-0 items-center gap-4 border-b border-line-chrome bg-card px-16">
      {/* The name takes whatever the fixed controls leave (review, finding 1): four
          44px controls, a Publish word, 4px gaps — a twelve-letter name shows whole at
          390px in either state; longer ones truncate. */}
      <h1 className="min-w-0 flex-1 truncate pr-4 font-text text-ui text-ink">
        {displayName(name)}
      </h1>
      {/* The working announcer stays the one `role="status"` for a turn (F25), heard,
          not seen: at 390px the sentence would push the name out, and the eye has the
          breathing disc on the CATalyst tab and the drawer's own header line instead. */}
      <span className="sr-only">{helper}</span>
      <SaveLine save={save} now={now} compact quiet={quietSave} />
      <History {...props} working={working} />
      <Link
        href={`/builder/${profileId}/preview`}
        aria-label="Preview"
        className="inline-flex size-44 shrink-0 items-center justify-center rounded-control border border-line-field text-ink transition-colors duration-hover ease-default hover:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      >
        <Open />
      </Link>
      {publish}
    </header>
  );
}

/**
 * The bar: 58px, card ground, chrome hairline beneath. The mark is decorative here — the
 * cat's name beside it says where the volunteer is. `All cats /` is the way back to
 * the list, in the mono reading voice (sentence case, no tracking); the name is the
 * page's `h1`; the save line is a live region; Undo and Redo
 * are real buttons that also answer ⌘Z / ⌘⇧Z from the shell — `aria-disabled` when there
 * is nothing to do, so focus never falls off them. Publish is whatever the shell hands in.
 */
export function Topbar(props: TopbarProps) {
  const { profileId, name, save, now, publish, helper, phone = false } = props;
  const { working = false } = props;
  if (phone) return <PhoneTopbar {...props} />;
  return (
    <header className="flex min-h-topbar shrink-0 items-center gap-16 border-b border-line-chrome bg-card px-16 md:px-20">
      <Logo height={LOGO_HEIGHT.chrome} alt="" />
      <Link href="/builder" className={BACK_LINK}>
        <MonoLabel variant="reading" className="text-meta">
          All cats /
        </MonoLabel>
      </Link>
      <h1 className="min-w-0 truncate font-text text-ui text-ink">{displayName(name)}</h1>
      <div className="flex-1" />
      <div className="hidden md:contents">
        {helper}
        <SaveLine save={save} now={now} />
        <History {...props} working={working} />
        <Link
          href={`/builder/${profileId}/preview`}
          className={buttonClasses("secondary", undefined, "dense")}
        >
          Preview
        </Link>
        {publish}
      </div>
    </header>
  );
}
