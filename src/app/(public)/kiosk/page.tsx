import type { Metadata } from "next";
import { getContainer } from "@/adapters/container";
import { loadRoster } from "@/app/api/_lib/carousel";
import { parseHold } from "@/core/carousel/hold";
import { KioskShell } from "@/ui/carousel/KioskShell";

// `/kiosk?hold=` (contracts/server-boundary.md → Pages; FR-065, FR-089): the carousel as
// an unattended event display — fullscreen, no chrome, the roster re-read every five
// minutes by the shell's own poll — with the hold from the address, clamped. The first
// roster is read here, per request, so the first paint waits on no fetch.

export const metadata: Metadata = { title: "Adoptable now" };

/** Storage is read per request; caching a public page is out of scope. */
export const dynamic = "force-dynamic";

interface KioskPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The live roster and the clamped hold, handed to the kiosk shell. */
export default async function KioskPage({ searchParams }: KioskPageProps) {
  const { hold } = await searchParams;
  const roster = await loadRoster(getContainer());
  return <KioskShell roster={roster} hold={parseHold(hold)} />;
}
