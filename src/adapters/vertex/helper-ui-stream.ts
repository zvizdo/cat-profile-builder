import "server-only";
import type { UIMessageChunk } from "ai";
import { ViewPhotosOutputSchema, type ViewPhotosShown } from "@/core/helper/tools";
import { toolErrorText } from "./tool-errors";

// The UI message stream the browser reads, made from `streamText`'s own (F42): the one
// `POST /api/helper/chat` writes into `createUIMessageStreamResponse`, and the one the
// component tests' fake route writes too, so nothing about the wire shape is guessed. Two
// rewrites happen here and nowhere else:
//
// 1. A `view_photos` result loses its photo bytes on the way to the browser
//    (build-stall-investigation.md side finding 1). The SDK forwards a server-executed
//    tool's `output` verbatim in `tool-output-available`, so the browser was storing
//    ~300 KB of base64 per request and resending it on every later turn — for the server
//    to strip again in `redactViewedPhotos`. The model is unaffected: the live call's next
//    step converts the *in-memory* result, images and all. The browser gets
//    `{ shown: [ids], refused }` (`ViewPhotosShown`, tools.ts) — what it needs to tell the
//    server, next turn, which photos were shown earlier.
// 2. The `errorText` of a refused tool call names the tool and the failing fields
//    (`toolErrorText`) instead of the SDK's "An error occurred." (side finding 2) — the
//    text the model reads back as the call's error result on the next request. The SDK
//    calls `onError` twice for one invalid call: first with the error object (the
//    `tool-input-error` chunk), then with its message as a plain string (the
//    `tool-output-error` chunk that follows, which is what the browser persists). The
//    string is matched back to the text the object produced, so the two chunks agree.

/** What `helperUIMessageStream` needs of `streamText`'s result — structural, so the
 * function has no compile-time tie to the helper's own tool set. */
export interface UIStreamSource {
  toUIMessageStream(options: {
    onError: (error: unknown) => string;
  }): ReadableStream<UIMessageChunk>;
}

/** `onError` for `toUIMessageStream`, remembering what each error object mapped to so the
 * string form of the same error (the SDK's second call) gets the same text. */
function makeOnError(): (error: unknown) => string {
  const byMessage = new Map<string, string>();
  return (error) => {
    if (typeof error === "string") return byMessage.get(error) ?? toolErrorText(error);
    const text = toolErrorText(error);
    if (error instanceof Error) byMessage.set(error.message, text);
    return text;
  };
}

/** `{ shown, refused }` for a live `view_photos` output, or the output untouched when it
 * is not the shape `execute` produces (never, but a rewrite must not throw mid-stream). */
function withoutPhotoBytes(output: unknown): unknown {
  const parsed = ViewPhotosOutputSchema.safeParse(output);
  if (!parsed.success || !("photos" in parsed.data)) return output;
  const shown: ViewPhotosShown = {
    shown: parsed.data.photos.map((photo) => photo.id),
    refused: parsed.data.refused,
  };
  return shown;
}

/** A transform that rewrites every `view_photos` `tool-output-available` chunk. The tool
 * name travels only on the call's opening chunk, so the ids are remembered per stream. */
function stripViewedPhotoBytes(): TransformStream<UIMessageChunk, UIMessageChunk> {
  const viewCalls = new Set<string>();
  return new TransformStream({
    transform(chunk, controller) {
      if (chunk.type === "tool-input-start" || chunk.type === "tool-input-available") {
        if (chunk.toolName === "view_photos") viewCalls.add(chunk.toolCallId);
      }
      if (chunk.type === "tool-output-available" && viewCalls.has(chunk.toolCallId)) {
        controller.enqueue({ ...chunk, output: withoutPhotoBytes(chunk.output) });
        return;
      }
      controller.enqueue(chunk);
    },
  });
}

/** The UI message stream the browser receives for one helper turn (see the file comment). */
export function helperUIMessageStream(result: UIStreamSource): ReadableStream<UIMessageChunk> {
  return result.toUIMessageStream({ onError: makeOnError() }).pipeThrough(stripViewedPhotoBytes());
}
