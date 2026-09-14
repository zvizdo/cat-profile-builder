import { asSchema } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createHelperTools, HELPER_TOOL_NAMES } from "@/core/helper/tools";
import {
  AddBlockOperationSchema,
  RemoveBlockOperationSchema,
  ReorderBlocksOperationSchema,
  ReplaceImageOperationSchema,
  SetFieldOperationSchema,
  SetThemeOperationSchema,
} from "@/core/profile/operations";

// The tool set the model is given (helper-protocol.md → Tools, FR-093): exactly twelve
// names, the six edit tools and four text reads with no server `execute`, and `view_photos`
// / `load_skill` as the two the factory wires up itself.

function tools() {
  return createHelperTools({
    viewPhotos: vi.fn(async (ids: string[]) => ({
      photos: ids.map((id) => ({ id, mediaType: "image/webp", data: `${id}-bytes` })),
      refused: [],
    })),
    loadSkill: vi.fn(async (name: string) => ({ name, description: "d", body: "b" })),
  });
}

describe("createHelperTools", () => {
  it("returns exactly the twelve named tools, nothing more", () => {
    const helperTools = tools();
    expect(Object.keys(helperTools).sort()).toEqual([...HELPER_TOOL_NAMES].sort());
  });

  it("gives the six edit tools no execute — the browser applies them", () => {
    const helperTools = tools();
    for (const name of [
      "set_field",
      "add_block",
      "remove_block",
      "reorder_blocks",
      "set_theme",
      "replace_image",
    ] as const) {
      expect(helperTools[name].execute).toBeUndefined();
    }
  });

  it("gives the four text reads no execute — the browser answers them at once", () => {
    const helperTools = tools();
    for (const name of ["read_outline", "read_page", "read_blocks", "list_media"] as const) {
      expect(helperTools[name].execute).toBeUndefined();
    }
  });

  it("view_photos and load_skill are the only two tools with a server execute", () => {
    const helperTools = tools();
    expect(helperTools.view_photos.execute).toBeInstanceOf(Function);
    expect(helperTools.load_skill.execute).toBeInstanceOf(Function);
  });

  it("view_photos.execute calls the injected viewPhotos with the requested ids", async () => {
    const viewPhotos = vi.fn(async (ids: string[]) => ({
      photos: ids.map((id) => ({ id, mediaType: "image/webp", data: "abc" })),
      refused: [],
    }));
    const helperTools = createHelperTools({ viewPhotos, loadSkill: vi.fn() });
    const execute = helperTools.view_photos.execute;
    if (!execute) throw new Error("view_photos has no execute");
    const options = { toolCallId: "t1", messages: [] };
    await execute({ ids: ["media2aa"] }, options);
    expect(viewPhotos).toHaveBeenCalledWith(["media2aa"]);
  });

  it("view_photos.toModelOutput turns photos into image parts and refusals into text parts", () => {
    const helperTools = tools();
    const toModelOutput = helperTools.view_photos.toModelOutput;
    if (!toModelOutput) throw new Error("view_photos has no toModelOutput");
    const result = toModelOutput({
      toolCallId: "t1",
      input: { ids: ["media2aa", "video2aa"] },
      output: {
        photos: [{ id: "media2aa", mediaType: "image/webp", data: "abc123" }],
        refused: [
          { id: "video2aa", error: "That is a video; the helper can only look at photos." },
        ],
      },
    });
    expect(result).toEqual({
      type: "content",
      value: [
        { type: "image-data", data: "abc123", mediaType: "image/webp" },
        {
          type: "text",
          text: "video2aa: That is a video; the helper can only look at photos.",
        },
      ],
    });
  });

  it("load_skill.execute calls the injected loadSkill with the requested name", async () => {
    const loadSkill = vi.fn(async (name: string) => ({ name, description: "d", body: "b" }));
    const helperTools = createHelperTools({ viewPhotos: vi.fn(), loadSkill });
    const execute = helperTools.load_skill.execute;
    if (!execute) throw new Error("load_skill has no execute");
    const options = { toolCallId: "t1", messages: [] };
    const result = await execute({ name: "write-bio" }, options);
    expect(loadSkill).toHaveBeenCalledWith("write-bio");
    expect(result).toEqual({ name: "write-bio", description: "d", body: "b" });
  });

  it("load_skill.execute passes through an unknown-skill error", async () => {
    const loadSkill = vi.fn(async () => ({ error: 'There is no skill named "nope".' }));
    const helperTools = createHelperTools({ viewPhotos: vi.fn(), loadSkill });
    const execute = helperTools.load_skill.execute;
    if (!execute) throw new Error("load_skill has no execute");
    const options = { toolCallId: "t1", messages: [] };
    const result = await execute({ name: "nope" }, options);
    expect(result).toEqual({ error: 'There is no skill named "nope".' });
  });

  // F52: the six edit tools validate with `EditOperationSchema`'s own members — the same
  // grammar `applyOperation` accepts — but the JSON schema the model is shown is that
  // member's rendering with every `oneOf` rewritten to `anyOf`. Gemini ignores `oneOf`
  // (a probe on 2026-09-13 with a two-variant `add_block` got `photo_id` and `photo_ids`
  // back — the model never saw the variants; with `anyOf` it named every field right),
  // and Zod renders a discriminated union as `oneOf`.
  describe("the edit tools' input schemas (F52)", () => {
    const EDIT_SCHEMAS = {
      set_field: SetFieldOperationSchema,
      add_block: AddBlockOperationSchema,
      remove_block: RemoveBlockOperationSchema,
      reorder_blocks: ReorderBlocksOperationSchema,
      set_theme: SetThemeOperationSchema,
      replace_image: ReplaceImageOperationSchema,
    } as const;

    it("shows the model no oneOf anywhere — every union is anyOf", async () => {
      const helperTools = tools();
      for (const name of Object.keys(EDIT_SCHEMAS) as (keyof typeof EDIT_SCHEMAS)[]) {
        const json = JSON.stringify(
          await asSchema<unknown>(helperTools[name].inputSchema as never).jsonSchema,
        );
        expect(json, name).not.toContain('"oneOf"');
      }
    });

    it("renders add_block's block as anyOf of the eight variants, each described, with the gallery's saying it has no caption", async () => {
      const json = (await asSchema(tools().add_block.inputSchema).jsonSchema) as {
        properties: { block: { anyOf: { description?: string; properties: { type: unknown } }[] } };
      };
      const variants = json.properties.block.anyOf;
      expect(variants).toHaveLength(8);
      for (const variant of variants) {
        expect(variant.description).toEqual(expect.any(String));
        expect(variant.properties.type).toBeDefined();
      }
      const gallery = variants.find((v) => JSON.stringify(v.properties.type).includes("gallery"));
      expect(gallery?.description).toContain("no caption");
    });

    it("validates each edit tool's input with its EditOperationSchema member: same accept, same refuse, same issue paths", async () => {
      const helperTools = tools();
      const bio = { op: "add_block", block: { type: "bio", content: { paragraphs: [] } } };
      const kind = { op: "add_block", block: { kind: "bio", content: { paragraphs: [] } } };
      const validate = asSchema(helperTools.add_block.inputSchema).validate;
      if (!validate) throw new Error("add_block has no validate");
      const accepted = await validate(bio);
      expect(accepted).toEqual({ success: true, value: AddBlockOperationSchema.parse(bio) });
      const refused = await validate(kind);
      expect(refused.success).toBe(false);
      if (refused.success) return;
      const issues = (refused.error as unknown as { issues: { path: PropertyKey[] }[] }).issues;
      expect(issues.map((issue) => issue.path.join("."))).toEqual(["block.type"]);
      for (const name of Object.keys(EDIT_SCHEMAS) as (keyof typeof EDIT_SCHEMAS)[]) {
        const check = asSchema<unknown>(helperTools[name].inputSchema as never).validate;
        if (!check) throw new Error(`${name} has no validate`);
        const result = await check({ op: "no_such_op" });
        expect(result.success, name).toBe(
          EDIT_SCHEMAS[name].safeParse({ op: "no_such_op" }).success,
        );
      }
    });

    it("add_block's description names the shape: block is the whole section, type plus its fields", () => {
      const description = tools().add_block.description ?? "";
      expect(description).toContain("`block`");
      expect(description).toContain("`type`");
      expect(description).toContain("`mediaId`");
      expect(description).toContain("no caption");
      expect(description.toLowerCase()).toContain("never a hero");
    });
  });
});
