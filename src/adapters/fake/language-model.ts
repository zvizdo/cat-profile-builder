import type { LanguageModelV3 } from "@ai-sdk/provider";
import { InternalError } from "@/core/errors";
import { abortMidTurn } from "./scenarios/abort-mid-turn";
import { badOperation } from "./scenarios/bad-operation";
import { buildProfileHappy } from "./scenarios/build-profile-happy";
import { buildProposal } from "./scenarios/build-proposal";
import { cardThenApply } from "./scenarios/card-then-apply";
import { editProposals } from "./scenarios/edit-proposals";
import { imageProposals } from "./scenarios/image-proposals";
import { injection } from "./scenarios/injection";
import { markdownReply } from "./scenarios/markdown-reply";
import { noop } from "./scenarios/noop";
import { phoneEdits } from "./scenarios/phone-edits";
import { publishRequest } from "./scenarios/publish-request";
import { textProposals } from "./scenarios/text-proposals";
import { truncated } from "./scenarios/truncated";

// The scripted model registry, wired when `MODEL=fake` (ADR-001, ADR-012). Each scenario is
// a factory for a `MockLanguageModelV3` from `ai/test`; `FAKE_MODEL_SCENARIO` picks one by
// name at boot. It lives in `src/` because the built app runs it, not only the tests. The
// eight helper scenarios (T035) are called with no options here, so they run at their real
// timing; tests that care about the "300 ms apart" feel import the factory directly and
// pass `{ delayMs: 0 }`.
const SCENARIOS: Record<string, () => LanguageModelV3> = {
  noop,
  "build-profile-happy": () => buildProfileHappy(),
  "build-proposal": () => buildProposal(),
  "abort-mid-turn": abortMidTurn,
  truncated,
  "edit-proposals": editProposals,
  "bad-operation": badOperation,
  "publish-request": publishRequest,
  injection,
  "phone-edits": phoneEdits,
  "markdown-reply": markdownReply,
  "card-then-apply": cardThenApply,
  "text-proposals": textProposals,
  "image-proposals": imageProposals,
};

/** The names `FAKE_MODEL_SCENARIO` accepts. */
export const SCENARIO_NAMES: readonly string[] = Object.keys(SCENARIOS);

/**
 * A fresh model for `name`. Throws `InternalError` for a name that is not a scenario —
 * including inherited object keys such as `constructor` — so a typo in the environment
 * stops the app at boot rather than answering with the wrong conversation.
 */
export function scenario(name: string): LanguageModelV3 {
  const build = Object.hasOwn(SCENARIOS, name) ? SCENARIOS[name] : undefined;
  if (build === undefined) {
    throw new InternalError(
      `Unknown fake model scenario "${name}". Known scenarios: ${SCENARIO_NAMES.join(", ")}.`,
    );
  }
  return build();
}
