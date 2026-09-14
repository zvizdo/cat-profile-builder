import { type MediaAsset } from "../media/schema";

// The pure rule engine behind `view_photos` (helper-protocol.md → Tools, FR-082): only
// photos this profile owns, at most six per call, at most twelve across one request. T035's
// stream wraps this with the actual `execute`; this file owns only the rule, so it can be
// tested without a model or a stream.

/** How many photos `view_photos` has already sent this request. */
export interface PhotoBudgetState {
  sent: number;
}

/** One id `view_photos` would not answer, and why, in a sentence the model can read. */
export interface PhotoBudgetRefusal {
  id: string;
  error: string;
}

export interface PhotoBudgetResult {
  /** The ids this call may show, in the order they were asked for. */
  allowed: string[];
  /** The ids this call refuses, each with its own reason. */
  refused: PhotoBudgetRefusal[];
  /** The state after this call — never the object passed in. */
  state: PhotoBudgetState;
}

const MAX_PER_CALL = 6;
const MAX_PER_REQUEST = 12;

const NOT_OWNED = "That photo is not on this cat's page.";
const IS_VIDEO = "That is a video; the helper can only look at photos.";
const OVER_CALL_LIMIT = "Only six photos per call.";
const OVER_REQUEST_LIMIT = "The helper has looked at twelve photos this turn; that is the limit.";

/**
 * Applies the `view_photos` rules to `ids` against `state.sent` and the profile's own
 * `assets`: an id must belong to this profile and be a photo, a call names at most six ids,
 * and a request shows at most twelve photos in total. Pure — `state` is never mutated, and
 * the result carries a new one. Ids past the six-per-call limit are refused by position, not
 * dropped silently, so the model can see exactly which ones did not make it.
 */
export function photoBudget(
  state: PhotoBudgetState,
  ids: readonly string[],
  assets: readonly MediaAsset[],
): PhotoBudgetResult {
  const allowed: string[] = [];
  const refused: PhotoBudgetRefusal[] = [];
  let sent = state.sent;

  ids.forEach((id, index) => {
    if (index >= MAX_PER_CALL) {
      refused.push({ id, error: OVER_CALL_LIMIT });
      return;
    }
    const asset = assets.find((candidate) => candidate.id === id);
    if (!asset) {
      refused.push({ id, error: NOT_OWNED });
      return;
    }
    if (asset.kind !== "photo") {
      refused.push({ id, error: IS_VIDEO });
      return;
    }
    if (sent >= MAX_PER_REQUEST) {
      refused.push({ id, error: OVER_REQUEST_LIMIT });
      return;
    }
    allowed.push(id);
    sent += 1;
  });

  return { allowed, refused, state: { sent } };
}
