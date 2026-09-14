import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getContainer } from "@/adapters/container";
import { displayLine } from "@/core/profile/display-line";
import { ProfilePage } from "@/ui/profile/ProfilePage";
import { lookupPublished } from "./_lib/lookup";

// The public profile (contracts/server-boundary.md → Pages; FR-055–FR-059, FR-083):
// reads `published.json` on every request — so unpublishing takes effect at once — and
// renders it through the one page. Nothing here reads the draft or the archive.

/** Storage is read per request; caching a public page is out of scope. */
export const dynamic = "force-dynamic";

interface PublicProfileProps {
  params: Promise<{ slugAndId: string }>;
}

/** `{name}` (the layout adds ` · South County Cats`) and the display line; no id anywhere. */
export async function generateMetadata({ params }: PublicProfileProps): Promise<Metadata> {
  const { slugAndId } = await params;
  const result = await lookupPublished(getContainer().profileStore, slugAndId);
  if (result.kind !== "found") return {};
  return { title: result.document.name, description: displayLine(result.document) };
}

/**
 * `/cats/{slug}-{id}`: a 404 when the segment is not an address or no published copy
 * exists under its id (archived included), a 308 to the current address when only the
 * slug is stale, otherwise the page from the published document and its manifest.
 */
export default async function PublicProfile({ params }: PublicProfileProps) {
  const { slugAndId } = await params;
  const result = await lookupPublished(getContainer().profileStore, slugAndId);
  if (result.kind === "not-found") notFound();
  if (result.kind === "redirect") permanentRedirect(result.to);
  return <ProfilePage document={result.document} media={result.document.media} />;
}
