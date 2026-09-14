import type { Metadata } from "next";
import { signOut } from "@/app/actions/auth";
import { createProfile, deleteProfile, listProfiles } from "@/app/actions/profiles";
import { ListBar } from "@/ui/builder/ListBar";
import { ProfileList } from "@/ui/builder/ProfileList";
import { MonoLabel } from "@/ui/shared/MonoLabel";

export const metadata: Metadata = { title: "Your cats" };

/**
 * Read per request: the list is the volunteer's live drafts behind the session guard. Without
 * this, `next build` tries to prerender it, reaches `getContainer()` through `listProfiles`
 * before any request-time API and fails on the build container's empty environment.
 */
export const dynamic = "force-dynamic";

// Sign out (FR-005): a form posting the Server Action, shown at the right of the list's
// bar in the chrome's sentence-case mono (hi-fi 4a). The list renders the bar itself, so it
// can put New cat beside this.
function SignOut() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="flex min-h-44 items-center rounded-control px-8 text-meta transition-colors duration-hover ease-default hover:text-blue focus-visible:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      >
        <MonoLabel variant="reading" className="whitespace-nowrap">
          Sign out
        </MonoLabel>
      </button>
    </form>
  );
}

/**
 * The profile list (FR-028): every cat, last edited first, from `listProfiles`, under the
 * list's one bar. The request guard already turned a signed-out visitor away, and the
 * action re-checks; if it still answers an error the page shows that sentence under a bar
 * with only Sign out on it, rather than an empty list.
 */
export default async function BuilderPage() {
  const result = await listProfiles();
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      {result.ok ? (
        <ProfileList
          profiles={result.profiles}
          now={new Date().toISOString()}
          createProfile={createProfile}
          deleteProfile={deleteProfile}
          signOut={<SignOut />}
        />
      ) : (
        <>
          <ListBar signOut={<SignOut />} />
          <main className="px-28 py-40 md:px-56">
            <p role="alert" className="max-w-prose text-ui text-body">
              {result.error.message}
            </p>
          </main>
        </>
      )}
    </div>
  );
}
