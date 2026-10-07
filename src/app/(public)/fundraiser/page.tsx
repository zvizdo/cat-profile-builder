import type { Metadata } from "next";
import { readAddress } from "@/core/fundraiser/address";
import { FundraiserDisplay } from "@/ui/fundraiser/FundraiserDisplay";

// `/fundraiser` (contracts/address.md; ADR-018): the fundraising thermometer for a shelter's
// big screen. The drive's name and both amounts live in the address, so there is no store,
// no cookie, no Server Action and no Route Handler: the server reads the query, turns it
// into a complete, valid fundraiser and renders it. The page answers 200 with a full display
// for every address; each bad value falls back on its own.

/**
 * A static title and no indexing: the headline is whatever the address says, so it is never
 * allowed into `<title>` or anywhere a search engine or a link preview would copy it.
 */
export const metadata: Metadata = {
  title: "Fundraiser",
  robots: { index: false, follow: false },
};

/** The address is read per request; a page built once would freeze one fundraiser for everyone. */
export const dynamic = "force-dynamic";

interface FundraiserPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The display for the fundraiser the address describes, or the starting one when it says nothing. */
export default async function FundraiserPage({ searchParams }: FundraiserPageProps) {
  // Handed on as `unknown`: the reader, not the page, decides what any value means.
  const query: unknown = await searchParams;
  const { fundraiser, isBlank } = readAddress(query);
  return <FundraiserDisplay initial={fundraiser} isBlank={isBlank} />;
}
