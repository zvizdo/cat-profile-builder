import type { Block, ResolvedMedia } from "@/core/profile/schema";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import { ProfileImage } from "../ProfileImage";
import styles from "../profile.module.css";

// A full-bleed photo that drifts as it passes (hi-fi feature photo), its caption in the
// display face over the scrim at the foot. Without an entry the bleed is striped.

export interface PhotoProps {
  block: Extract<Block, { type: "photo" }>;
  media: ResolvedMedia | undefined;
}

/** The photo section: 88svh bleed, drift, scrim, caption. */
export function Photo({ block, media }: PhotoProps) {
  const caption = block.caption?.trim() ?? "";
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
      {caption === "" ? null : (
        <div className={`${styles.container} ${styles.bleedInk}`}>
          <div className={`${styles.bleedText} ${styles.riseLate}`} data-scene="enter">
            <p className={styles.photoCaption}>{caption}</p>
          </div>
        </div>
      )}
    </section>
  );
}
