import type { Block, MediaId, ResolvedMedia } from "@/core/profile/schema";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import { ProfileImage } from "../ProfileImage";
import styles from "../profile.module.css";
import type { SectionStrings } from "../strings";

// The pinned three-scene day (hi-fi; ADR-009): one view timeline on the 340svh section
// drives three cross-fading photos, their captions and three progress dashes inside a
// sticky viewport. The heading comes first in the DOM, then three complete figures in
// order; under reduced motion the stylesheet lays the same tree out stacked — heading,
// then each photo with its caption — with the dashes hidden (FR-069).

export interface DayProps {
  block: Extract<Block, { type: "day" }>;
  media: Record<MediaId, ResolvedMedia>;
  strings: Pick<SectionStrings, "day">;
  id?: string;
}

/** The day section: kicker and dashes over three scenes, each a photo and its caption. */
export function Day({ block, media, strings, id }: DayProps) {
  return (
    <section id={id} className={styles.day} data-scene="pin">
      <div className={styles.dayPin}>
        <div className={`${styles.container} ${styles.dayInk}`}>
          <div className={styles.dayHead}>
            <h2 className={styles.dayKicker}>{strings.day}</h2>
            <div className={styles.dashes} data-dashes aria-hidden="true">
              {block.scenes.map((_, index) => (
                <span key={index} className={styles.dash}>
                  <span className={styles.dashFill} />
                </span>
              ))}
            </div>
          </div>
          <div className={styles.daySlot} />
        </div>
        <div className={styles.dayScenes}>
          {block.scenes.map((scene, index) => {
            const entry = scene.mediaId === null ? undefined : media[scene.mediaId];
            return (
              <figure key={index} className={styles.scene}>
                <div className={styles.scenePhoto}>
                  {entry === undefined ? (
                    <StripedPlaceholder label="photo" className={styles.heroStripes} />
                  ) : (
                    <ProfileImage media={entry} sizes="100vw" />
                  )}
                </div>
                <figcaption className={`${styles.container} ${styles.sceneCaption}`}>
                  <span className={styles.sceneCaptionText}>{scene.caption}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
        <div className={styles.dayScrim} />
        <div className={styles.dayClock} aria-hidden="true" />
      </div>
    </section>
  );
}
