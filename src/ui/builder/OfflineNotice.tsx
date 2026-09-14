import { Toast } from "@/ui/shared/Toast";

// The offline toast (FR-024, FR-027; CONTENT.md → Toasts, Offline): shown when a save
// fails while the browser knows it is offline, and kept until the `online` event brings
// the retry. It has no close button: the state it reports is not the volunteer's to
// dismiss, and it leaves by itself when the connection is back.

/** CONTENT.md → Toasts: `Offline`. */
export const OFFLINE_MESSAGE =
  "You're offline. Your last change is saved here and will sync when you're back.";

/** The offline sentence as a polite status while `offline`; nothing otherwise. */
export function OfflineNotice({ offline }: { offline: boolean }) {
  if (!offline) return null;
  return <Toast variant="warning">{OFFLINE_MESSAGE}</Toast>;
}
