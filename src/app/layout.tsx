import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Work_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// The three families DESIGN.md §2 names, self-hosted at build (ADR-008). Each exposes the
// CSS variable that `src/ui/tokens.css` points its font token at.
const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
});

const workSans = Work_Sans({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-work-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: { default: "South County Cats", template: "%s · South County Cats" },
  description: "Cats waiting for a home at a volunteer-run rescue in South County, Rhode Island.",
};

/**
 * The viewport: the phone builder's Full sheet is `100dvh` minus the topbar with the
 * composer pinned at its foot (design 2026-09-13 §3), so the soft keyboard must shrink
 * the viewport rather than slide over it — `interactive-widget=resizes-content` says so
 * (the default on Android Chrome is `resizes-visual`, which leaves `dvh` untouched and
 * the composer hidden behind the keys). `viewport-fit=cover` lets the page reach under
 * the home bar so `env(safe-area-inset-bottom)` reports it and the phone's bottom bar
 * pads itself above it. The rest is Next's own default.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
};

/**
 * The document shell every page renders inside. Guarantees a single `<html lang="en">`
 * carrying the three font variables and the global stylesheet; it owns no layout of its own.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
