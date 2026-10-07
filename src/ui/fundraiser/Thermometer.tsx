import type { CSSProperties } from "react";
import { codePointLength, fitStep, TAG_FIT } from "@/core/fundraiser/fit";
import type { Milestone, Progress } from "@/core/fundraiser/progress";
import styles from "@/ui/fundraiser/fundraiser.module.css";
import { PawMark } from "@/ui/fundraiser/PawMark";

/** What the thermometer needs: the derived figures, the two amounts in cents, and the spoken line. */
export interface ThermometerProps {
  /** The fill, the tag text and the four paws, from core's `progress()`. */
  progress: Progress;
  /**
   * Whole cents raised and the goal, the same two numbers `progress` was made from. They feed
   * the meter's `aria-valuenow` (raised, capped at the goal) and `aria-valuemax`, so no text
   * is ever parsed back into a number.
   */
  raisedCents: number;
  goalCents: number;
  /** The sentence a screen reader speaks, such as "$6,500 raised of a $10,000 goal, 65 percent". */
  valuetext: string;
  /** The amounts are open for editing: the tube and bulb outlines turn blue-light with a soft glow. */
  highlighted?: boolean;
}

/** The fill line's lift as a transform: the mask rises by `level` of its height, less the gradient's fall. */
const MASK_TRANSFORM = "translateY(calc((1 - var(--level)) * 100%))";
const GRADIENT_TRANSFORM = "translateY(calc((var(--level) - 1) * 100%))";
const TAG_TRANSFORM = "translateY(calc(var(--level) * -100%))";

/** One paw print with its label, centred on its share of the scale box. Decoration only. */
function Paw({ milestone }: { milestone: Milestone }) {
  const style: CSSProperties = { bottom: `${milestone.at}%` };
  return (
    <div className={styles.paw} data-paw data-lit={milestone.lit} style={style} aria-hidden="true">
      <span>{milestone.label}</span>
      <span className={styles.pawIcon} data-lit={milestone.lit}>
        <PawMark lit={milestone.lit} className={styles.pawMark} />
      </span>
    </div>
  );
}

/**
 * The fundraising thermometer, drawn from plain elements and CSS: a tube with a round top, a
 * neck and an always-filled bulb, a fill that rises by a transform reveal, a percentage tag that
 * rides the fill line, and four paw prints that light as their share is reached. It is one
 * `role="meter"` with a name and a spoken value; every drawn part is hidden from assistive
 * technology because `valuetext` already says it. The component sets only the level (`--level`,
 * a unitless 0 to 1) and the milestones' positions; the stylesheet sizes everything from tokens.
 * Nothing here animates on load: the transforms change only when `progress` does.
 */
export function Thermometer({
  progress,
  raisedCents,
  goalCents,
  valuetext,
  highlighted,
}: ThermometerProps) {
  const { level, tagLabel, milestones } = progress;
  const levelStyle = { "--level": level } as CSSProperties;
  const flag = highlighted === true;

  return (
    <div
      className={styles.thermometer}
      role="meter"
      aria-label="Fundraising progress"
      aria-valuemin={0}
      aria-valuemax={goalCents / 100}
      aria-valuenow={Math.min(raisedCents, goalCents) / 100}
      aria-valuetext={valuetext}
      style={levelStyle}
    >
      <div className={styles.scale}>
        <div className={styles.tube} data-highlighted={flag} aria-hidden="true">
          <div className={styles.fillClip}>
            <div className={styles.fillMask} data-fill style={{ transform: MASK_TRANSFORM }}>
              <div className={styles.fillGradient} style={{ transform: GRADIENT_TRANSFORM }} />
            </div>
          </div>
        </div>
        {milestones.map((milestone) => (
          <Paw key={milestone.at} milestone={milestone} />
        ))}
        <div
          className={styles.tagTrack}
          data-tag-track
          style={{ transform: TAG_TRANSFORM }}
          aria-hidden="true"
        >
          <div className={styles.tag} data-fit={fitStep(codePointLength(tagLabel), TAG_FIT)}>
            <span className={styles.tagText}>{tagLabel}</span>
          </div>
        </div>
      </div>
      <div className={styles.bulb} data-highlighted={flag} aria-hidden="true">
        <div className={styles.neck} />
      </div>
    </div>
  );
}
