"use client";
import { useEffect, useId, useRef, type RefObject } from "react";
import { readinessSummary, type ReadinessProblem } from "@/core/profile/readiness";
import { IconButton } from "@/ui/shared/IconButton";
import { Close } from "@/ui/shared/icons";
import { revealTarget } from "./readiness-scroll";
import type { Publishing } from "./use-publishing";

// What a refused publish shows (CONTENT.md → Publish validation: `Two things missing: …`,
// "lists what's missing, then scrolls to the first gap"): the consequence-notice panel —
// a clay edge on paper, never a red box — at the top of the sheet, every problem a button
// that takes the volunteer to the place it is about. The first gap is shown at once.

/** What the panel reads: the live problems, the refusal count, and the way to close it. */
export interface ReadinessListProps extends Pick<
  Publishing,
  "problems" | "refusals" | "dismissProblems"
> {
  /** Where a target with no element of its own is shown instead (phone mode). */
  fallbackFor?: (target: ReadinessProblem["target"]) => string | undefined;
}

/** The lead sentence: `Two things missing:` — the count, without the list that follows it. */
export function readinessLead(problems: readonly ReadinessProblem[]): string {
  const summary = readinessSummary(problems.map((problem) => problem.message));
  return summary.slice(0, summary.indexOf(":") + 1);
}

// The reveal, clear of the panel's own height: each refusal shows the first gap as of
// the latest render — kept in a ref so a refusal reveals once and an edit that changes
// the list does not scroll again.
function useReveal(
  panel: RefObject<HTMLElement | null>,
  problems: ReadinessListProps["problems"],
  refusals: number,
  fallbackFor: ReadinessListProps["fallbackFor"],
) {
  const reveal = (target: ReadinessProblem["target"]) =>
    revealTarget(target, panel.current?.offsetHeight ?? 0, fallbackFor?.(target));
  const first = useRef<ReadinessProblem["target"]>(undefined);
  const firstNow = problems?.[0]?.target;
  useEffect(() => {
    first.current = firstNow;
  }, [firstNow]);
  // `fallbackFor` is a module-level function or absent, so only a refusal fires this.
  useEffect(() => {
    const target = first.current;
    if (refusals > 0 && target !== undefined) {
      revealTarget(target, panel.current?.offsetHeight ?? 0, fallbackFor?.(target));
    }
  }, [refusals, panel, fallbackFor]);
  return reveal;
}

/**
 * The panel: an alert named by its lead, the problems as a list of buttons that scroll
 * to and focus the gap each one names, and a Dismiss. Each refusal reveals the first gap;
 * the list itself follows the live document, so a fixed item leaves. It sticks to the top
 * of the canvas, so the list stays in view while the canvas scrolls to each gap.
 */
export function ReadinessList(props: ReadinessListProps) {
  const { problems, refusals, dismissProblems, fallbackFor } = props;
  const leadId = useId();
  const panel = useRef<HTMLElement>(null);
  const reveal = useReveal(panel, problems, refusals, fallbackFor);
  if (problems === null || problems.length === 0) return null;
  return (
    <section
      ref={panel}
      role="alert"
      aria-labelledby={leadId}
      className="edge-clay sticky top-0 z-10 flex flex-col gap-8 bg-paper px-16 py-12 shadow-lifted"
    >
      <div className="flex items-start justify-between gap-12">
        <p id={leadId} className="min-h-44 content-center font-display text-fact-value text-ink">
          {readinessLead(problems)}
        </p>
        <IconButton
          icon={Close}
          aria-label="Dismiss"
          onClick={dismissProblems}
          className="text-meta"
        />
      </div>
      <ul className="flex flex-col">
        {problems.map((problem) => (
          <li key={problem.message}>
            <button
              type="button"
              onClick={() => reveal(problem.target)}
              className="flex min-h-44 w-full items-center rounded-control text-left text-ui text-clay transition-colors duration-hover ease-default hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
            >
              {problem.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
