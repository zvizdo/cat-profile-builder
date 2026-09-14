import type { Block } from "@/core/profile/schema";
import { RichText } from "../RichText";
import styles from "../profile.module.css";
import type { SectionStrings } from "../strings";

// The story (hi-fi `Who she is`): the heading and the display line as the pull line on
// the left, the prose on the right at the body clamp and a 52ch measure. The first bio on
// a page leads; any later bio continues as prose alone, so the heading is said once.

export interface BioProps {
  block: Extract<Block, { type: "bio" }>;
  strings: Pick<SectionStrings, "who">;
  /** The display line to head the section with; given only to the page's first bio. */
  lead?: string;
  /** The anchor id, on the first bio only. */
  id?: string;
}

/** The bio section: heading, pull line and prose when it leads; prose when it follows. */
export function Bio({ block, strings, lead, id }: BioProps) {
  return (
    <section id={id} className={styles.section}>
      <div className={`${styles.container} ${styles.bioGrid}`}>
        {lead === undefined ? null : (
          <div className={styles.bioLead}>
            <h2 className={`${styles.kicker} ${styles.riseSoft}`} data-scene="enter">
              {strings.who}
            </h2>
            {lead === "" ? null : (
              <p className={`${styles.head} ${styles.wipe}`} data-scene="enter">
                {lead}
              </p>
            )}
          </div>
        )}
        <div className={`${styles.prose} ${styles.rise}`} data-scene="enter">
          <RichText content={block.content} />
        </div>
      </div>
    </section>
  );
}
