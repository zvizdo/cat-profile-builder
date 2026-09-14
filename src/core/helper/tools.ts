import { jsonSchema, tool, zodSchema, type JSONSchema7, type Schema } from "ai";
import { z } from "zod";
import {
  AddBlockOperationSchema,
  RemoveBlockOperationSchema,
  ReorderBlocksOperationSchema,
  ReplaceImageOperationSchema,
  SetFieldOperationSchema,
  SetThemeOperationSchema,
} from "../profile/operations";
import { type Skill } from "./skill-shape";

// The twelve tools the model is given (helper-protocol.md → Tools, FR-093 — the tool set is
// asserted to be exactly these twelve names, nothing more). The six edit tools validate with
// `EditOperationSchema`'s own members (through `modelInputSchema`), so the grammar the
// model can propose and the grammar `applyOperation` accepts can never drift apart; they and
// the four text reads have no `execute` — the browser answers all ten itself. `view_photos`
// and `load_skill` are the two server-executed tools, and this factory is where their
// `execute` is attached: it takes the two callbacks once, so nothing downstream (T035) wires
// a server function to a tool call again.
//
// This file never imports `skills.ts` (controller ruling, T032): it imports only the
// `Skill` type from `skill-shape.ts` (a types-only module with no filesystem access) for
// `loadSkill`'s return shape, so a caller can still pass `getSkill` straight through
// without this file depending on `skills.ts`'s implementation.

const EmptyInputSchema = z.strictObject({});
const ReadBlocksInputSchema = z.strictObject({ ids: z.array(z.string()).min(1).max(10) });
const ViewPhotosInputSchema = z.strictObject({ ids: z.array(z.string()).min(1).max(6) });
const LoadSkillInputSchema = z.strictObject({ name: z.string() });

/** One photo `view_photos` can show the model, downscaled and base64-encoded. */
export interface ViewPhotosPhoto {
  id: string;
  mediaType: string;
  data: string;
}

/** What `viewPhotos` answers with: the photos it can show, and why it refused the rest. */
export interface ViewPhotosResult {
  photos: ViewPhotosPhoto[];
  refused: { id: string; error: string }[];
}

/** What the browser is told `view_photos` did (F42): the ids it showed the model and the
 * refusals — never the bytes. `helper-stream.ts` rewrites the live result into this shape
 * on the UI stream, the browser stores and resends it, and the server reads it back as
 * "shown earlier" on the next turn. */
export interface ViewPhotosShown {
  shown: string[];
  refused: { id: string; error: string }[];
}

const RefusedSchema = z.array(z.strictObject({ id: z.string(), error: z.string() }));

/** The shape a stored `view_photos` output may take in the history — the one place both
 * `chat.ts` (validating it at the request boundary, T040 review round 1, L2) and
 * `helper-stream.ts` (parsing rather than casting it before reading it, T040 review round
 * 1, R2) check it, so the two can never drift apart. Two members (F42): the small
 * `{ shown, refused }` the browser has stored since F42, and the older full `{ photos,
 * refused }` a tab left open across the deploy still carries — accepted for one release. */
export const ViewPhotosOutputSchema = z.union([
  z.strictObject({ shown: z.array(z.string()), refused: RefusedSchema }),
  z.strictObject({
    photos: z.array(z.strictObject({ id: z.string(), mediaType: z.string(), data: z.string() })),
    refused: RefusedSchema,
  }),
]);

/** The result of loading one skill by name: the skill in full, or a plain-language error. */
export type LoadSkillResult = Skill | { error: string };

export interface CreateHelperToolsOptions {
  /** Serves `view_photos`: resolves ids to image bytes, enforcing ownership and the budget. */
  viewPhotos: (ids: string[]) => Promise<ViewPhotosResult>;
  /** Serves `load_skill`: looks a skill up by name. */
  loadSkill: (name: string) => Promise<LoadSkillResult>;
}

/** `schema` with every `oneOf` — at any depth — renamed `anyOf`. Pure; never edits its input. */
function withAnyOf(schema: JSONSchema7): JSONSchema7 {
  const visit = (node: JSONSchema7 | boolean): JSONSchema7 | boolean =>
    typeof node === "boolean" ? node : withAnyOf(node);
  const { oneOf, anyOf, allOf, properties, items, ...rest } = schema;
  const out: JSONSchema7 = { ...rest };
  const branches = [...(anyOf ?? []), ...(oneOf ?? [])].map(visit);
  if (branches.length > 0) out.anyOf = branches;
  if (allOf) out.allOf = allOf.map(visit);
  if (properties) {
    out.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, visit(value)]),
    );
  }
  if (items !== undefined) out.items = Array.isArray(items) ? items.map(visit) : visit(items);
  return out;
}

/**
 * The input schema an edit tool hands the AI SDK (F52): the operation schema itself does
 * the validating — Zod's own issues and paths, which `tool-errors.ts` turns into the text
 * the model retries on — while the JSON schema the model is *shown* is Zod's rendering with
 * every `oneOf` rewritten to `anyOf`. Zod renders a discriminated union
 * (`BlockInputSchema`) as `oneOf`, and Gemini silently ignores `oneOf`: a probe on
 * 2026-09-13 with a two-variant `add_block` got `photo_id` and `photo_ids` back — the
 * model had never seen the variants — while the same schema as `anyOf` got every field
 * named right. That blindness was the six refused `add_block`s per build in the T048 run.
 */
function modelInputSchema<T>(schema: z.ZodType<T>): Schema<T> {
  const rendered = zodSchema(schema);
  return jsonSchema<T>(() => Promise.resolve(rendered.jsonSchema).then(withAnyOf), {
    validate: rendered.validate,
  });
}

const ADD_BLOCK_DESCRIPTION =
  "Add a new section to the page, at an index or at the end. `block` is the whole " +
  "section: its `type` plus exactly that type's fields, nothing else — no `id`, no `kind`. " +
  "Media go in `mediaId` (photo, video, quote, each day scene) or `mediaIds` (gallery); " +
  "text goes in the type's own field (`content` for the bio, `caption` for a photo, `text` " +
  "for a quote, `scenes` for a day, `cards` for needs). A gallery has no caption. Never a " +
  "hero — the page already has one.";

/** The six edit tools: `EditOperationSchema`'s own members, and no `execute` (the browser applies them). */
function editTools() {
  return {
    set_field: tool({
      description: "Set one field of the profile itself or of one block.",
      inputSchema: modelInputSchema(SetFieldOperationSchema),
    }),
    add_block: tool({
      description: ADD_BLOCK_DESCRIPTION,
      inputSchema: modelInputSchema(AddBlockOperationSchema),
    }),
    remove_block: tool({
      description: "Remove one section from the page.",
      inputSchema: modelInputSchema(RemoveBlockOperationSchema),
    }),
    reorder_blocks: tool({
      description: "Put the page's sections in a new order.",
      inputSchema: modelInputSchema(ReorderBlocksOperationSchema),
    }),
    set_theme: tool({
      description: "Change the page's theme preset, warmth or contrast.",
      inputSchema: modelInputSchema(SetThemeOperationSchema),
    }),
    replace_image: tool({
      description: "Put a photo or clip into a section's media slot.",
      inputSchema: modelInputSchema(ReplaceImageOperationSchema),
    }),
  };
}

/** The four text reads: no `execute` either — the browser answers them at once. */
function readTools() {
  return {
    read_outline: tool({
      description:
        "Read the shape of the page: name, facts, tagline, theme, every section as a " +
        "one-line preview, and the current publish-readiness problems.",
      inputSchema: EmptyInputSchema,
    }),
    read_page: tool({
      description: "Read the whole page: every section's full text, captions, cards and quote.",
      inputSchema: EmptyInputSchema,
    }),
    read_blocks: tool({
      description: "Read one or a few sections in full, by id.",
      inputSchema: ReadBlocksInputSchema,
    }),
    list_media: tool({
      description:
        "List every photo and clip this cat has, on the page or not, and which sections use it.",
      inputSchema: EmptyInputSchema,
    }),
  };
}

/** `view_photos`: the one tool whose `toModelOutput` turns its result into image content parts. */
function viewPhotosTool(viewPhotos: CreateHelperToolsOptions["viewPhotos"]) {
  return tool({
    description: "See up to six photos at once, to describe or judge them.",
    inputSchema: ViewPhotosInputSchema,
    execute: async ({ ids }) => viewPhotos(ids),
    toModelOutput: ({ output }) => ({
      type: "content",
      value: [
        ...output.photos.map((photo) => ({
          type: "image-data" as const,
          data: photo.data,
          mediaType: photo.mediaType,
        })),
        ...output.refused.map((refusal) => ({
          type: "text" as const,
          text: `${refusal.id}: ${refusal.error}`,
        })),
      ],
    }),
  });
}

/** `load_skill`: the other server-executed tool. */
function loadSkillTool(loadSkill: CreateHelperToolsOptions["loadSkill"]) {
  return tool({
    description: "Load one of the helper's skills — a written procedure for a recurring job.",
    inputSchema: LoadSkillInputSchema,
    execute: async ({ name }) => loadSkill(name),
  });
}

/**
 * The exactly-twelve tools the AI SDK is given (helper-protocol.md, FR-093). `viewPhotos`
 * and `loadSkill` are the only two ways this factory reaches outside itself; every other
 * tool is answered by the browser from the in-memory document.
 */
export function createHelperTools({ viewPhotos, loadSkill }: CreateHelperToolsOptions) {
  return {
    ...editTools(),
    ...readTools(),
    view_photos: viewPhotosTool(viewPhotos),
    load_skill: loadSkillTool(loadSkill),
  };
}

/** The six edit tools — the only ones the browser applies or cards, and the only ones an
 * unanswered card can hold (helper-protocol.md → Tools, Results). The one list
 * `use-helper.ts` (what to card) and `helper-stream.ts` (what to decline when left
 * unanswered) both read, so the two can never disagree about a seventh (F35 review, 5). */
export const EDIT_TOOL_NAMES = [
  "set_field",
  "add_block",
  "remove_block",
  "reorder_blocks",
  "set_theme",
  "replace_image",
] as const;

/** The four reads the browser answers at once from the live document. */
export const READ_TOOL_NAMES = ["read_outline", "read_page", "read_blocks", "list_media"] as const;

/** The exact tool names `createHelperTools` produces (FR-093) — asserted against in tests. */
export const HELPER_TOOL_NAMES = [
  ...EDIT_TOOL_NAMES,
  ...READ_TOOL_NAMES,
  "view_photos",
  "load_skill",
] as const;
