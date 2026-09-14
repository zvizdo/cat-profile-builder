import type { LanguageModelV3 } from "@ai-sdk/provider";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockLanguageModelV3 } from "ai/test";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callPart,
  finishPart,
  hasResult,
  scriptedStream,
  STOP,
  STREAM_START,
  textParts,
  TOOL_CALLS,
} from "@/adapters/fake/scenarios/_shared";
import type { MediaAsset } from "@/core/media/schema";
import type { ProfileDocument } from "@/core/profile/schema";
import { useDocument, type DocumentSession } from "@/ui/builder/use-document";
import { HelperPanel } from "@/ui/helper/HelperPanel";
import { useHelper } from "@/ui/helper/use-helper";
import { photoAsset } from "../../unit/core/media/builders";
import { document, hero } from "../../unit/core/profile/builders";
import { fakeChatFetch } from "./support";

// T036 review round 1, finding 1 (Important): `answerEdit` used to compute its preview
// from the closed-over `session.state` of the last render, so a *second* edit tool call
// in the same stream step — with no `read_*` round trip (and so no render) between it and
// the first — could see a stale document. This reproduces exactly that shape: one stream
// step carries `add_block` (an empty bio) immediately followed by `set_field` on that same
// new block's id, with no finish/round-trip between them. The fix (a `stateRef` advanced
// synchronously with the same `helperReducer` on every dispatch) makes the second call see
// the first's effect; the bug this guards against would instead have the second call fail
// to find the block at all (`session.state` still shows only the hero) and come back
// `rejected`.
//
// The new block's id has to be known up front to script the second call's target, so
// `@/adapters/ids` is mocked to a fixed id for this file only — `use-document.ts`'s own
// manual-edit id source draws from the same module, but nothing here does a manual edit.
const FIXED_BLOCK_ID = "newblockaaaa";
vi.mock("@/adapters/ids", () => ({
  randomIds: () => ({
    profileId: () => "testprof",
    blockId: () => FIXED_BLOCK_ID,
    mediaId: () => "testmedia",
  }),
}));

interface Latest {
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

function renderHelper(doc: ProfileDocument, assets: MediaAsset[] = [photoAsset()]): Latest {
  const latest: Latest = { session: null };
  render(<Harness doc={doc} assets={assets} onSession={(session) => (latest.session = session)} />);
  return latest;
}

/** One stream step: `add_block` (empty bio) then, with no round trip in between,
 * `set_field` writing text into that same new block — a real dependency on the first
 * call's result, resolved with no render between the two `onToolCall` invocations. */
function dependentEditsModel(): LanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "fake",
    modelId: "dependent-edits",
    doStream: async ({ prompt }) => {
      if (!hasResult(prompt, "add_block")) {
        return {
          stream: scriptedStream([
            STREAM_START,
            callPart("call-add", "add_block", {
              op: "add_block",
              block: { type: "bio", content: { paragraphs: [] } },
            }),
            callPart("call-set", "set_field", {
              op: "set_field",
              target: { kind: "block", blockId: FIXED_BLOCK_ID },
              path: "content",
              value: { paragraphs: [{ runs: [{ text: "Written in the same step." }] }] },
            }),
            finishPart(TOOL_CALLS),
          ]),
        };
      }
      return {
        stream: scriptedStream([STREAM_START, ...textParts("t", "Done."), finishPart(STOP)]),
      };
    },
  });
}

describe("dependent edit tool calls in one stream step", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("both come back applied, and land as one history entry", async () => {
    const user = userEvent.setup();
    const doc = document({ blocks: [hero()] });
    vi.stubGlobal("fetch", vi.fn(fakeChatFetch(dependentEditsModel())));
    const latest = renderHelper(doc);

    await user.type(screen.getByPlaceholderText("Ask for a change…"), "Write a bio.{Enter}");
    await waitFor(() => expect(latest.session?.state.helper.status).toBe("ready"));

    const applied = latest.session?.state.helper.turn.applied ?? [];
    expect(applied).toHaveLength(2);
    expect(applied.map((edit) => edit.toolCallId)).toEqual(["call-add", "call-set"]);

    // The dependent `set_field` found the block the `add_block` just created — the bug
    // this guards against would have rejected it ("no block with id ...") instead.
    expect(latest.session?.state.doc.blocks[1]).toMatchObject({
      id: FIXED_BLOCK_ID,
      type: "bio",
    });
    expect(latest.session?.state.doc.blocks).toHaveLength(2);

    // One helper turn, one history entry — not two, even though two tool calls landed.
    expect(latest.session?.state.history.past).toHaveLength(1);
    expect(latest.session?.canUndo).toBe(true);
  });
});
