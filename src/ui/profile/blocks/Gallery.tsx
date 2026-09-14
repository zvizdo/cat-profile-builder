import type { Block, MediaId, ResolvedMedia } from "@/core/profile/schema";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import { ProfileImage } from "../ProfileImage";
import styles from "../profile.module.css";

// The gallery (hi-fi): the first photo large, the rest in cells, on a six-column grid
// that becomes two on a phone. Each cell is cropped on its focal point. Its heading is
// the nav's word for it, so heading navigation reaches every section.

export interface GalleryProps {
  block: Extract<Block, { type: "gallery" }>;
  media: Record<MediaId, ResolvedMedia>;
  id?: string;
}

/** The `sizes` hint for the lead cell and for the others. */
const LEAD_SIZES = "(max-width: 767px) 100vw, (max-width: 1280px) 66vw, 850px";
const CELL_SIZES = "(max-width: 767px) 50vw, (max-width: 1280px) 33vw, 420px";

/** The gallery section: a list of the photos, striped where the manifest has none. */
export function Gallery({ block, media, id }: GalleryProps) {
  return (
    <section id={id} className={styles.section}>
      <div className={styles.container}>
        <h2 className={`${styles.kicker} ${styles.galleryHead}`}>Photos</h2>
      </div>
      <ul className={`${styles.container} ${styles.gallery}`}>
        {block.mediaIds.map((mediaId, index) => {
          const entry = media[mediaId];
          return (
            // Keyed by position: a media id in a key would ride into the RSC payload (FR-059).
            <li key={index} className={styles.cell}>
              {entry === undefined ? (
                <StripedPlaceholder label="photo" className={styles.cellStripes} />
              ) : (
                <ProfileImage media={entry} sizes={index === 0 ? LEAD_SIZES : CELL_SIZES} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
