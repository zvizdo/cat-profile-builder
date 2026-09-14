import type { Block } from "@/core/profile/schema";
import styles from "../profile.module.css";
import type { SectionStrings } from "../strings";

// What the cat needs in a home (hi-fi): the kicker, then one card per need on the
// section surface — numbered as the hi-fi numbers them, a short list read in order.

export interface NeedsProps {
  block: Extract<Block, { type: "needs" }>;
  strings: Pick<SectionStrings, "needs">;
  id?: string;
}

/** The needs section: its heading and a list of titled cards. */
export function Needs({ block, strings, id }: NeedsProps) {
  return (
    <section id={id} className={styles.section}>
      <div className={styles.container}>
        <div className={styles.needsHead}>
          <h2 className={`${styles.kicker} ${styles.riseSoft}`} data-scene="enter">
            {strings.needs}
          </h2>
        </div>
        <ul className={styles.cards}>
          {block.cards.map((card, index) => (
            <li key={index} className={`${styles.card} ${styles.rise}`} data-scene="enter">
              <span className={styles.cardIndex} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className={styles.cardTitle}>{card.title}</h3>
              <p className={styles.cardText}>{card.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
