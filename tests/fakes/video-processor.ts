import { UpstreamError } from "@/core/errors";
import type {
  ProbeResult,
  TranscodeOptions,
  TranscodeResult,
  VideoInput,
  VideoProcessor,
} from "@/core/ports";

// The scripted VideoProcessor (contracts/ports.md → Fake, ADR-012). Each method plays a
// queue of results; an `Error` in the queue is thrown in place of a result; once the queue
// is exhausted the last entry repeats; a method with no script rejects with an
// `UpstreamError` so a test that forgot to script a call fails loudly, not with `undefined`.

/** One scripted answer: a result, or an error to throw instead. */
type Scripted<T> = T | Error;

export interface VideoScript {
  probe?: Scripted<ProbeResult> | Array<Scripted<ProbeResult>>;
  transcode?: Scripted<TranscodeResult> | Array<Scripted<TranscodeResult>>;
}

export interface ScriptedVideoProcessor extends VideoProcessor {
  readonly probeCalls: VideoInput[];
  readonly transcodeCalls: Array<{ input: VideoInput; options: TranscodeOptions }>;
}

function queueOf<T>(script: Scripted<T> | Array<Scripted<T>> | undefined): Array<Scripted<T>> {
  if (script === undefined) return [];
  return Array.isArray(script) ? [...script] : [script];
}

/** Takes the next scripted answer, keeping the last one for every call after it. */
function play<T>(queue: Array<Scripted<T>>, method: string): T {
  const next = queue.length > 1 ? queue.shift() : queue[0];
  if (next === undefined) {
    throw new UpstreamError(`No scripted ${method} result.`);
  }
  if (next instanceof Error) throw next;
  return next;
}

export function createScriptedVideoProcessor(script: VideoScript): ScriptedVideoProcessor {
  const probes = queueOf(script.probe);
  const transcodes = queueOf(script.transcode);
  const probeCalls: VideoInput[] = [];
  const transcodeCalls: ScriptedVideoProcessor["transcodeCalls"] = [];

  return {
    probeCalls,
    transcodeCalls,
    async probe(input) {
      probeCalls.push(input);
      return play(probes, "probe");
    },
    async transcode(input, options) {
      transcodeCalls.push({ input, options });
      return play(transcodes, "transcode");
    },
  };
}
