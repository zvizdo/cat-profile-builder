import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadDraft } from "@/app/actions/profiles";
import { Builder } from "@/ui/builder/Builder";
import { displayName } from "@/ui/builder/display-name";

interface BuilderIdPageProps {
  params: Promise<{ id: string }>;
}

/** `{name} · Builder`, or `Builder` alone when the draft cannot be read. */
export async function generateMetadata({ params }: BuilderIdPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await loadDraft(id);
  return { title: result.ok ? `${displayName(result.document.name)} · Builder` : "Builder" };
}

/** The empty canvas region an unreadable draft shows in place of the builder (FR-018). */
function EmptyCanvas() {
  return <section aria-label="Canvas" className="min-h-80 flex-1 bg-paper-deep" />;
}

/**
 * The builder for one cat: loads the draft through `loadDraft` and hands it to the client
 * shell with its media records. A draft that fails validation renders exactly one sentence
 * — as the page's heading, since it is the whole page — and an empty canvas, nothing
 * partial and no rail (FR-018). An id no cat has is a 404. Any other failure (the store,
 * the session) is an alert with the action's sentence, like the list page.
 */
export default async function BuilderIdPage({ params }: BuilderIdPageProps) {
  const { id } = await params;
  const result = await loadDraft(id);
  if (!result.ok && result.error.code === "not_found") notFound();
  if (!result.ok && result.error.code !== "invalid") {
    return (
      <main className="min-h-dvh bg-paper px-28 py-40 md:px-56">
        <p role="alert" className="max-w-prose text-ui text-body">
          {result.error.message}
        </p>
      </main>
    );
  }
  if (!result.ok) {
    return (
      <main className="flex min-h-dvh flex-col gap-28 bg-paper px-28 py-40 md:px-56">
        <h1 className="max-w-prose font-display text-tool-head text-ink">{result.error.message}</h1>
        <EmptyCanvas />
      </main>
    );
  }
  return (
    <Builder
      document={result.document}
      assets={result.assets}
      publication={{ state: result.state, url: result.url }}
      now={new Date().toISOString()}
    />
  );
}
