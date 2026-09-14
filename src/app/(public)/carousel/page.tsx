import type { Metadata } from "next";
import { getContainer } from "@/adapters/container";
import { loadRoster } from "@/app/api/_lib/carousel";
import { parseHold } from "@/core/carousel/hold";
import { Carousel } from "@/ui/carousel/Carousel";

// `/carousel?hold=` (contracts/server-boundary.md → Pages; FR-061, FR-089): the carousel
// with visible controls, every live cat read on each request — so a publish or an
// unpublish shows on the next load — and the hold from the address, clamped.

export const metadata: Metadata = { title: "Adoptable now" };

/** Storage is read per request; caching a public page is out of scope. */
export const dynamic = "force-dynamic";

interface CarouselPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The live roster and the clamped hold, handed to the one carousel component. */
export default async function CarouselPage({ searchParams }: CarouselPageProps) {
  const { hold } = await searchParams;
  const roster = await loadRoster(getContainer());
  return <Carousel roster={roster} hold={parseHold(hold)} />;
}
