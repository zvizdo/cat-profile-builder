import type { ProfileDocument } from "@/core/profile/schema";
import styles from "./profile.module.css";

// The facts strip (hi-fi; TOKENS.json layout.factsStrip): mono label over a display
// value, one cell per fact the volunteer recorded. The schema has age and sex; the
// hi-fi's coat, good-with and fee cells have no field and so no cell.

export interface FactsProps {
  age?: string;
  sex?: ProfileDocument["sex"];
}

const SEX_WORD: Record<"female" | "male", string> = { female: "Female", male: "Male" };

/** The strip, or nothing when neither fact is recorded (an unknown sex is not a fact). */
export function Facts({ age, sex }: FactsProps) {
  const cells: Array<[label: string, value: string]> = [];
  if (age !== undefined && age.trim() !== "") cells.push(["Age", age]);
  if (sex === "female" || sex === "male") cells.push(["Sex", SEX_WORD[sex]]);
  if (cells.length === 0) return null;
  return (
    <div className={styles.facts}>
      <ul aria-label="Facts" className={`${styles.container} ${styles.factsGrid}`}>
        {cells.map(([label, value]) => (
          <li key={label} className={styles.fact}>
            <span className={styles.factLabel}>{label}</span>
            <span className={styles.factValue}>{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
