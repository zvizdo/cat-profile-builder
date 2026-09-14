"use client";
import { Fragment } from "react";
import { turnGroups, type AppliedEdit, type Turn, type TurnStanding } from "@/core/helper/reducer";
import { useRevealBlock, type Reveal } from "@/ui/builder/follow";
import { DASHED_BOX, LINK_BUTTON } from "./styles";
import { appliedLine, failureLine } from "./turn-lines";

// CONTENT.md → Helper, Applied / Failure: what the panel shows once a turn ends —
// "Applied — moved quote; changed bio." with "Undo these" for a clean finish (F26: the
// reducer's `turnClauses`, read as a sentence of the panel's own; the history entry keeps
// its `CATalyst: …` label, contracts/helper-protocol.md), or the reducer's own
// `failureSentence` with "Try again" for one that was cut off or never reached the
// model (both sentences as strings: `turn-lines.ts`, shared with the phone's peek bar). Renders nothing while the turn is still open (`turn.outcome === null`) or ended
// with nothing to say (a clean turn that applied no edits, e.g. plain-text-only replies).
//
// The receipt never outlives its own undo (F26 review, finding 1): `standing` is the
// reducer's `turnStanding` — where the turn's one history entry sits now. While it is the
// top of `past`, "Applied — …" + "Undo these" is true and acts on it. Once undone it is
// the top of `future`: the block becomes the dashed box — the design system's "nothing of
// this stands on the page" voice, the same one the dismissed card speaks — reading
// "Undone." with "Redo these" beneath, the way "show the suggestion again" sits beneath
// "Left as it was". A disabled "Undo these" would be a control that does nothing, and a
// silently hidden one would leave "Applied — …" claiming something no longer on the
// page. Once the entry is neither (buried under a newer edit, or undone twice) the block
// goes: a link here would act on someone else's step.
//
// F34 ("follow, then overview"): the Applied line is also the change list. Each label
// with a block on the canvas is a button that scrolls the canvas to it and blinks it —
// the same scroll and blink the canvas did as the edit landed — through the builder's
// `RevealProvider`; the sentence itself does not change.

export interface TurnSummaryProps {
  turn: Turn;
  /** `turnStanding(state)`: whether Undo / Redo these would act on this turn's own entry. */
  standing: TurnStanding;
  onUndo: () => void;
  onRedo: () => void;
  onRetry: () => void;
}

/** The undone receipt: the turn's edits are off the page again, one redo away. */
const UNDONE = "Undone.";

/** A label of the change list, inline in the sentence's own type: blue, underlined on
 * hover, the blue ring for keyboard focus — the link voice without the mono face, since
 * it sits inside a sentence. `py-12 -my-12` widens what a finger can hit to the 44px
 * band (DESIGN.md §4, mobile) without moving the line the sentence sets on (F34 review,
 * finding 5); the panel's own `Undo these` / `Try again` links still lack it. */
const CHANGE_LINK =
  "py-12 -my-12 text-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue";

interface ChangeProps {
  edit: AppliedEdit;
  verb: AppliedEdit["verb"];
  canvas: Reveal;
}

/** One label of the list: a button that finds its block on the canvas, named by its whole
 * clause (`added bio`) so it is never just "bio" to a screen reader; plain words for an
 * edit with no block to go to (a theme, a facts field) or whose block is no longer on the
 * page (added and removed in the same turn) — never a button that does nothing. */
function Change({ edit, verb, canvas }: ChangeProps) {
  const { target } = edit;
  if (target === null || !canvas.onPage.has(target)) return <>{edit.label}</>;
  return (
    <button
      type="button"
      className={CHANGE_LINK}
      aria-label={`${verb} ${edit.label}`}
      onClick={() => canvas.reveal(target)}
    >
      {edit.label}
    </button>
  );
}

/**
 * F34: the Applied line as the turn's change list — the same sentence `appliedLine`
 * reads, folded the same way (`turnGroups`), with each label that has a block on the
 * canvas as the button that scrolls to it and blinks it again. Only inside the builder
 * (`RevealProvider`); anywhere else the line is the plain sentence.
 */
function ChangeList({ turn, canvas }: { turn: Turn; canvas: Reveal }) {
  return (
    <>
      Applied —{" "}
      {turnGroups(turn).map((group, g) => (
        <Fragment key={g}>
          {g > 0 ? "; " : ""}
          {group.verb}{" "}
          {group.edits.map((edit, e) => (
            <Fragment key={edit.toolCallId}>
              {e > 0 ? ", " : ""}
              <Change edit={edit} verb={group.verb} canvas={canvas} />
            </Fragment>
          ))}
        </Fragment>
      ))}
      .
    </>
  );
}

type StepProps = Pick<TurnSummaryProps, "standing" | "onUndo" | "onRedo">;

/** The one link that acts on the turn's own entry: undo while it stands, redo once
 * undone, nothing once it is neither. */
function StepLink({ standing, onUndo, onRedo }: StepProps) {
  if (standing === "gone") return null;
  const [label, act] = standing === "undoable" ? ["Undo these", onUndo] : ["Redo these", onRedo];
  return (
    <button type="button" className={LINK_BUTTON} onClick={act}>
      {label}
    </button>
  );
}

function SuccessSummary({ turn, standing, onUndo, onRedo }: Omit<TurnSummaryProps, "onRetry">) {
  const canvas = useRevealBlock();
  if (turn.applied.length === 0 || standing === "gone") return null;
  if (standing === "redoable") {
    return (
      <div className={DASHED_BOX}>
        <p className="text-ui-dense font-normal text-body">{UNDONE}</p>
        <StepLink standing={standing} onUndo={onUndo} onRedo={onRedo} />
      </div>
    );
  }
  return (
    <div className="edge-blue flex flex-col gap-6 bg-paper px-12 py-12">
      <p className="text-ui-dense font-medium text-ink">
        {canvas === null ? appliedLine(turn) : <ChangeList turn={turn} canvas={canvas} />}
      </p>
      <StepLink standing={standing} onUndo={onUndo} onRedo={onRedo} />
    </div>
  );
}

function FailureSummary({ turn, standing, onUndo, onRedo, onRetry }: TurnSummaryProps) {
  return (
    <div className={DASHED_BOX}>
      <p className="text-ui-dense font-normal text-body">{failureLine(turn)}</p>
      <div className="flex flex-wrap gap-16">
        <StepLink standing={standing} onUndo={onUndo} onRedo={onRedo} />
        <button type="button" className={LINK_BUTTON} onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

/** The one place a just-ended turn is summed up, success or failure. */
export function TurnSummary(props: TurnSummaryProps) {
  const { outcome } = props.turn;
  if (outcome === null) return null;
  if (outcome.kind === "done") return <SuccessSummary {...props} />;
  return <FailureSummary {...props} />;
}
