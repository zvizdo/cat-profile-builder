import type { JSONValue, ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  BIO_DONE,
  BIO_QUESTION,
  bioInterview,
  INTERVIEW_BIO,
} from "@/adapters/fake/scenarios/bio-interview";
import {
  isAssistant,
  lastText,
  lastToolNames,
  OUTLINE_WITH_BIO,
  resolveBrowserTools,
  step,
  toolCallsOf,
  userText,
} from "./scenarios.helpers";

// F65: a standalone "Write a bio" looks at the page and the photos, asks a question that
// points at what it saw, and only then writes — the flow `write-bio`'s new section scripts.
const OUTLINE_NO_BIO = "Name: Charlotte\n\nSections:\n1. blockaaaaaaa hero — none.\n";
const MEDIA_TWO_PHOTOS =
  'photoaaa photo 1600x1200 — "On the sill" (used by blockaaaaaaa)\n' +
  'photobbb photo 1600x1200 — "With the dog" (not used)\n';

function browserAnswers(outline: string, media: string) {
  return (toolName: string): JSONValue => {
    if (toolName === "read_outline") return outline;
    if (toolName === "list_media") return media;
    return { status: "applied", summary: "ok" };
  };
}

function toolInputs(messages: ModelMessage[], toolName: string): unknown[] {
  return messages
    .filter(isAssistant)
    .flatMap(toolCallsOf)
    .filter((call) => call.toolName === toolName)
    .map((call) => call.input);
}

describe("bioInterview", () => {
  it("loads write-bio, reads the outline and media, views the photos, then asks one question", async () => {
    const model = bioInterview();
    const answer = browserAnswers(OUTLINE_NO_BIO, MEDIA_TWO_PHOTOS);
    let messages: ModelMessage[] = [userText("Write a bio")];
    messages = await step(model, messages); // load_skill auto-executes, then read_outline
    expect(toolInputs(messages, "load_skill")).toEqual([{ name: "write-bio" }]);
    expect(lastToolNames(messages)).toEqual(["read_outline"]);

    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    expect(lastToolNames(messages)).toEqual(["list_media"]);

    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages); // view_photos auto-executes, then the question
    expect(toolInputs(messages, "view_photos")).toEqual([{ ids: ["photoaaa", "photobbb"] }]);
    expect(lastText(messages)).toBe(BIO_QUESTION);
    expect(lastToolNames(messages)).toEqual([]);
  });

  it("after the answer, adds a bio section when the page has none, re-reads, and says it's done", async () => {
    const model = bioInterview();
    const answer = browserAnswers(OUTLINE_NO_BIO, MEDIA_TWO_PHOTOS);
    let messages: ModelMessage[] = [userText("Write a bio")];
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);

    messages = [...messages, userText("Yes, the sill is hers. She chirps at pigeons.")];
    messages = await step(model, messages);
    expect(lastToolNames(messages)).toEqual(["add_block"]);
    expect(toolInputs(messages, "add_block")).toEqual([
      { op: "add_block", block: { type: "bio", content: INTERVIEW_BIO } },
    ]);

    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    expect(lastToolNames(messages)).toEqual(["read_outline"]);

    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    expect(lastText(messages)).toBe(BIO_DONE);
  });

  it("sets the existing bio's content when the page already has a bio block", async () => {
    const model = bioInterview();
    const answer = browserAnswers(OUTLINE_WITH_BIO, MEDIA_TWO_PHOTOS);
    let messages: ModelMessage[] = [userText("Write a bio")];
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);

    messages = [...messages, userText("She chirps at pigeons.")];
    messages = await step(model, messages);
    expect(toolInputs(messages, "set_field")).toEqual([
      {
        op: "set_field",
        target: { kind: "block", blockId: "blockaaaaaab" },
        path: "content",
        value: INTERVIEW_BIO,
      },
    ]);
  });

  it("skips view_photos when the cat has no photos, and still asks", async () => {
    const model = bioInterview();
    const answer = browserAnswers(OUTLINE_NO_BIO, "No photos or clips yet.");
    let messages: ModelMessage[] = [userText("Write a bio")];
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    messages = resolveBrowserTools(messages, answer);
    messages = await step(model, messages);
    expect(toolInputs(messages, "view_photos")).toEqual([]);
    expect(lastText(messages)).toBe(BIO_QUESTION);
  });
});
