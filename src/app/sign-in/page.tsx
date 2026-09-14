import type { Metadata } from "next";
import { getContainer } from "@/adapters/container";
import { signIn } from "@/app/actions/auth";
import { ProfileImage } from "@/ui/profile/ProfileImage";
import { Logo, LOGO_HEIGHT } from "@/ui/shared/Logo";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { signInPanelData, type SignInPanelData } from "./_lib/panel";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Read per request, like `/cats`: the panel counts the live cats. Without this, `next build`
 * tries to prerender the page, which reaches `getContainer()` before any request-time API
 * and fails on the build container's empty environment (found on the first Docker build).
 */
export const dynamic = "force-dynamic";

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// The photo panel (hi-fi 4b): a live cat's photo filling the panel under the scrim —
// clear through the middle, dark at the foot — the mark in white top-left, and at the
// foot the live count in the serif (CONTENT.md → Sign in → Photo panel; no place — FR/F4).
// On a phone it is a square band above the form; beside the form it takes the form's
// height.
function PhotoPanel({ photo, sentence }: SignInPanelData) {
  return (
    <div className="relative flex aspect-square flex-col justify-between overflow-hidden bg-night p-28 md:col-span-4 md:aspect-auto">
      <ProfileImage media={photo} sizes="(min-width: 768px) 400px, 100vw" priority />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-b from-night/35 via-night/10 via-40% to-night/80"
      />
      <Logo height={LOGO_HEIGHT.signIn} tone="white" alt="South County Cats" className="relative" />
      <p className="relative font-display text-tool-head text-card text-pretty">{sentence}</p>
    </div>
  );
}

/**
 * The first page a volunteer sees (FR-001): one card on the paper ground at the hi-fi's
 * 900px, the photo panel taking four ninths of it (the comp's 400) with the live count,
 * then the form. The count and the photo come from the
 * published copies alone. `next` from the query is the guarded path the request guard
 * turned away from; it is handed to the form untouched and judged by the action.
 */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const [{ next }, rows] = await Promise.all([
    searchParams,
    getContainer().profileStore.listPublished(),
  ]);
  const panel = signInPanelData(rows);
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-28 py-56">
      <div className="grid w-full max-w-sign-in-card overflow-hidden rounded-panel bg-card shadow-screen md:grid-cols-9">
        <PhotoPanel {...panel} />
        <div className="flex flex-col gap-28 p-28 md:col-span-5 md:p-40">
          <header className="flex flex-col gap-8">
            <h1 className="font-display text-tool-head text-ink">Sign in</h1>
            <p className="max-w-prose font-text text-ui leading-relaxed font-normal text-body">
              One shared account for everyone who writes cat profiles. Ask a coordinator if you
              don&apos;t have it.
            </p>
          </header>
          <SignInForm action={signIn} next={typeof next === "string" ? next : undefined} />
          <div className="flex flex-col gap-8">
            {/* F28 review #9: the mono reading voice (11px, sentence case) — not the
                13px dense chrome size it had drifted to. */}
            <MonoLabel as="p" variant="reading" className="text-meta">
              Stays signed in for 30 days
            </MonoLabel>
            <p className="text-ui-dense text-meta">Forgotten the password? Ask a coordinator.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
