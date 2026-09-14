import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDraft } from "@/app/actions/profiles";
import { displayName } from "@/ui/builder/display-name";
import { previewManifest } from "@/ui/profile/preview-manifest";
import { ProfilePage } from "@/ui/profile/ProfilePage";
import { MonoLabel } from "@/ui/shared/MonoLabel";

// The preview (FR-026; contracts/server-boundary.md → Pages): the draft rendered by the
// public page's own renderer, under one slim bar that says what this is and leads back.
// Signed-in like everything under /builder; the request guard sends a visitor to sign in.

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

/** `{name} · Preview`, or `Preview` alone when the draft cannot be read. */
export async function generateMetadata({ params }: PreviewPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await loadDraft(id);
  return { title: result.ok ? `${displayName(result.document.name)} · Preview` : "Preview" };
}

/** The bar above the page: what it is, and the way back (CONTENT.md voice). */
function PreviewBar({ id }: { id: string }) {
  return (
    <section
      aria-label="Preview"
      className="flex min-h-44 flex-wrap items-center justify-between gap-12 border-b border-line-chrome bg-paper px-28 py-8 md:px-56"
    >
      <MonoLabel variant="reading" className="text-meta">
        Preview · this is how the page looks once published
      </MonoLabel>
      <Link
        href={`/builder/${id}`}
        className="inline-flex min-h-44 items-center rounded-control px-12 text-ui text-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      >
        Back to the builder
      </Link>
    </section>
  );
}

/**
 * `/builder/{id}/preview`: the draft through `loadDraft`, its media records resolved by
 * `previewManifest`, rendered by `ProfilePage` exactly as a visitor would see it — empty
 * or unfinished slots striped. An id no cat has is a 404; any other failure shows the
 * action's sentence.
 */
export default async function PreviewPage({ params }: PreviewPageProps) {
  const { id } = await params;
  const result = await loadDraft(id);
  if (!result.ok && result.error.code === "not_found") notFound();
  if (!result.ok) {
    return (
      <main className="min-h-dvh bg-paper px-28 py-40 md:px-56">
        <p role="alert" className="max-w-prose text-ui text-body">
          {result.error.message}
        </p>
      </main>
    );
  }
  return (
    <>
      <PreviewBar id={id} />
      <ProfilePage document={result.document} media={previewManifest(result.assets)} />
    </>
  );
}
