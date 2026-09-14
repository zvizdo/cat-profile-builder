"use client";
import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatOnFinishCallback,
  type UIMessage,
} from "ai";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { randomIds } from "@/adapters/ids";
import { helperReducer, type HelperState, type PendingCard } from "@/core/helper/reducer";
import { listMedia, readBlocks, readOutline, readPage } from "@/core/helper/reads";
import { EDIT_TOOL_NAMES, READ_TOOL_NAMES } from "@/core/helper/tools";
import type { MediaAsset } from "@/core/media/schema";
import type { EditOperation } from "@/core/profile/operations";
import { helperStateOf, type DocumentSession } from "@/ui/builder/use-document";
import { useSurface } from "@/ui/builder/use-surface";

// The AI helper's transport (T036; contracts/helper-protocol.md → "Endpoint", "Tools",
// "Results"): `useChat` posts `{ profileId, surface, messages }` to `/api/helper/chat` and
// streams the answer back; `onToolCall` is where every one of the twelve tools the model
// can call actually lands in the browser. The four reads answer at once, from the live
// document — never a network call of their own (T035's `reads.ts` is pure). The six edits
// go through `helperReducer` itself (not a separate preview function) to decide, before
// `addToolOutput` runs, whether the edit applied, was rejected, or was carded — and a
// synchronous `stateRef` (below) is what that decision reads, not `session.state`.
//
// `onToolCall`/`onFinish` otherwise close over this call's own `session`/`assets`
// directly, and `@ai-sdk/react`'s `useChat` already keeps its own `latestRef` of whatever
// callbacks the most recent render passed it (its own source, not this file's) — passing
// a fresh closure every render is the supported way to always run against the current
// document. `transport` is the one thing genuinely memoised (recreated only when
// `profileId` or `surface` moves) because unlike the callbacks, the AI SDK holds onto the
// *instance* for the chat's whole life rather than re-reading it every render.
//
// **Review round 1, finding 1 (Important):** two structurally dependent edit tool calls
// can land in one stream step with no `read_*` round trip — and therefore no render —
// between them (e.g. an `add_block` immediately followed by a `set_field` on the block it
// just added). `session.state` at that point is still whatever the *last render* saw,
// since React only folds a dispatch into `session.state` on the next render. Reading
// `session.state` for the second call's preview would disagree with what the reducer is
// about to do. `stateRef` fixes this: `answerEdit`/`resolveCard` advance it synchronously,
// via the exact same `helperReducer` the real dispatch chain uses (`use-document.ts`'s
// `reduce`), every time they dispatch — so the ref is never behind the *decision* even
// when it is momentarily behind the committed React state. The effect below resets it
// from `session.state` whenever that actually changes (a manual undo, an autosave-driven
// update, or simply React catching up), so the ref never drifts from the truth for long
// and a stray desync (there should never be one) heals itself within one render.

const READ_TOOLS: ReadonlySet<string> = new Set(READ_TOOL_NAMES);

/** The tool names the reducer's six edit operations accept (T032) — `tools.ts`'s own list,
 * shared with the server's unanswered-card rule (`helper-stream.ts`). */
const EDIT_TOOLS: ReadonlySet<string> = new Set(EDIT_TOOL_NAMES);

export interface UseHelperOptions {
  session: DocumentSession;
  /** The library's full records — reads need alt text, dimensions and status; MediaRef alone is not enough. */
  assets: readonly MediaAsset[];
}

/** What `HelperPanel` needs beyond `session.state.helper`: the conversation and the composer. */
export interface Helper {
  messages: UIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  error: Error | undefined;
  /** Sends `text` as a new user turn; a no-op while locked or already working (FR-032),
   * except over a pending card, which it declines first (`canSend`, F35). */
  send: (text: string) => void;
  /** The card's Apply: applies the pending destructive op and answers the model. */
  applyCard: () => void;
  /** The card's Not this: declines the pending op and answers the model. */
  declineCard: () => void;
  /** Re-sends the last request after a failure (FR-046/047: nothing retries on its own). */
  retry: () => void;
}

/**
 * The ref that always reflects the helper's state at least as recently as the last thing
 * *this hook itself* did to it — `answerEdit`/`resolveCard` advance it synchronously with
 * `helperReducer`, and this effect resets it from `session.state` whenever that changes
 * (an undo, an autosave landing, or React simply catching up to a dispatch), so the two
 * can never permanently disagree.
 */
function useLatestHelperState(session: DocumentSession): RefObject<HelperState> {
  const ref = useRef<HelperState>(helperStateOf(session.state));
  useEffect(() => {
    ref.current = helperStateOf(session.state);
  }, [session.state]);
  return ref;
}

/** `ids` from a `read_blocks` call's input, defensively — a malformed call reads nothing. */
function idsOf(input: unknown): string[] {
  if (typeof input !== "object" || input === null) return [];
  const ids = (input as { ids?: unknown }).ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/** One of the four reads, answered from the live document — the shape `reads.ts` gives it.
 * Reads `doc` from `stateRef` (not `session.state`), so a read that follows an edit in the
 * same stream step — the contract's own "re-read what you changed" — sees that edit. */
function answerRead(
  toolName: string,
  input: unknown,
  stateRef: RefObject<HelperState>,
  assets: readonly MediaAsset[],
): string {
  const doc = stateRef.current.doc;
  switch (toolName) {
    case "read_outline":
      return readOutline(doc, assets);
    case "read_page":
      return readPage(doc, assets);
    case "list_media":
      return listMedia(doc, assets);
    default:
      return readBlocks(doc, assets, idsOf(input));
  }
}

type AddToolOutput = UseChatHelpers<UIMessage>["addToolOutput"];

/** A `newBlockId` that draws its id once, lazily, and hands back the same one on every
 * later call — so the *preview* (`helperReducer` against `stateRef`) and the *real*
 * dispatch (`session.helper.toolCall`) land on the exact same freshly-generated id for an
 * `add_block`, rather than each drawing its own. */
function cachedBlockId(): () => string {
  const source = randomIds();
  let cached: string | undefined;
  return () => (cached ??= source.blockId());
}

/** What every edit answerer needs: the session to dispatch the real action to, the
 * synchronous state ref its preview reads and advances, and the way to answer the model. */
interface EditContext {
  session: DocumentSession;
  stateRef: RefObject<HelperState>;
  addToolOutput: AddToolOutput;
}

/**
 * One of the six edits: advances `stateRef` with the real `helperReducer` first — which is
 * exactly how it decides applied vs. rejected vs. carded, no separate preview function —
 * then dispatches the same action for real and answers the model from what the reducer
 * just said. Not awaited by `onToolCall` (below): `addToolOutput`'s own promise only
 * settles once the AI SDK's chat state has finished updating, which happens on the same
 * internal queue that processes an incoming tool call in the first place — awaiting it
 * from inside `onToolCall` would wait on a job that is itself waiting for `onToolCall` to
 * return.
 */
function answerEdit(toolName: string, toolCallId: string, input: unknown, ctx: EditContext): void {
  const { session, stateRef, addToolOutput } = ctx;
  const op = input as EditOperation;
  const newBlockId = cachedBlockId();
  const next = helperReducer(stateRef.current, { type: "toolCall", toolCallId, op, newBlockId });
  stateRef.current = next;
  session.helper.toolCall(toolCallId, op, newBlockId);
  const result = next.turn.results[toolCallId];
  if (result?.status === "applied") {
    void addToolOutput({
      tool: toolName,
      toolCallId,
      output: { status: "applied", summary: result.summary },
    });
  } else if (result?.status === "rejected") {
    void addToolOutput({
      tool: toolName,
      toolCallId,
      output: { status: "rejected", reason: result.reason },
    });
  }
  // No result yet: carded. It now sits in `next.turn.card` (and `session.state.helper.turn.card`
  // once React catches up); the panel answers it once the volunteer clicks Apply or Not this.
}

/** The volunteer's answer to the pending card: advances `stateRef` with `helperReducer`
 * the same way `answerEdit` does, then answers the model with whatever the reducer
 * actually recorded — never a hand-built guess at the outcome. */
function resolveCard(ctx: EditContext, choice: "apply" | "decline"): void {
  const { session, stateRef, addToolOutput } = ctx;
  const card = stateRef.current.turn.card;
  if (card === null) return;
  const next = helperReducer(stateRef.current, {
    type: "cardResolved",
    toolCallId: card.toolCallId,
    choice,
  });
  stateRef.current = next;
  session.helper.cardResolved(card.toolCallId, choice);
  const result = next.turn.results[card.toolCallId];
  if (result === undefined) return;
  const output =
    result.status === "rejected"
      ? { status: "rejected" as const, reason: result.reason }
      : result.status === "applied"
        ? { status: "applied" as const, summary: result.summary }
        : { status: "declined" as const };
  void addToolOutput({ tool: card.op.op, toolCallId: card.toolCallId, output });
}

/**
 * Whether the composer can send now (contracts/helper-protocol.md → "Client state"):
 * `ready`, or *working, awaiting a card* — the reducer's `working` with a card pending
 * **and** the AI SDK's own stream already ended (`chatStatus === "ready"`). The card is
 * created inside `onToolCall`, which fires mid-stream: the same step can still carry a
 * second tool call, a server-executed `view_photos`, or closing text, and a send landing
 * then would race the live stream (its next write-back would undo the transcript decline,
 * and the SDK would run two requests at once — F35 review, finding 1). Only once the
 * stream has ended is a new message the volunteer's own way to answer the card ("Not
 * this", the unanswered-card rule). Exported for `HelperPanel.tsx`'s composer and chips,
 * so the two never disagree with `send`.
 */
export function canSend(
  helper: Pick<HelperState, "status" | "turn">,
  chatStatus: Helper["status"],
): boolean {
  if (helper.status === "ready") return true;
  return helper.status === "working" && helper.turn.card !== null && chatStatus === "ready";
}

type SetMessages = UseChatHelpers<UIMessage>["setMessages"];
type Part = UIMessage["parts"][number];

/** Rewrites the parts of the last assistant message with `rewrite`, in place, through
 * `setMessages`. Only the last message is looked at — a pending card, or a call the
 * stream left unanswered, is always on it. */
function rewriteLastAssistantParts(setMessages: SetMessages, rewrite: (part: Part) => Part) {
  setMessages((messages) =>
    messages.map((message, index) =>
      index !== messages.length - 1 || message.role !== "assistant"
        ? message
        : { ...message, parts: message.parts.map(rewrite) },
    ),
  );
}

/**
 * The unanswered-card rule in the transcript (F35): before the new message goes, the
 * card's own tool part is answered `declined` — the same output "Not this" sends — so the
 * history the next request carries has no open call in it. Written with `setMessages`,
 * not `addToolOutput`: the latter would also fire `sendAutomaticallyWhen`'s own request
 * with the history alone, racing the one `sendMessage` is about to make with the new text
 * in it. `createHelperStream` applies the same rule server-side should the two ever race
 * anyway.
 */
function declineInTranscript(setMessages: SetMessages, card: PendingCard): void {
  rewriteLastAssistantParts(setMessages, (part) =>
    isToolUIPart(part) && part.state === "input-available" && part.toolCallId === card.toolCallId
      ? { ...part, state: "output-available" as const, output: { status: "declined" } }
      : part,
  );
}

/** What a call the stream left unanswered is closed with (F42): the stall guard's own
 * sentence, and the volunteer's next message carries no open call. */
const STOPPED_MID_STEP = "The helper stopped mid-step.";

/**
 * The stall guard's transcript half (F42): every tool call of the last message still
 * waiting for an answer that will never come (`input-available` — never answered — or
 * `input-streaming` — cut off mid-input) is closed as `output-error`, so the volunteer's
 * next message carries no open call for the server to refuse ("Try again" regenerates,
 * which drops that message anyway). Done here, at the next send — the same moment F35
 * declines a waiting card — and *not* in `onFinish`: the AI SDK checks
 * `sendAutomaticallyWhen` right after `onFinish`, and a transcript made complete there
 * would auto-send at once, and again after the next stall, without end.
 */
function closeUnansweredInTranscript(setMessages: SetMessages): void {
  rewriteLastAssistantParts(setMessages, (part) =>
    isToolUIPart(part) && (part.state === "input-available" || part.state === "input-streaming")
      ? { ...part, state: "output-error" as const, input: part.input, errorText: STOPPED_MID_STEP }
      : part,
  );
}

/**
 * The composer's send: a no-op unless `canSend`. Over a pending card, the unanswered-card
 * rule (F35) runs first — the card is declined in the transcript, then in the reducer,
 * whose `send` over a pending card records the decline and closes that turn
 * (`sendOverCard`). Both the guard and the step read `stateRef` — the one state
 * `answerEdit`/`resolveCard` also read and advance — so the decision and the reducer's
 * own answer can never disagree in the window before React catches up (F35 review,
 * finding 2); the message goes out only if that step actually opened a fresh turn.
 */
function sendTurn(
  text: string,
  session: DocumentSession,
  stateRef: RefObject<HelperState>,
  chat: Pick<UseChatHelpers<UIMessage>, "setMessages" | "sendMessage" | "status">,
): void {
  const before = stateRef.current;
  if (!canSend(before, chat.status)) return;
  if (before.turn.card !== null) declineInTranscript(chat.setMessages, before.turn.card);
  closeUnansweredInTranscript(chat.setMessages);
  const next = helperReducer(before, { type: "send" });
  if (next.status !== "working" || next.turn === before.turn) return;
  stateRef.current = next;
  session.helper.send();
  void chat.sendMessage({ text });
}

/** What the stall guard needs: the session to close the turn on, and the synchronous
 * state (is a card legitimately waiting?). */
interface FinishContext {
  session: DocumentSession;
  stateRef: RefObject<HelperState>;
}

/**
 * How one stream's end closes the turn (contracts/helper-protocol.md → "Client state").
 * A failure is looked at first (F42): before F42 the `tool-calls` early return below
 * swallowed a disconnect whose `finish` chunk had already arrived, and the turn stayed
 * "working…" for ever. Then a `tool-calls` finish is one of three things: the SDK is
 * about to auto-continue (every call of the last step is answered), a card is waiting for
 * the volunteer (the one legitimate open call), or — the stall guard — a call nobody will
 * ever answer. The deployed build stalled on the third for want of this branch: three
 * carded calls displaced each other and the last was dismissed by an applied edit, so
 * `lastAssistantMessageIsCompleteWithToolCalls` stayed false with no card in sight. The
 * reducer now answers every such call (F42, `CARD_WAITING`); this guard is what makes any
 * future gap end in a failure box with Try again — applied edits kept under their undo —
 * rather than silence. The open calls themselves are closed in the transcript at the next
 * send (`closeUnansweredInTranscript`). Anything else is the turn's true end.
 */
function onStreamFinish(
  { session, stateRef }: FinishContext,
  { isError, isDisconnect, finishReason, messages }: Parameters<ChatOnFinishCallback<UIMessage>>[0],
) {
  if (isDisconnect) return session.helper.streamEnded({ error: "The connection dropped." });
  if (isError) return session.helper.streamEnded({ error: "I couldn't reach the model." });
  if (finishReason === "tool-calls") {
    if (lastAssistantMessageIsCompleteWithToolCalls({ messages })) return;
    if (stateRef.current.turn.card !== null) return;
    return session.helper.streamEnded({ error: STOPPED_MID_STEP });
  }
  session.helper.streamEnded({ finishReason: finishReason ?? "stop" });
}

/** How long the request may go without response *headers* before it is given up on. */
export const HEADERS_TIMEOUT_MS = 120_000;

/**
 * `fetch` with a timeout on the headers, not the body (F42): the body is the stream — a
 * long build takes minutes and must not be cut — but a request that never gets a response
 * at all (a dead connection the OS retransmits into for seven minutes; the "eight-minute
 * gap" in the user's log) used to leave the panel on "working…" with no way out. The
 * timer is cleared the moment `fetch` resolves. It gives up the way the network does — a
 * `TypeError` whose message says "fetch", which is exactly how the AI SDK's client
 * recognises a dropped connection (`isDisconnect`) — so the panel reads "The connection
 * dropped." with Try again. The SDK's own abort (the volunteer's Stop, a new request) is
 * forwarded so it still cancels the body. Exported for its own test only.
 */
export function fetchWithHeaderTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const upstream = init?.signal;
  if (upstream?.aborted) controller.abort(upstream.reason);
  upstream?.addEventListener("abort", () => controller.abort(upstream.reason), { once: true });
  const timer = setTimeout(
    () => controller.abort(new TypeError("Failed to fetch: no response headers in time.")),
    HEADERS_TIMEOUT_MS,
  );
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Wires `useChat` to the composed document session: the transport, the four reads
 * answered from the live document, and the six edits applied or carded through the
 * reducer.
 */
export function useHelper({ session, assets }: UseHelperOptions): Helper {
  const surface = useSurface();
  const profileId = session.state.doc.id;
  const stateRef = useLatestHelperState(session);

  // Recreated only when the address the requests carry actually changes — the AI SDK
  // keeps this instance for the chat's whole life rather than re-reading it every render
  // the way it does `onToolCall`/`onFinish` (see the file-level note above).
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/helper/chat",
        fetch: fetchWithHeaderTimeout,
        prepareSendMessagesRequest: ({ messages }) => ({ body: { profileId, surface, messages } }),
      }),
    [profileId, surface],
  );

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: (event) => onStreamFinish({ session, stateRef }, event),
    onToolCall: ({ toolCall }) => {
      const { toolCallId, toolName, input } = toolCall;
      if (READ_TOOLS.has(toolName)) {
        const output = answerRead(toolName, input, stateRef, assets);
        void chat.addToolOutput({ tool: toolName, toolCallId, output });
      } else if (EDIT_TOOLS.has(toolName)) {
        answerEdit(toolName, toolCallId, input, {
          session,
          stateRef,
          addToolOutput: chat.addToolOutput,
        });
      }
      // view_photos / load_skill are server-executed: no browser answer.
    },
  });

  const editContext: EditContext = { session, stateRef, addToolOutput: chat.addToolOutput };

  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    send: (text) => sendTurn(text, session, stateRef, chat),
    applyCard: () => resolveCard(editContext, "apply"),
    declineCard: () => resolveCard(editContext, "decline"),
    retry: () => {
      if (session.state.helper.status !== "ready") return;
      session.helper.send();
      void chat.regenerate();
    },
  };
}
