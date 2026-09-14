"use client";
import type { ProfileDocument } from "@/core/profile/schema";
import { Modal } from "@/ui/shared/Modal";
import { Toast } from "@/ui/shared/Toast";
import {
  archiveQuestion,
  contrastQuestion,
  liveSentence,
  unpublishedSentence,
  unpublishQuestion,
} from "./publish-strings";
import type { Publishing } from "./use-publishing";

// The questions and toasts publishing raises (CONTENT.md → Toasts, Modals; FR-031): the
// contrast warning with its way back, the two confirmations that name what changes, the
// live toast with the page, the back-to-draft toast with Undo, and an action's failure.

export interface PublishNoticesProps {
  doc: ProfileDocument;
  publishing: Publishing;
}

/**
 * The one open question. The contrast warning has three answers — `Not now` (safe, and
 * Escape), `Publish anyway` (outline) and `Restore to passing` (primary: one undoable
 * `set_theme`, then publish) — the confirmations two, the keep answer safe.
 */
export function PublishQuestions({ doc, publishing }: PublishNoticesProps) {
  const { question, publication } = publishing;
  if (question === null) return null;
  if (question.kind === "contrast") {
    const { title, body } = contrastQuestion(doc.theme);
    return (
      <Modal
        open
        title={title}
        body={body}
        safeAction={{ label: "Not now", onClick: publishing.keep }}
        alternateAction={{ label: "Publish anyway", onClick: publishing.publishAnyway }}
        dangerAction={{ label: "Restore to passing", onClick: publishing.restoreAndPublish }}
      />
    );
  }
  const q =
    question.kind === "unpublish"
      ? unpublishQuestion(doc.name, doc.sex, publication.state)
      : archiveQuestion(doc.name, doc.sex);
  return (
    <Modal
      open
      title={q.title}
      body={q.body}
      safeAction={{ label: q.keep, onClick: publishing.keep }}
      dangerAction={{
        label: q.go,
        destructive: true,
        onClick: question.kind === "unpublish" ? publishing.unpublish : publishing.archive,
      }}
    />
  );
}

/** The one toast, for the builder's toast region. */
export function PublishToastView({ doc, publishing }: PublishNoticesProps) {
  const { toast } = publishing;
  if (toast === null) return null;
  if (toast.kind === "live") {
    return (
      <Toast
        variant="success"
        action={{
          label: "View page",
          onClick: () => window.open(toast.url, "_blank", "noopener,noreferrer"),
        }}
      >
        {liveSentence(doc.name, toast.url)}
      </Toast>
    );
  }
  if (toast.kind === "unpublished") {
    return (
      <Toast variant="success" action={{ label: "Undo", onClick: publishing.undoUnpublish }}>
        {unpublishedSentence(doc.name, doc.sex)}
      </Toast>
    );
  }
  return (
    <Toast variant="error" onDismiss={publishing.dismissToast}>
      {toast.message}
    </Toast>
  );
}
