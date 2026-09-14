import "server-only";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import {
  convertToModelMessages,
  getToolName,
  isToolUIPart,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { downscaleForModel } from "@/adapters/sharp/downscale";
import type { HelperSurface } from "@/core/helper/reducer";
import {
  createHelperTools,
  EDIT_TOOL_NAMES,
  ViewPhotosOutputSchema,
  type LoadSkillResult,
  type ViewPhotosResult,
} from "@/core/helper/tools";
import { photoBudget, type PhotoBudgetState } from "@/core/helper/photo-budget";
import type { MediaAsset } from "@/core/media/schema";
import type { Logger } from "@/core/ports";
import { issuePaths } from "./tool-errors";

export { helperUIMessageStream } from "./helper-ui-stream";

// The one owner of the server side of `view_photos` (contracts/helper-protocol.md →
// Endpoint, FR-082, T035 controller ruling 1): the per-request photo budget, the read of a
// photo's bytes, and the ≤ 768 px downscale a model sees, all live here rather than in the
// route. The route only assembles what this needs and hands the `streamText` result to
// `createUIMessageStreamResponse`.

/** What `readPhoto` answers with: a photo's derived bytes and their media type. */
export interface ReadPhotoResult {
  bytes: Uint8Array;
  mediaType: string;
}

/** Reads one photo's bytes by media id, or `null` when it cannot be read (T035, ADR-005). */
export type ReadPhoto = (id: string) => Promise<ReadPhotoResult | null>;

export interface CreateHelperStreamOptions {
  model: LanguageModelV3;
  /** The assembled system prompt (`src/core/helper/prompt.ts`). */
  system: string;
  /** The chat history as the AI SDK's UI messages; converted to model messages here. */
  messages: UIMessage[];
  /** This profile's media records — `view_photos`'s ownership and budget rulebook. */
  assets: readonly MediaAsset[];
  readPhoto: ReadPhoto;
  loadSkill: (name: string) => Promise<LoadSkillResult>;
  logger: Logger;
  /** Which profile and surface this turn is for — the turn log's two ids (F42). */
  profileId: string;
  surface: HelperSurface;
}

const READ_FAILED = "That photo couldn't be read.";

/**
 * `view_photos`'s `execute`: applies `photoBudget` (ownership, photos-only, ≤ 6 per call,
 * twelve per request) against `assets`, then reads and downscales every allowed id. The
 * budget's running count lives in this closure, for the life of one request — never module
 * state, never the client's (FR-082: the server counts, not the browser).
 */
function makeViewPhotos(
  assets: readonly MediaAsset[],
  readPhoto: ReadPhoto,
): (ids: string[]) => Promise<ViewPhotosResult> {
  let state: PhotoBudgetState = { sent: 0 };
  return async (ids) => {
    const budget = photoBudget(state, ids, assets);
    state = budget.state;
    const refused = [...budget.refused];
    const photos: ViewPhotosResult["photos"] = [];
    for (const id of budget.allowed) {
      const read = await readPhoto(id);
      if (read === null) {
        refused.push({ id, error: READ_FAILED });
        continue;
      }
      const downscaled = await downscaleForModel(read.bytes);
      photos.push({
        id,
        mediaType: "image/jpeg",
        data: Buffer.from(downscaled).toString("base64"),
      });
    }
    return { photos, refused };
  };
}

const SHOWN_EARLIER = "Shown earlier in this conversation; call view_photos again to see it.";

/**
 * Rewrites every already-resolved `tool-view_photos` part in `messages` so its `output`
 * carries no photo bytes: every id it once showed becomes a `refused` entry naming why
 * (T040 review round 1, M1). Without this, the AI SDK's `toModelOutput` (`tools.ts`) turns
 * every *stored* `view_photos` result back into an image part on every later turn — the
 * whole history rides along in each request, since the client resends it — so the
 * per-request twelve-photo budget (`photoBudget`, a fresh closure per request) bounded only
 * this request's *new* calls, not what the request actually carried. Run once, here, before
 * `convertToModelMessages`, so the budget is what FR-082 says it is: the one ceiling on a
 * single request's image cost. The model can still ask to see the same photo again — that
 * is a new call, counted fresh against this request's own budget — it just never gets it
 * for free from history.
 *
 * Since F42 the browser stores `{ shown: [ids], refused }` rather than the bytes
 * (`helper-ui-stream.ts`), so this mostly reads `shown`; the older `{ photos, refused }`
 * shape a tab left open across the deploy still carries is read the same way.
 *
 * `part.output` is parsed with `ViewPhotosOutputSchema`, not cast (T040 review round 2, R2):
 * `chat()` validates every stored `view_photos` output against the same schema before this
 * function ever runs, so the parse always succeeds on that path, but `createHelperStream` is
 * itself an exported function a caller could reach without going through `chat()` — the
 * contract tests do exactly that — and a cast would have handed such a caller's malformed
 * output straight to `.map`, a `TypeError`, not a refusal. An output that fails to parse
 * (only reachable that way) is treated as if nothing were ever shown.
 */
function redactViewedPhotos(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (!isToolUIPart(part)) return part;
      if (getToolName(part) !== "view_photos") return part;
      if (part.state !== "output-available") return part;
      const parsed = ViewPhotosOutputSchema.safeParse(part.output);
      const shown = !parsed.success
        ? []
        : "shown" in parsed.data
          ? parsed.data.shown
          : parsed.data.photos.map((photo) => photo.id);
      const redacted: ViewPhotosResult = {
        photos: [],
        refused: shown.map((id) => ({ id, error: SHOWN_EARLIER })),
      };
      return { ...part, output: redacted };
    }),
  }));
}

/** The six edit tools — the only ones a card can hold (`EDIT_TOOL_NAMES`, tools.ts). */
const EDIT_TOOLS: ReadonlySet<string> = new Set(EDIT_TOOL_NAMES);

/** What a card the volunteer never answered is answered with (helper-protocol.md → Results). */
const DECLINED = { status: "declined" } as const;

/**
 * The unanswered-card rule, server side (F35; contracts/helper-protocol.md → "Results"):
 * a browser-answered tool call the history still carries *unanswered* must not reach the
 * model as an open call — a `tool-call` with no `tool-result` is a prompt Gemini rejects
 * outright, and nothing in this request will ever answer it (the browser answers only the
 * calls of the stream it is reading). An edit tool in `input-available` is a card the
 * volunteer walked away from by sending the next message: the document was untouched
 * (FR-043), so it is answered `declined`, exactly as "Not this" would have. `use-helper.ts`
 * already does this before it sends, so this is the belt to that's braces — a race between
 * the two, or a client this app did not write, must still not break the next turn. Any
 * other unanswered call (a read the browser never answered — it never happens — or a
 * call cut off mid-input, `input-streaming`, whose `input` may be partial) is dropped: it
 * has no honest answer, and the model can simply make it again. A message left with no
 * content by that drop is skipped whole by `convertToModelMessages`, so the model may see
 * two `user` turns back to back — kept that way on purpose (F35 review, finding 7): no
 * stand-in assistant sentence, since words the model never said must not enter its own
 * history, and Gemini accepts consecutive user contents. Documented in
 * contracts/helper-protocol.md → "Results".
 */
function settleUnansweredCalls(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.flatMap((part): UIMessage["parts"] => {
      if (!isToolUIPart(part)) return [part];
      if (part.state !== "input-streaming" && part.state !== "input-available") return [part];
      if (part.state === "input-available" && EDIT_TOOLS.has(getToolName(part))) {
        return [{ ...part, state: "output-available" as const, output: DECLINED }];
      }
      return [];
    }),
  }));
}

/** How a turn ended, for the log's three closing keys. */
interface TurnEnd {
  finishReason: string;
  aborted: boolean;
  errored: boolean;
}

/** The two token counts `streamText`'s `totalUsage` reports; zero when a provider omits one. */
interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** What the log reads of a `StepResult`: its tool calls' names, and whether the SDK
 * refused one (`invalid`, with the error). Structural, so the helper's own typed tool set
 * (which `StepResult<ToolSet>` does not accept) fits without a cast. */
interface StepLike {
  toolCalls: ReadonlyArray<{ toolName: string; invalid?: boolean; error?: unknown }>;
}

/**
 * The per-turn log (F42; contracts/helper-protocol.md → "Client state", the turn log):
 * one `info` line per request when the stream finishes, one `warn` when it errors or is
 * aborted — `profileId`, `surface`, the step count, the tool names in order, how it
 * finished and what it cost. Ids and names only: never an input, an output, a message's
 * text or a photo (constitution: logs carry ids only). Cloud Run had nothing to say about
 * the stalled builds this task fixes; this is what it will say next time. `onError` gets
 * no steps from the SDK, so the steps seen so far are kept here for it.
 */
function turnLog(logger: Logger, ids: { profileId: string; surface: HelperSurface }) {
  const startedAt = Date.now();
  const seen: StepLike[] = [];
  // An `error` part inside the stream reaches `onError` *and* then `onFinish` (with
  // `finishReason: "error"`); a provider that throws outright reaches only `onError`.
  // Either way the info line, when there is one, says the turn errored.
  let errored = false;
  const fields = (steps: readonly StepLike[], end: TurnEnd, usage: TurnUsage) => ({
    profileId: ids.profileId,
    surface: ids.surface,
    steps: steps.length,
    toolCalls: steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
    finishReason: end.finishReason,
    aborted: end.aborted,
    errored: end.errored,
    durationMs: Date.now() - startedAt,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  });
  return {
    step: (step: StepLike) => {
      seen.push(step);
    },
    finish: (steps: readonly StepLike[], finishReason: string, usage: TurnUsage) => {
      const end = { finishReason, aborted: false, errored };
      logger.info(fields(steps, end, usage), "helper turn");
    },
    abort: (steps: readonly StepLike[]) => {
      const end = { finishReason: "abort", aborted: true, errored: false };
      logger.warn(fields(steps, end, {}), "helper turn");
    },
    error: (error: unknown) => {
      errored = true;
      const end = { finishReason: "error", aborted: false, errored };
      logger.warn({ ...fields(seen, end, {}), err: error }, "helper turn");
    },
  };
}

/** The `info` line for a call the SDK refused (F42): the tool and the failing paths —
 * never the input the model sent. Nothing recorded this before. */
function logInvalidInputs(logger: Logger, step: StepLike): void {
  for (const call of step.toolCalls) {
    if (call.invalid !== true) continue;
    logger.info(
      { toolName: call.toolName, paths: issuePaths(call.error) },
      "helper invalid tool input",
    );
  }
}

/**
 * Starts the helper's model call (contracts/helper-protocol.md → Endpoint step 3):
 * `view_photos` and `load_skill` are the only two tools with an `execute` here, every other
 * tool is answered by the browser. Logs one `debug` line per step with the tool-call names
 * and finish reason, one `info` line per refused call, and one `info` line per turn
 * (`turnLog`) — never a photo's bytes, never a read's content (T035 controller ruling 2).
 * `messages` is converted to model messages here so the route stays a thin wrapper; the
 * stream the browser reads is `helperUIMessageStream` over the result.
 */
export async function createHelperStream(options: CreateHelperStreamOptions) {
  const { model, system, messages, assets, readPhoto, loadSkill, logger } = options;
  const tools = createHelperTools({ viewPhotos: makeViewPhotos(assets, readPhoto), loadSkill });
  const modelMessages = await convertToModelMessages(
    redactViewedPhotos(settleUnansweredCalls(messages)),
    { tools },
  );
  const log = turnLog(logger, options);
  return streamText({
    model,
    system,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(40),
    onStepFinish: (step) => {
      logger.debug(
        {
          step: step.stepNumber,
          toolCalls: step.toolCalls.map((call) => call.toolName),
          finishReason: step.finishReason,
        },
        "helper step",
      );
      logInvalidInputs(logger, step);
      log.step(step);
    },
    onFinish: (event) => {
      log.finish(event.steps, event.finishReason, event.totalUsage);
    },
    onAbort: ({ steps }) => {
      log.abort(steps);
    },
    onError: ({ error }) => {
      log.error(error);
    },
  });
}
