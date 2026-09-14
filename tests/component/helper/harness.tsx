import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import type { MediaAsset } from "@/core/media/schema";
import type { ProfileDocument } from "@/core/profile/schema";
import { useDocument, type DocumentSession } from "@/ui/builder/use-document";
import { HelperPanel } from "@/ui/helper/HelperPanel";
import { useHelper } from "@/ui/helper/use-helper";
import { photoAsset } from "../../unit/core/media/builders";

// The panel over a real document session and the real `useHelper` (the same wiring the
// builder page does), for component tests that drive a whole turn through a scripted
// route (`support.ts`). `latest.session` is whatever the most recent render produced, so
// a test can read the document and the helper's state the way the page itself would.

export interface Latest {
  session: DocumentSession | null;
}

function Harness(props: {
  doc: ProfileDocument;
  assets: MediaAsset[];
  onSession: (session: DocumentSession) => void;
}) {
  const { doc, assets, onSession } = props;
  const session = useDocument(doc, assets);
  const helper = useHelper({ session, assets });
  useEffect(() => {
    onSession(session);
  });
  return <HelperPanel session={session} helper={helper} />;
}

/** Renders the panel over `doc`, with one ready photo unless `assets` says otherwise. */
export function renderHelper(doc: ProfileDocument, assets: MediaAsset[] = [photoAsset()]): Latest {
  const latest: Latest = { session: null };
  render(<Harness doc={doc} assets={assets} onSession={(session) => (latest.session = session)} />);
  return latest;
}

/** Types `text` into the composer and presses Enter. */
export async function send(text: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Ask for a change…"), `${text}{Enter}`);
}
