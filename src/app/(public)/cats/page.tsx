import type { Metadata } from "next";
import { getContainer } from "@/adapters/container";
import { indexEntries } from "@/ui/profile/index-entries";
import { IndexPage } from "@/ui/profile/IndexPage";

// The public index (contracts/server-boundary.md → Pages; FR-090): every live cat from
// `listPublished()` — never the draft, never the archive — read on every request, so a
// publish, an archive or an unpublish shows on the next load without anyone editing it.

export const metadata: Metadata = { title: "Cats" };

/** Storage is read per request; caching a public page is out of scope. */
export const dynamic = "force-dynamic";

/** `/cats`: the live cats, most recently published first, or the one empty sentence. */
export default async function CatsPage() {
  const rows = await getContainer().profileStore.listPublished();
  return <IndexPage entries={indexEntries(rows)} />;
}
