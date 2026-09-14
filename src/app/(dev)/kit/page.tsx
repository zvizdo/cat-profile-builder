import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ControlsGroup, StatusGroup } from "./KitControls";
import { NoticesGroup } from "./KitNotices";

export const metadata: Metadata = { title: "Kit" };

// The gate reads the environment at request time, not at build time, or `next build`
// would prerender the production 404 and `KIT_ENABLED` could never reopen it.
export const dynamic = "force-dynamic";

/** Whether `/kit` is served: always in development; in production only with `KIT_ENABLED=1`. */
export function kitEnabled(env: { NODE_ENV?: string; KIT_ENABLED?: string }): boolean {
  return env.NODE_ENV !== "production" || env.KIT_ENABLED === "1";
}

/**
 * The component sheet: every shared component in every state, on the design sheet's
 * paper-deep ground. A 404 in production unless `KIT_ENABLED=1`, which only the
 * Playwright web server sets — it is never in `.env.example` or the container.
 */
export default function KitPage() {
  if (!kitEnabled(process.env)) notFound();
  return (
    <main className="min-h-dvh bg-paper-deep px-28 pb-120">
      <div className="mx-auto flex max-w-profile-max flex-col gap-56">
        <header className="flex flex-col gap-12 pt-56">
          <h1 className="font-display text-tool-head text-ink">Kit</h1>
          <p className="max-w-prose text-ui font-normal text-body">
            The pieces every builder screen is made of, each in every state it has. Tab through the
            page: every control takes focus in reading order.
          </p>
        </header>
        <ControlsGroup />
        <StatusGroup />
        <NoticesGroup />
      </div>
    </main>
  );
}
