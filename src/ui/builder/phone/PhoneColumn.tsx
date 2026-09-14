"use client";
import Link from "next/link";
import { useState } from "react";
import type { ReadinessProblem } from "@/core/profile/readiness";
import type { Theme } from "@/core/profile/schema";
import { BlockList, type BlockListProps } from "../BlockList";
import { LOCK_VEIL, SHEET_CLASSES } from "../Canvas";
import { FactsFields } from "../FactsFields";
import { ThemePicker, type ThemePickerProps } from "../ThemePicker";
import { Prev } from "@/ui/shared/icons";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { themeStyle } from "../theme-css";
import { useWorkingLock } from "../working-lock";
import { CollapsedGroup } from "./CollapsedGroup";
import { factsLine, themeLine } from "./collapsed-lines";

// The phone's canvas (design 2026-09-13 §2): one column, top to bottom — Facts folded to
// one line, Theme folded to one line, then the frames on the themed sheet exactly as the
// desktop canvas draws them (`BlockList`), and the add tile. The two groups stand on the
// chrome's own ground above the sheet, not inside it: the theme controls and the
// contrast note are the tool, and a theme that fails AA must not take the words that say
// so down with it. No bar, no `CANVAS · phone` label, nothing read-only. The way back
// to the list is the first row: `‹ All cats` (F55), the desktop bar's own breadcrumb in
// a back-link's shape, here at the top of the column since the phone's bar has no room
// for it beside the name.

export interface PhoneColumnProps extends BlockListProps {
  /** What the sheet paints in: the document's theme, or the one a held slider previews. */
  theme: Theme;
  onTheme: ThemePickerProps["onChange"];
  onPreviewTheme: ThemePickerProps["onPreview"];
  /** A refused publish's live problems: one about a fact opens the Facts group so the
   * readiness list's reveal has a field to land on. */
  problems: readonly ReadinessProblem[] | null;
}

/** Whether a problem points at one of the facts fields (the name, the age, the sex). */
function namesAFact(problems: PhoneColumnProps["problems"]): boolean {
  return (
    problems?.some(
      (problem) => problem.target.kind === "name" || problem.target.kind === "facts",
    ) ?? false
  );
}

// The way back to the list, on the card ground like the two groups under it (`meta`
// holds 4.5:1 on card, not on the canvas's deeper paper). F55 item 5: `‹ All cats` —
// the desktop's `All cats /` is a breadcrumb with the name after it; here the row
// held the slash alone, dangling (the sweep's finding 5), so the chevron says "back"
// and the words say where. The chevron is decorative: the link is named `All cats`.
function WayBack() {
  return (
    <div className="flex bg-card px-8">
      <Link
        href="/builder"
        className="flex min-h-44 items-center gap-4 rounded-control px-8 text-meta transition-colors duration-hover ease-default hover:text-blue focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue"
      >
        <Prev />
        <MonoLabel variant="reading">All cats</MonoLabel>
      </Link>
    </div>
  );
}

/**
 * Facts is open for a brand-new cat (no name yet) and folded once one exists; Theme
 * starts folded. Either opens on a press. While a refused publish names a fact, Facts
 * is held open — the readiness list reveals and focuses the gap in the same commit.
 */
export function PhoneColumn(props: PhoneColumnProps) {
  const { doc, theme, onApply, onTheme, onPreviewTheme, problems } = props;
  const [factsOpen, setFactsOpen] = useState(doc.name === "");
  const [themeOpen, setThemeOpen] = useState(false);
  const showFacts = factsOpen || namesAFact(problems);
  const working = useWorkingLock();
  return (
    <section
      aria-label="Canvas"
      aria-busy={working}
      className={`relative flex min-h-full flex-col gap-8 bg-paper-deep p-8 ${working ? "cursor-default" : ""}`}
    >
      <WayBack />
      <CollapsedGroup
        label="Facts"
        line={factsLine(doc)}
        open={showFacts}
        onToggle={() => setFactsOpen(!showFacts)}
      >
        <FactsFields facts={doc} onApply={onApply} />
      </CollapsedGroup>
      <CollapsedGroup
        label="Theme"
        line={themeLine(doc.theme)}
        open={themeOpen}
        onToggle={() => setThemeOpen((open) => !open)}
      >
        <ThemePicker
          theme={doc.theme}
          onChange={onTheme}
          onPreview={onPreviewTheme}
          heading={false}
        />
      </CollapsedGroup>
      <div style={themeStyle(theme)} className={SHEET_CLASSES}>
        <BlockList {...props} />
      </div>
      {working ? <div aria-hidden="true" className={LOCK_VEIL} /> : null}
    </section>
  );
}
