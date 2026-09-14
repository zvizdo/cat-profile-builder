import type { ReactNode } from "react";
import { MonoLabel } from "@/ui/shared/MonoLabel";

// The kit's own furniture, drawn like the design sheet: a white panel with a blue mono
// caption, and a hairline-topped section head. Dev-only, never shipped to a volunteer.

/** A white panel with a caption naming the group it shows. */
export function Panel({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <section
      aria-label={caption}
      className="flex min-w-0 flex-col gap-16 rounded-panel bg-card p-28"
    >
      <MonoLabel className="text-blue">{caption}</MonoLabel>
      {children}
    </section>
  );
}

/** A hairline-topped heading with one sentence, and the panels under it. */
export function Group({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-28">
      <header className="flex flex-wrap items-baseline gap-x-16 gap-y-8 border-t border-line-tag pt-16">
        <h2 className="font-display text-fact-value text-ink">{title}</h2>
        <p className="max-w-prose text-ui font-normal text-body">{note}</p>
      </header>
      <div className="grid items-start gap-16 md:grid-cols-2">{children}</div>
    </section>
  );
}

/** A caption under a single specimen — an icon, a placeholder, a state. */
export function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-8 text-meta">
      {children}
      <MonoLabel className="text-center">{label}</MonoLabel>
    </div>
  );
}
