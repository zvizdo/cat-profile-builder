import { MonoLabel } from "@/ui/shared/MonoLabel";

// CONTENT.md → Builder, Chrome / helper-protocol.md → "Client state": while the helper is
// streaming, the topbar says so — the one place a volunteer sees it without opening the
// panel, since Undo/Redo and Publish are quietly refused for the same reason at the same
// moment. Renders nothing the rest of the time.

const WORKING = "CATalyst is working…";

export interface WorkingBarProps {
  working: boolean;
}

export function WorkingBar({ working }: WorkingBarProps) {
  if (!working) return null;
  return (
    <MonoLabel as="span" role="status" variant="reading" className="text-meta">
      {WORKING}
    </MonoLabel>
  );
}
