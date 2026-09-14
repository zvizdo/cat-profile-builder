import Link from "next/link";
import { Logo, LOGO_HEIGHT } from "@/ui/shared/Logo";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import type { IndexEntry } from "./index-entries";
import { ProfileImage } from "./ProfileImage";

// The public index (FR-090): every live cat as a photo, a name and one line, each a link
// to the page. It is the profile page's front door, so it is built only from that page's
// parts — its translucent bar with the mark, its kicker-over-head opening, its
// photographs with nothing drawn over them, its 4:3 list crop (hi-fi 4a / 7a) — and holds
// nothing the page itself would not show: no state, no dates, no ids beyond the addresses.
// Tailwind throughout (ADR-008 names the index a utility surface); the utilities mirror
// `.headerBar` / `.headerInner` / `.wordmark` / `.kicker` / `.head` in profile.module.css.

/** The one sentence for an empty index (T001's placeholder, kept). */
export const EMPTY_INDEX = "No cats are listed yet. Check back soon.";

/** The kicker over the title — the carousel's own header string (CONTENT.md). */
export const INDEX_KICKER = "Adoptable now";

/** The sentence under the title when there are cats to show (CONTENT.md → Public index). */
export const INDEX_INTRO = "Open a page for the photos and the full story.";

export interface IndexPageProps {
  entries: IndexEntry[];
}

/** The profile page's focus ring: 4px blue, 4px off the edge (`.wordmark:focus-visible`). */
const FOCUS_RING =
  "focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue";

/**
 * The card photo: the 4:3 list crop on the record's focal point, over stripes until it
 * arrives — never a grey box (DESIGN.md §4). The image itself never moves or changes.
 */
function CardPhoto({ entry }: { entry: IndexEntry }) {
  return (
    <div className="stripes relative aspect-[4/3] w-full overflow-hidden">
      {entry.photo === null ? (
        <StripedPlaceholder label="photo coming" className="h-full rounded-editorial" />
      ) : (
        <ProfileImage
          media={entry.photo}
          sizes="(min-width: 1280px) 280px, (min-width: 1024px) 30vw, (min-width: 640px) 46vw, 100vw"
        />
      )}
    </div>
  );
}

/**
 * One cat: the whole card is the link. On hover and focus the name takes the prose link's
 * underline, in ink — nothing else changes. The line is clamped to two lines so every
 * card in a row keeps the same height.
 */
function Card({ entry }: { entry: IndexEntry }) {
  return (
    <li>
      <Link href={entry.href} className={`group flex flex-col gap-12 ${FOCUS_RING}`}>
        <CardPhoto entry={entry} />
        <span className="flex flex-col gap-8">
          <span className="font-display text-index-name text-ink decoration-1 underline-offset-[0.15em] group-hover:underline group-focus-visible:underline">
            {entry.name}
          </span>
          {entry.line === "" ? null : (
            <span className="line-clamp-2 text-ui leading-normal font-normal text-body">
              {entry.line}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

/**
 * The page: the profile bar with the mark, the kicker, the heading and one sentence, then
 * the cats in the order given (most recently published first) as a list of cards — or,
 * with none live, the one empty sentence in the intro's place. Every card is one link
 * named by the cat; the photo's alt is the manifest's.
 */
export function IndexPage({ entries }: IndexPageProps) {
  const empty = entries.length === 0;
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-10 border-b border-line-chrome bg-paper/80 backdrop-blur-lg backdrop-saturate-[1.4]">
        <div className="mx-auto flex min-h-56 w-full max-w-profile-max items-center px-28 py-8 md:px-56">
          <Link
            href="/cats"
            aria-current="page"
            className={`flex min-h-44 items-center transition-opacity duration-hover ease-default hover:opacity-70 ${FOCUS_RING}`}
          >
            <Logo height={LOGO_HEIGHT.nav} alt="South County Cats" />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-profile-max flex-col gap-40 px-28 pt-56 pb-80 md:gap-56 md:px-56 md:pt-80 md:pb-120">
        <div className="flex max-w-prose flex-col gap-20">
          <p className="font-label text-mono-label text-blue uppercase">{INDEX_KICKER}</p>
          <h1 className="font-display text-section-head text-ink text-pretty">
            Cats looking for a home
          </h1>
          <p className="text-prose text-body">{empty ? EMPTY_INDEX : INDEX_INTRO}</p>
        </div>
        {empty ? null : (
          <ul className="m-0 grid list-none grid-cols-1 gap-x-16 gap-y-40 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {entries.map((entry) => (
              <Card key={entry.href} entry={entry} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
