import type { ReactNode } from "react";
import { Logo, LOGO_HEIGHT } from "@/ui/shared/Logo";
import { MonoLabel } from "@/ui/shared/MonoLabel";

// The list's one bar (hi-fi 4a; CONTENT.md → Profile list): the mark, `Cats` — the page's
// heading — the live `12 · 7 published` count, then New cat and Sign out on the right, on
// the card ground with the chrome hairline beneath. Search, filters and sort stay out
// (spec). The builder for one cat has its own bar (`Topbar`).

/** What the bar counts: every cat, and how many of them are live. */
export interface ListCount {
  total: number;
  published: number;
}

/** `12 · 7 published` (CONTENT.md → Title / count). */
export function countLine({ total, published }: ListCount): string {
  return `${total} · ${published} published`;
}

export interface ListBarProps {
  /** The count, or nothing while the list could not be read. */
  count?: ListCount;
  /** The New cat button, or nothing while the list could not be read. */
  newCat?: ReactNode;
  /** The Sign out form (a Server Action), handed in by the page. */
  signOut: ReactNode;
}

/**
 * The bar, 58px, its content on the card grid's own container and gutters: mark, `Cats`
 * as the `h1`, the count as a mono reading, then whatever the page hands in for New cat
 * and Sign out. The mark is
 * decorative — `Cats` beside it names the page. On a phone the count steps aside so the
 * two controls keep their room.
 */
export function ListBar({ count, newCat, signOut }: ListBarProps) {
  return (
    <header className="border-b border-line-chrome bg-card">
      <div className="mx-auto flex min-h-topbar w-full max-w-profile-max items-center gap-12 px-28 md:gap-16 md:px-56">
        <Logo height={LOGO_HEIGHT.chrome} alt="" />
        <h1 className="font-text text-ui text-ink">Cats</h1>
        {count === undefined ? null : (
          <MonoLabel variant="reading" className="hidden text-meta whitespace-nowrap sm:block">
            {countLine(count)}
          </MonoLabel>
        )}
        <div className="flex-1" />
        {newCat}
        {signOut}
      </div>
    </header>
  );
}
