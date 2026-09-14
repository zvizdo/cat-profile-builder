import Link from "next/link";

// What a visitor sees at an address that has no live cat (FR-083): unpublished,
// archived, deleted, or never there. Calm, one sentence, one way on — no footer.

/** The 404 for the profile route: a heading in the shelter's voice and a link to the index. */
export default function ProfileNotFound() {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-28 bg-paper px-28 py-80 md:px-56">
      <h1 className="max-w-prose font-display text-section-head text-ink">
        {"This cat isn't listed right now."}
      </h1>
      <p className="max-w-prose text-prose text-body">
        The page may have been taken down while the profile is updated, or the cat has found a home.
      </p>
      <Link
        href="/cats"
        className="inline-flex min-h-44 w-fit items-center rounded-pill bg-blue-deep px-28 text-ui text-card transition-colors duration-hover ease-default hover:bg-blue focus-visible:bg-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      >
        See the cats looking for a home
      </Link>
    </main>
  );
}
