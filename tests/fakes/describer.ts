import { InternalError, RefusedError } from "@/core/errors";
import { isWebClipUri } from "@/core/media/clip-uri";
import type { DescribeResult, Describer } from "@/core/ports";

// The scripted Describer (contracts/ports.md → Fake). Plays `results` in order across photo
// and video calls, then repeats the last one. Like every Describer it refuses a video URI
// that is not the finished web clip (FR-079) — the contract suite pins that.

export interface ScriptedDescriber extends Describer {
  readonly photoCalls: Uint8Array[];
  readonly videoCalls: string[];
}

export function createScriptedDescriber(results: DescribeResult[]): ScriptedDescriber {
  if (results.length === 0) {
    throw new InternalError("A scripted describer needs at least one result.");
  }
  const queue = [...results];
  const photoCalls: Uint8Array[] = [];
  const videoCalls: string[] = [];

  function next(): DescribeResult {
    const result = queue.length > 1 ? queue.shift() : queue[0];
    if (result === undefined) {
      throw new InternalError("The scripted describer ran out of results.");
    }
    return result;
  }

  return {
    photoCalls,
    videoCalls,
    async describePhoto(bytes) {
      photoCalls.push(bytes);
      return next();
    },
    async describeVideo(gsUri) {
      if (!isWebClipUri(gsUri)) {
        throw new RefusedError("Only the finished web clip can be described.");
      }
      videoCalls.push(gsUri);
      return next();
    },
  };
}
