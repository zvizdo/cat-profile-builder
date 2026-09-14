// The Describer port (contracts/ports.md, ADR-003/006): the model call that writes the
// first alt text for a photo or clip. Type-only. Adapters: Vertex (`MODEL_DESCRIBER`) and
// the runtime fake in `src/adapters/fake/describer.ts`; the scripted fake is in
// `tests/fakes/describer.ts`.

/**
 * The outcome of a description: the text, or why there is none. `failed` is a short
 * machine reason (`"model"`, `"timeout"`…) — never provider text — and makes the builder ask
 * the volunteer to write the description (FR-073).
 */
export type DescribeResult = { text: string } | { failed: string };

/**
 * Guarantees:
 * - `describePhoto` receives the clean photo's bytes, never the original.
 * - `describeVideo` receives the `gs://` URI of the finished `web.{rev}.mp4` — trimmed,
 *   silent, ≤ 15 s — and nothing else. The caller enforces it and every implementation
 *   refuses any other URI with a `RefusedError` (`isWebClipUri`), so an original can never
 *   reach a model (FR-079).
 * - A model failure is a `{ failed }` result, not an exception.
 */
export interface Describer {
  describePhoto(bytes: Uint8Array): Promise<DescribeResult>;
  describeVideo(gsUri: string): Promise<DescribeResult>;
}
