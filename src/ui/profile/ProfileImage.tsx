import Image from "next/image";
import type { ResolvedMedia } from "@/core/profile/schema";

// One photo of the published page (ADR-007): `next/image` against the manifest's public
// URL — the root-relative `/media/…` path this app serves under every store (F23) —
// filling the box its parent draws, cropped on the record's focal point. The
// focal point travels as an inline `object-position` because it is data, not styling
// (FR-072).

export interface ProfileImageProps {
  media: ResolvedMedia;
  /** The `sizes` hint for this surface: `100vw` for a full bleed, a fraction for a cell. */
  sizes: string;
  /** Load first — the hero is the page's largest contentful paint (SC-004). */
  priority?: boolean;
  className?: string;
}

/**
 * The manifest entry's photo — or a clip's poster — as an optimised `fill` image on its
 * focal point, described by the manifest's alt text. Renders nothing for a clip with no
 * poster; the video renderer draws the striped placeholder in that case.
 */
export function ProfileImage({ media, sizes, priority = false, className }: ProfileImageProps) {
  const src = media.kind === "photo" ? media.src : media.poster;
  if (src === undefined) return null;
  return (
    <Image
      src={src}
      alt={media.alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      style={{ objectFit: "cover", objectPosition: `${media.focal.x}% ${media.focal.y}%` }}
    />
  );
}
