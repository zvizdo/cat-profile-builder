import { describe, expect, it } from "vitest";
import { generateText, streamText } from "ai";
import { scenario, SCENARIO_NAMES } from "@/adapters/fake/language-model";
import { NOOP_TEXT } from "@/adapters/fake/scenarios/noop";
import { InternalError } from "@/core/errors";

describe("scenario", () => {
  it("lists the scenarios it knows", () => {
    expect([...SCENARIO_NAMES].sort()).toEqual(
      [
        "noop",
        "build-profile-happy",
        "build-proposal",
        "abort-mid-turn",
        "truncated",
        "edit-proposals",
        "bad-operation",
        "publish-request",
        "injection",
        "phone-edits",
        "markdown-reply",
        "card-then-apply",
        "text-proposals",
        "image-proposals",
        "bio-interview",
      ].sort(),
    );
  });

  it("noop answers one short sentence and finishes, both generated and streamed", async () => {
    const model = scenario("noop");
    expect(model.specificationVersion).toBe("v3");

    const generated = await generateText({ model, prompt: "Draft a profile." });
    expect(generated.text).toBe(NOOP_TEXT);
    expect(generated.finishReason).toBe("stop");

    const streamed = streamText({ model: scenario("noop"), prompt: "Draft a profile." });
    const parts: string[] = [];
    for await (const delta of streamed.textStream) parts.push(delta);
    expect(parts.join("")).toBe(NOOP_TEXT);
    expect(await streamed.finishReason).toBe("stop");
  });

  it("gives a fresh model per call so a stream is never replayed", async () => {
    const model = scenario("noop");
    const first = streamText({ model, prompt: "one" });
    expect(await first.text).toBe(NOOP_TEXT);
    const second = streamText({ model, prompt: "two" });
    expect(await second.text).toBe(NOOP_TEXT);
    expect(scenario("noop")).not.toBe(model);
  });

  it.each(["", "missing", "constructor", "__proto__"])(
    "refuses an unknown scenario name at boot: %j",
    (name) => {
      expect(() => scenario(name)).toThrow(InternalError);
      expect(() => scenario(name)).toThrow(/noop/);
    },
  );
});
