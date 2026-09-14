import { InvalidToolInputError, NoSuchToolError } from "ai";

// What the browser — and, on the next request, the model — is told about a tool call the
// AI SDK itself refused (F42, build-stall-investigation.md side finding 2). The SDK's
// default is "An error occurred.", so the model retried blind, twice in a row in one
// captured build. The text here names the tool and the fields that failed, in Zod's own
// words — never the value the model sent, and never a provider's message: anything that
// is not one of the two tool-call errors gets one fixed sentence. Pure over the error, so
// `helper-stream.ts` can log the same paths it tells the model about.

/** One fixed sentence for every failure that is not a tool-call error the model can fix. */
export const GENERIC_ERROR_TEXT = "That call could not be completed.";

/** How many issues one error text names before it stops; the SDK caps `errorText` anyway. */
const MAX_ISSUES = 8;

/** One Zod issue, as far as this file reads it: a path and a message. */
interface Issue {
  path: string;
  message: string;
}

function isIssueLike(value: unknown): value is { path?: unknown; message?: unknown } {
  return typeof value === "object" && value !== null && "message" in value;
}

function pathOf(path: unknown): string {
  return Array.isArray(path) ? path.map(String).join(".") : "";
}

/**
 * The Zod issues behind an `InvalidToolInputError`: the SDK wraps the schema failure in a
 * `TypeValidationError` whose `cause` is the `ZodError` carrying `issues`, so this walks
 * the `cause` chain a few steps rather than assuming one exact depth. An error with no
 * issues in reach (a body that was not JSON at all) reads as an empty list.
 */
function issuesOf(error: unknown, depth = 0): Issue[] {
  if (depth > 4 || typeof error !== "object" || error === null) return [];
  const { issues, cause } = error as { issues?: unknown; cause?: unknown };
  if (Array.isArray(issues)) {
    return issues.filter(isIssueLike).map((issue) => ({
      path: pathOf(issue.path),
      message: typeof issue.message === "string" ? issue.message : "invalid",
    }));
  }
  return issuesOf(cause, depth + 1);
}

/** The failing field paths of a refused tool call — `["op", "block.mediaIds"]` — for the
 * log: names only, never a value (constitution: logs carry ids only). */
export function issuePaths(error: unknown): string[] {
  return issuesOf(error).map((issue) => issue.path);
}

/**
 * The error text for one tool-call error, or `GENERIC_ERROR_TEXT` for anything else:
 * `add_block — op: Invalid input: expected "add_block"; block.mediaIds: Invalid input:
 * expected array, received undefined`, or `publish_profile: no such tool. The tools are:
 * …`. Zod's messages name expected shapes and our own literals, never the received value.
 */
export function toolErrorText(error: unknown): string {
  if (NoSuchToolError.isInstance(error)) {
    const tools = error.availableTools?.join(", ");
    const list = tools === undefined ? "" : ` The tools are: ${tools}.`;
    return `${error.toolName}: no such tool.${list}`;
  }
  if (!InvalidToolInputError.isInstance(error)) return GENERIC_ERROR_TEXT;
  const issues = issuesOf(error);
  if (issues.length === 0) return `${error.toolName}: the input was not valid JSON.`;
  const named = issues
    .slice(0, MAX_ISSUES)
    .map((issue) => `${issue.path === "" ? "input" : issue.path}: ${issue.message}`)
    .join("; ");
  return `${error.toolName} — ${named}`;
}
