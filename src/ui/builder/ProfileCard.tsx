import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import type { ProfileSummary } from "@/app/actions/_lib/profiles";
import { relativeTime } from "@/core/format/relative-time";
import { Badge } from "@/ui/shared/Badge";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import { displayName } from "./display-name";

// One cat on the list (hi-fi 4a): the photo with its state word in the corner, the name in
// the serif underneath, the display line so two tabbies can be told apart, and a meta row
// — when it was last edited, and for a draft, Delete. Drafts sit in the same grid as live
// cats, neither hidden nor dimmed.

/** The card and tile photo shape (hi-fi 4a: 4:3), written once for the whole list. */
export const THUMB_ASPECT = "aspect-[4/3]";

export interface ProfileCardProps {
  profile: ProfileSummary;
  /** The instant `edited …` is measured from, fixed by the page so server and browser agree. */
  now: Date;
  /** Asks to delete this cat; only offered while it is a draft (FR-092). */
  onDelete: (profile: ProfileSummary) => void;
}

function Thumbnail({ url }: { url: string | null }) {
  if (url === null) {
    return <StripedPlaceholder label="no photo yet" className="h-full rounded-editorial" />;
  }
  // Unoptimised on purpose: the URL is an already-derived, immutable clean JPEG (ADR-015),
  // served by this app's own `/media` route under every store (F23).
  return <Image src={url} alt="" fill unoptimized sizes="320px" className="object-cover" />;
}

/**
 * A cat's card: one link (photo, name and line) to its builder page, the state badge
 * over the photo, `edited 4d` in the mono voice, and for a draft a Delete button named
 * after the cat. The link is the whole card's target, named by the cat alone (the badge,
 * the line and the empty-slot label stay visible but out of its name), with a blue
 * outline on focus.
 */
export function ProfileCard({ profile, now, onDelete }: ProfileCardProps) {
  const nameId = useId();
  const name = displayName(profile.name);
  return (
    <article aria-labelledby={nameId} className="flex flex-col gap-8">
      <Link
        href={`/builder/${profile.id}`}
        aria-labelledby={nameId}
        className="group flex flex-col gap-12 rounded-editorial focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue"
      >
        <div
          className={`relative ${THUMB_ASPECT} w-full overflow-hidden rounded-editorial bg-paper-deep`}
        >
          <Thumbnail url={profile.thumbnailUrl} />
          <span className="absolute top-8 left-8">
            <Badge status={profile.state} />
          </span>
        </div>
        <span className="flex flex-col gap-4">
          <span
            id={nameId}
            className="font-display text-fact-value leading-none text-ink transition-colors duration-hover ease-default group-hover:text-blue"
          >
            {name}
          </span>
          {profile.line === "" ? null : (
            <span className="line-clamp-2 text-ui-dense leading-relaxed font-normal text-body">
              {profile.line}
            </span>
          )}
        </span>
      </Link>
      <div className="flex min-h-44 items-center justify-between gap-12">
        <span className="font-label text-mono-label text-meta">
          edited {relativeTime(profile.updatedAt, now)}
        </span>
        {profile.state === "draft" ? (
          <button
            type="button"
            aria-label={`Delete ${name}`}
            onClick={() => onDelete(profile)}
            className="min-h-44 rounded-control px-8 text-ui-dense text-meta transition-colors duration-hover ease-default hover:text-clay focus-visible:text-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
          >
            Delete
          </button>
        ) : null}
      </div>
    </article>
  );
}
