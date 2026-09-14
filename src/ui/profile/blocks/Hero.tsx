import type { CSSProperties } from "react";
import type { ResolvedMedia } from "@/core/profile/schema";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import { ProfileImage } from "../ProfileImage";
import styles from "../profile.module.css";

// The portal (hi-fi; DESIGN.md §5): a full-bleed photo the page dives into as it scrolls,
// the name at the hero clamp, the display line, and the `Scroll in` cue. The zoom's
// origin is the focal point, so it dives toward the cat — data, set inline.

export interface HeroProps {
  name: string;
  /** The tagline or the bio's first sentence (`displayLine`); empty shows nothing. */
  line: string;
  /** The hero's manifest entry; `undefined` stripes the ground (the preview of an empty slot). */
  media: ResolvedMedia | undefined;
}

/** The kicker every page opens with (CONTENT.md → Public profile → Hero kicker). */
const KICKER = "Looking for a home";

function Ink({ name, line }: { name: string; line: string }) {
  return (
    <>
      <span className={styles.heroKicker}>{KICKER}</span>
      <h1 className={styles.heroName}>{name}</h1>
      {line === "" ? null : <p className={styles.heroLine}>{line}</p>}
    </>
  );
}

/**
 * The hero section: a 260svh runway whose sticky viewport holds the photo, its scrim,
 * the ink and the cue; scroll drives the zoom, the veil and the ink's lift. The photo is
 * the page's priority image. Without a manifest entry the ground is striped.
 */
export function Hero({ name, line, media }: HeroProps) {
  const origin =
    media === undefined
      ? undefined
      : ({ "--focal-x": `${media.focal.x}%`, "--focal-y": `${media.focal.y}%` } as CSSProperties);
  return (
    <section className={styles.hero} data-scene="pin">
      <div className={styles.heroPin}>
        <div className={styles.heroPhoto} style={origin}>
          {media === undefined ? (
            <StripedPlaceholder label="photo" className={styles.heroStripes} />
          ) : (
            <ProfileImage media={media} sizes="100vw" priority />
          )}
        </div>
        <div className={styles.heroScrim} />
        <div className={styles.heroVeil} />
        <div className={`${styles.container} ${styles.heroInk}`}>
          <Ink name={name} line={line} />
        </div>
        <span className={styles.heroCue} aria-hidden="true">
          Scroll in
        </span>
      </div>
    </section>
  );
}
