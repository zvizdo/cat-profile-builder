import { MonoLabel } from "./MonoLabel";

// Status words (DESIGN.md §4): LIVE is the one filled blue thing, DRAFT is an outline,
// UNFINISHED is a clay outline. ARCHIVED and ENHANCED are not in DESIGN.md; they take the
// DRAFT outline so nothing else on a screen competes with blue — ENHANCED in `ink` because
// it is a fact about a photo, not a lifecycle state.

/** A profile's lifecycle, or the one media fact a badge reports. */
export type BadgeStatus = "live" | "draft" | "archived" | "unfinished" | "enhanced";

const OUTLINE = "border border-line-tag";

const STYLE: Record<BadgeStatus, { label: string; classes: string }> = {
  live: { label: "LIVE", classes: "bg-blue text-card" },
  draft: { label: "DRAFT", classes: `${OUTLINE} text-meta` },
  archived: { label: "ARCHIVED", classes: `${OUTLINE} text-meta` },
  unfinished: { label: "UNFINISHED", classes: "border border-clay text-clay" },
  enhanced: { label: "ENHANCED", classes: `${OUTLINE} text-ink` },
};

/**
 * The status word for `status`, in the mono label voice with the DESIGN.md colour rule
 * applied: only `live` is blue, only `unfinished` is clay, everything else is an outline.
 */
export function Badge({ status }: { status: BadgeStatus }) {
  const { label, classes } = STYLE[status];
  return (
    <MonoLabel className={`inline-flex items-center rounded-control px-8 py-4 ${classes}`}>
      {label}
    </MonoLabel>
  );
}
