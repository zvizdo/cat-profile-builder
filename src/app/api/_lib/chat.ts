import type { JSONValue, LanguageModelV3, SharedV3ProviderMetadata } from "@ai-sdk/provider";
import { createUIMessageStreamResponse, MessageConversionError } from "ai";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { scenario, SCENARIO_NAMES } from "@/adapters/fake/language-model";
import type { Container } from "@/adapters/container";
import { readAssets } from "@/adapters/pipeline/read-assets";
import {
  createHelperStream,
  helperUIMessageStream,
  type ReadPhoto,
} from "@/adapters/vertex/helper-stream";
import { respond } from "@/app/api/_lib/respond";
import { requireSession } from "@/app/api/_lib/session";
import { ProfileInvalidError, parseOrThrow } from "@/core/errors";
import { systemPrompt } from "@/core/helper/prompt";
import { getSkill, loadSkillCatalogue } from "@/core/helper/skills";
import { HELPER_TOOL_NAMES, ViewPhotosOutputSchema } from "@/core/helper/tools";
import type { MediaAsset } from "@/core/media/schema";
import { ProfileIdSchema } from "@/core/profile/schema";

// `POST /api/helper/chat` (contracts/helper-protocol.md → Endpoint). A thin wrapper: parse
// the body, check the session, load the profile's media records, assemble the system
// prompt, hand everything to `createHelperStream` (the one owner of `streamText` and the
// server side of `view_photos`), and stream the answer back. No page content, no media
// table, no image ever sits in this file — everything the model sees goes through a tool.

/** What the route needs from the container. */
export type ChatDeps = Pick<
  Container,
  "mediaStore" | "logger" | "readSession" | "languageModel" | "config"
>;

// Test-only (T039 controller ruling): the e2e run's built server holds one fake model for
// its whole life (`FAKE_MODEL_SCENARIO` fixed at boot), so a Playwright journey that wants
// a specific scripted conversation names it in this header instead. Read only when
// `MODEL=fake`; a real `MODEL=vertex` deployment ignores it entirely, so nothing a request
// carries can ever swap in a scripted model in production.
const FAKE_SCENARIO_HEADER = "x-fake-scenario";

/** `deps.languageModel`, or a fresh scripted one named by `x-fake-scenario` (fake mode
 * only; test-only, see the comment above). An unknown name is `invalid`, 400 — the same
 * shape every other bad request in this file answers with, not the 500 `scenario()` itself
 * throws for a boot-time typo. */
function resolveLanguageModel(deps: ChatDeps, request: NextRequest): LanguageModelV3 {
  if (deps.config.MODEL !== "fake") return deps.languageModel;
  const name = request.headers.get(FAKE_SCENARIO_HEADER);
  if (name === null) return deps.languageModel;
  if (!SCENARIO_NAMES.includes(name)) {
    throw new ProfileInvalidError(`Unknown fake model scenario "${name}".`);
  }
  return scenario(name);
}

// The incoming history's shape, closed (constitution Principle IV: no `as` on untrusted
// data; Principle VI: every boundary validated) — T040 review round 1, M1(b). Only a `user`
// or `assistant` message, never a client-supplied `system` message (that is this file's own
// `systemPrompt()`, assembled server-side, never something the client can add to or replace
// — FR-082's "nothing is pushed" would otherwise mean nothing *by the server*, while the
// client's own history could still smuggle one in). A user message carries text only, never
// a `file` part (FR-037: never a video to the model, and no other file either — the model
// sees photos only through `view_photos`, server-side). An assistant message carries text,
// reasoning, the SDK's own bookkeeping parts, or a tool part in one of the states the SDK
// persists (below) — a *successful* result (`output-available`) only ever for one of the
// twelve named tools, never a thirteenth name a client could invent (L1: the status log's
// `toolName` is one of these twelve by construction, not merely by convention).
//
// F35 (found on Cloud Run 2026-09-13, the third round of this bug class after
// `providerMetadata`/`state: "done"`/`step-start` below): the schema accepted a tool part
// in `state: "output-available"` and nothing else, but the AI SDK's client persists — and
// resends on every later turn — three more shapes this app produces: `input-available` (a
// card the volunteer never answered), `output-error` (a call the SDK itself refused because
// its input was off the tool's schema, a name that is not a tool at all, or `view_photos`'s
// own `execute` throwing — the part then carries `errorText` and `rawInput`, and its `type`
// is `tool-<whatever the model said>`), and `dynamic-tool` (the same refusal when the
// provider sent no `tool-input-start` first). One such part made every later request a
// `400` in a few milliseconds. `tests/contract/helper-protocol.history.test.ts` now builds
// each of these with the SDK's own client over the real route, so nothing here is guessed.

// T040 review round 2, R1 (High): Gemini 3 (the configured drafting model, ADR-003) attaches
// a `thoughtSignature` to every function call and, when it carries one, to the text around
// it — `@ai-sdk/google` puts it under `providerMetadata: { google: { thoughtSignature } }`,
// the AI SDK's `toUIMessageStream` forwards it, and the client's `processUIMessageStream`
// stores it as `callProviderMetadata` on the tool part and `providerMetadata` on the text
// part, then resends the whole message on the next turn. `z.strictObject` rejected these as
// unknown keys, so under `MODEL=vertex` the second request of *every* multi-step turn was
// `400 invalid` — the same failure class as `step-start`/`state: "done"` below, except the
// fake model (used by every automated test) never sets `providerMetadata`, so nothing here
// caught it before a real run did. Fixed by naming the SDK's own optional metadata fields
// explicitly, rather than closing over them — `role`, each part's `type`, the tool-name
// enum, `state` and the `view_photos` output check (the actual security value: no
// client-invented role, part shape or tool name reaches `createHelperStream`) stay closed.
// A minimal, recursive mirror of the AI SDK's own `JSONValue` / `SharedV3ProviderMetadata`
// shape — just enough structure for `body.messages` to type-check as a real `UIMessage[]`
// with no cast. The provider's own metadata (a `thoughtSignature`, here) is never read or
// acted on by this file, only carried through unchanged to the model on the next turn.
const JsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
const ProviderMetadataSchema: z.ZodType<SharedV3ProviderMetadata> = z.record(
  z.string(),
  z.record(z.string(), JsonValueSchema),
);

// `state` is the AI SDK's own streaming-progress marker on a text part (`'streaming' |
// 'done'`, `TextUIPart` in `ai`'s types) — the client always sends `"done"` on a persisted
// message once the stream has finished, so this must be accepted, not just `type`/`text`
// (found re-running the phone-mode e2e journey after M1(b) — a real multi-step turn's
// closing text part was rejected with the two fields alone).
const TextPartSchema = z.strictObject({
  type: z.literal("text"),
  text: z.string(),
  state: z.enum(["streaming", "done"]).optional(),
  providerMetadata: ProviderMetadataSchema.optional(),
});

/** A model's reasoning, shown or not (`ReasoningUIPart`): if the Vertex adapter ever turns on
 * `includeThoughts`, the AI SDK's `sendReasoning` defaults to `true` and one of these rides
 * along in the history exactly like a text part does (R1). Never read for anything today —
 * accepted so a client that has one does not fail the whole request over it. */
const ReasoningPartSchema = z.strictObject({
  type: z.literal("reasoning"),
  id: z.string().optional(),
  text: z.string(),
  state: z.enum(["streaming", "done"]).optional(),
  providerMetadata: ProviderMetadataSchema.optional(),
});

/** `tool-<name>` for exactly the twelve names `createHelperTools` produces — nothing else.
 * Cast to a literal, non-empty tuple (not `[string, ...string[]]`, which would widen every
 * value to plain `string` and make the schema's own `type` field too broad to satisfy the
 * AI SDK's `` `tool-${string}` `` — the literal union is what lets `body.messages` below be
 * a real `UIMessage[]` subtype with no cast). */
type HelperToolType = `tool-${(typeof HELPER_TOOL_NAMES)[number]}`;
const HELPER_TOOL_TYPES = HELPER_TOOL_NAMES.map((name) => `tool-${name}` as const) as [
  HelperToolType,
  ...HelperToolType[],
];

/** The AI SDK's `errorText` is always one short sentence (its default `onError` says "An
 * error occurred."); the bound only stops a crafted history shipping a megabyte to the model
 * as an `error-text` result per turn (F35 review, finding 4). */
const ERROR_TEXT_MAX = 2_000;

/** The fields the AI SDK's client sets on every tool part whatever its state (R1, F35):
 * `title` and `toolMetadata` come from the tool's definition, `providerExecuted` says who
 * ran it, `callProviderMetadata` carries the call's own per-provider metadata (Gemini 3's
 * `thoughtSignature`). */
const TOOL_PART_FIELDS = {
  toolCallId: z.string(),
  title: z.string().optional(),
  toolMetadata: z.record(z.string(), JsonValueSchema).optional(),
  providerExecuted: z.boolean().optional(),
  callProviderMetadata: ProviderMetadataSchema.optional(),
} as const;

/** One of the twelve tools' own result, already resolved by the browser (or, for
 * `view_photos`/`load_skill`, by the server). `output`/`input` stay `z.unknown()` for every
 * tool but `view_photos` — the eleven others' shapes are each validated by `applyOperation`
 * or answered as plain strings, never converted back into an image part, so a malformed one
 * is inert; `view_photos`'s is the one whose shape this file must trust before
 * `createHelperStream` reads it (M1(a) below). `resultProviderMetadata` is the result's own
 * per-provider metadata; `preliminary` marks a partial result for a tool that streams its own
 * output (none of ours do today, but the field costs nothing to accept). */
const AnsweredToolPartSchema = z
  .strictObject({
    type: z.enum(HELPER_TOOL_TYPES),
    ...TOOL_PART_FIELDS,
    state: z.literal("output-available"),
    input: z.unknown(),
    output: z.unknown(),
    preliminary: z.boolean().optional(),
    resultProviderMetadata: ProviderMetadataSchema.optional(),
  })
  .refine(
    (part) =>
      part.type !== "tool-view_photos" || ViewPhotosOutputSchema.safeParse(part.output).success,
    { message: "That view_photos result isn't shaped right.", path: ["output"] },
  );

/** One of the twelve tools called but not yet answered (F35): `input-available` is a card
 * the volunteer never clicked Apply or Not this on before sending the next message —
 * `use-helper.ts` answers it `declined` before it sends, and `createHelperStream`'s
 * `settleUnansweredCalls` does the same server-side should the two ever race;
 * `input-streaming` is a call the stream was cut off in the middle of (its `input` may be
 * partial or missing), which `settleUnansweredCalls` drops. Neither ever reaches the model
 * as an open call, and neither is ever executed. */
const UnansweredToolPartSchema = z.union([
  z.strictObject({
    type: z.enum(HELPER_TOOL_TYPES),
    ...TOOL_PART_FIELDS,
    state: z.literal("input-available"),
    input: z.unknown(),
  }),
  z.strictObject({
    type: z.enum(HELPER_TOOL_TYPES),
    ...TOOL_PART_FIELDS,
    state: z.literal("input-streaming"),
    input: z.unknown().optional(),
  }),
]);

/** A tool call that ended in an error (F35): the AI SDK refused the model's input (off the
 * tool's schema — `input` is then absent and `rawInput` holds what the model sent), the
 * model named a tool that does not exist (so `type` is `tool-<whatever it said>`, which is
 * why this is the one tool shape whose name is *not* one of the twelve), or a
 * server-executed tool's `execute` threw. Nothing in this state is ever executed or read
 * as a result — `convertToModelMessages` turns it into an `error-text` tool result and
 * nothing more — so an invented name here is inert, unlike one in `output-available`. The
 * closing `transform` only restates `input` as a present key (`undefined` when absent): the
 * AI SDK types an errored part's `input` as required-but-maybe-undefined, JSON drops an
 * `undefined` on the wire, and this is how the parsed value stays a real `UIMessage` with
 * no cast. */
const ErroredToolPartSchema = z
  .strictObject({
    type: z.templateLiteral(["tool-", z.string()]),
    ...TOOL_PART_FIELDS,
    state: z.literal("output-error"),
    input: z.unknown().optional(),
    rawInput: z.unknown().optional(),
    errorText: z.string().max(ERROR_TEXT_MAX),
    resultProviderMetadata: ProviderMetadataSchema.optional(),
  })
  .transform((part) => ({ ...part, input: part.input }));

/** The same refusal when the provider sent the call without a `tool-input-start` first
 * (every scripted fake in `src/adapters/fake/scenarios` does; Gemini does not): the SDK's
 * client then has no static part to update and pushes a `dynamic-tool` one. Accepted in
 * `output-error` only — this app never produces one in any other state, and a
 * `dynamic-tool` with an *output* would be a tool result the twelve-name rule never saw. */
const DynamicToolPartSchema = z
  .strictObject({
    type: z.literal("dynamic-tool"),
    toolName: z.string(),
    ...TOOL_PART_FIELDS,
    state: z.literal("output-error"),
    input: z.unknown().optional(),
    rawInput: z.unknown().optional(),
    errorText: z.string().max(ERROR_TEXT_MAX),
    preliminary: z.boolean().optional(),
    resultProviderMetadata: ProviderMetadataSchema.optional(),
  })
  .transform((part) => ({ ...part, input: part.input }));

/** A grounding source (`SourceUrlUIPart`/`SourceDocumentUIPart`): only a provider with
 * search grounding turned on emits one (ours does not), and `convertToModelMessages` drops
 * both on the way back to the model, so they are accepted as inert rather than failing a
 * whole request. A `file` part is *not* accepted on either role: an assistant `file` part
 * would be forwarded to the model as a file, and the model sees media only through
 * `view_photos` (FR-037, FR-082). */
const SourceUrlPartSchema = z.strictObject({
  type: z.literal("source-url"),
  sourceId: z.string(),
  url: z.string(),
  title: z.string().optional(),
  providerMetadata: ProviderMetadataSchema.optional(),
});
const SourceDocumentPartSchema = z.strictObject({
  type: z.literal("source-document"),
  sourceId: z.string(),
  mediaType: z.string(),
  title: z.string(),
  filename: z.string().optional(),
  providerMetadata: ProviderMetadataSchema.optional(),
});

/** A custom `data-*` part (`DataUIPart`): only a server that writes one into the stream
 * produces it (ours never does), and without a `convertDataPart` option
 * `convertToModelMessages` drops it — accepted as inert, same as a source. */
const DataPartSchema = z.strictObject({
  type: z.templateLiteral(["data-", z.string()]),
  id: z.string().optional(),
  data: z.unknown(),
});

/** The AI SDK's own step-boundary marker, pushed into an assistant message's `parts` every
 * time a multi-step tool loop moves to its next step (`ai/dist/index.js`'s
 * `state.message.parts.push({ type: "step-start" })`) — carries no content of its own, but
 * a real multi-step turn (e.g. `list_media` then `add_block` then closing text, each its own
 * request since both are browser-answered) persists one of these between every pair of
 * steps, and resends it with the rest of the message on every later turn. Missing this from
 * the closed schema below made every multi-step assistant turn a `400` on its very next
 * request — caught by this task's own e2e re-run, not a unit test (T040 review round 1
 * follow-up, found while verifying M2).
 */
const StepStartPartSchema = z.strictObject({ type: z.literal("step-start") });

const UserMessageSchema = z.strictObject({
  id: z.string(),
  role: z.literal("user"),
  metadata: z.unknown().optional(),
  parts: z.array(TextPartSchema).min(1),
});

const AssistantMessageSchema = z.strictObject({
  id: z.string(),
  role: z.literal("assistant"),
  metadata: z.unknown().optional(),
  parts: z
    .array(
      z.union([
        TextPartSchema,
        ReasoningPartSchema,
        AnsweredToolPartSchema,
        UnansweredToolPartSchema,
        ErroredToolPartSchema,
        DynamicToolPartSchema,
        StepStartPartSchema,
        SourceUrlPartSchema,
        SourceDocumentPartSchema,
        DataPartSchema,
      ]),
    )
    .min(1),
});

/** One message of the history, as the browser persists it — exported for
 * `tests/unit/app/chat-schema.test.ts` to check each part shape on its own. */
export const UIMessageSchema = z.union([UserMessageSchema, AssistantMessageSchema]);

/** `{ profileId, surface, messages }` (contracts/helper-protocol.md → Endpoint). Capped at
 * 200 messages (M1(b)): the honest case where every photo ever viewed rides along in the
 * history already has a real cost cliff (Next's own request-body buffer) well before 200
 * turns, so this is a defensive ceiling, not the fix for that — `redactViewedPhotos` in
 * `helper-stream.ts` is. */
const ChatRequestSchema = z.strictObject({
  profileId: ProfileIdSchema,
  surface: z.enum(["full", "phone"]),
  messages: z.array(UIMessageSchema).max(200),
});

/** The three outcomes an edit tool's result ever carries (helper-protocol.md → "Results"). */
const TOOL_RESULT_STATUSES = new Set(["applied", "declined", "rejected"]);

/** One tool-result finding for the debug log: never anything else from the part. */
interface ToolResultLogEntry {
  toolName: string;
  status: "applied" | "declined" | "rejected";
}

/**
 * Scans the incoming `messages` for tool parts the browser has already answered
 * (`state: "output-available"`, per the AI SDK's `ToolUIPart`) and pulls out only
 * `{ toolName, status }` for the ones whose output carries one of the three edit-tool
 * statuses (T037 run finding 5: the per-step log named tool calls but never what the
 * browser answered). The four read tools and `view_photos`/`load_skill` answer with plain
 * strings or `{ photos, refused }` / a skill body — never a `status` field — so they never
 * match here; the `summary`/`reason` text beside a status is never read at all, let alone
 * logged.
 */
function toolResultStatuses(
  messages: readonly { parts: readonly { type: string }[] }[],
): ToolResultLogEntry[] {
  const found: ToolResultLogEntry[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (!part.type.startsWith("tool-")) continue;
      const candidate = part as { type: string; state?: unknown; output?: unknown };
      if (candidate.state !== "output-available") continue;
      const output = candidate.output;
      if (typeof output !== "object" || output === null) continue;
      const status = (output as { status?: unknown }).status;
      if (typeof status !== "string" || !TOOL_RESULT_STATUSES.has(status)) continue;
      found.push({
        toolName: part.type.slice("tool-".length),
        status: status as ToolResultLogEntry["status"],
      });
    }
  }
  return found;
}

/** The request body as `unknown`; a body that is not JSON is `invalid`, not a crash. */
async function jsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    throw new ProfileInvalidError("The request body isn't JSON.", [], { cause: error });
  }
}

/** `readPhoto` over the profile's own media records and its "clean" derivative (ADR-005). */
function makeReadPhoto(deps: ChatDeps, pid: string, assets: readonly MediaAsset[]): ReadPhoto {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return async (id) => {
    const asset = byId.get(id);
    if (asset === undefined || asset.kind !== "photo") return null;
    const rev = asset.revisions.clean;
    if (rev === undefined) return null;
    const bytes = await deps.mediaStore.readDerived(pid, id, "clean", rev);
    if (bytes === null) return null;
    return { bytes, mediaType: "image/jpeg" };
  };
}

/**
 * Streams the helper's answer for one chat turn. Errors take the one shape: `401` without
 * a session, `400` for a malformed body or a message the AI SDK cannot convert, and
 * whatever `readAssets`' own store raises (mapped to `upstream` by the adapter) for a
 * media-store failure. Nothing here inspects the document itself (FR-082) — only the
 * media records, to serve `view_photos` and to build the system prompt's skill catalogue.
 */
export async function chat(deps: ChatDeps, request: NextRequest): Promise<Response> {
  try {
    await requireSession(request, deps.readSession);
    const body = parseOrThrow(ChatRequestSchema, await jsonBody(request));
    const assets = await readAssets(deps, body.profileId);
    const system = systemPrompt({ surface: body.surface, skills: loadSkillCatalogue() });
    deps.logger.debug(
      { profileId: body.profileId, surface: body.surface, system },
      "helper request",
    );
    deps.logger.debug({ toolResults: toolResultStatuses(body.messages) }, "helper tool results");
    const result = await createHelperStream({
      model: resolveLanguageModel(deps, request),
      system,
      // Validated above against a closed schema (M1(b)) — a real `UIMessage[]` subtype, no
      // cast needed.
      messages: body.messages,
      assets,
      readPhoto: makeReadPhoto(deps, body.profileId, assets),
      loadSkill: async (name) => getSkill(name),
      logger: deps.logger,
      profileId: body.profileId,
      surface: body.surface,
    });
    // The stream the browser reads (F42): no photo bytes, and refused tool calls named.
    return createUIMessageStreamResponse({ stream: helperUIMessageStream(result) });
  } catch (error) {
    if (error instanceof MessageConversionError) {
      return respond(new ProfileInvalidError("That message isn't shaped right."), deps.logger);
    }
    return respond(error, deps.logger);
  }
}
