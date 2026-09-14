import type { Block, ResolvedMedia } from "@/core/profile/schema";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import { ProfileImage } from "../ProfileImage";
import styles from "../profile.module.css";

// A line someone said, over a drifting photo (hi-fi quote photo): the attribution as the
// whisper kicker, the words in the display face, both on the scrim that keeps white
// text readable whatever the photograph.

export interface QuoteProps {
  block: Extract<Block, { type: "quote" }>;
  media: ResolvedMedia | undefined;
}

/** The quote section: bleed, drift, scrim, attribution and the line as a blockquote. */
export function Quote({ block, media }: QuoteProps) {
  const attribution = block.attribution?.trim() ?? "";
  return (
    <section className={styles.bleed} data-scene="cover">
      <div className={styles.drift}>
        {media === undefined ? (
          <StripedPlaceholder label="photo" className={styles.heroStripes} />
        ) : (
          <ProfileImage media={media} sizes="100vw" />
        )}
      </div>
      <div className={styles.bleedScrim} />
      <div className={`${styles.container} ${styles.bleedInk}`}>
        <figure className={`${styles.bleedText} ${styles.riseLate}`} data-scene="enter">
          {attribution === "" ? null : (
            <figcaption className={styles.quoteWho}>{attribution}</figcaption>
          )}
          <blockquote className={styles.quoteText}>{block.text}</blockquote>
        </figure>
      </div>
    </section>
  );
}
