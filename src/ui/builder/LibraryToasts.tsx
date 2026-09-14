"use client";
import { Toast } from "@/ui/shared/Toast";
import type { MediaLibraryState, Notice } from "./use-media-library";

// The media rail's toasts (CONTENT.md → Toasts: progress, warning, error), drawn by the
// shell in its one `ToastRegion` (F38): a screen has one stack, so a refusal from the
// rail is never painted under the shell's own toast. The state is the library's; this
// file only draws it.

// Warnings offer `Use anyway`; errors offer `Try again` when the notice carries a retry.
function NoticeToast({ notice, onClear }: { notice: Notice; onClear: () => void }) {
  if (notice.kind === "warning") {
    return (
      <Toast
        variant="warning"
        action={{ label: "Use anyway", onClick: onClear }}
        onDismiss={onClear}
      >
        {notice.text}
      </Toast>
    );
  }
  const { retry } = notice;
  const action = retry === null ? undefined : { label: "Try again", onClick: retry };
  return (
    <Toast variant="error" action={action} onDismiss={onClear}>
      {notice.text}
    </Toast>
  );
}

export interface LibraryToastsProps {
  library: Pick<MediaLibraryState, "progress" | "notice" | "clearNotice">;
}

/** The progress of the upload in flight, and the one notice that stays until dismissed. */
export function LibraryToasts({ library }: LibraryToastsProps) {
  const { progress, notice, clearNotice } = library;
  return (
    <>
      {progress === null ? null : (
        <Toast variant="progress" percent={progress.percent}>
          Uploading {progress.name} — {progress.index} of {progress.total}
        </Toast>
      )}
      {notice === null ? null : <NoticeToast notice={notice} onClear={clearNotice} />}
    </>
  );
}
