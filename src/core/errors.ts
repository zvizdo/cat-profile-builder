import { z, type ZodError, type ZodType } from "zod";

/**
 * The closed vocabulary of error codes every server response and Server Action result uses
 * (contracts/server-boundary.md). Each code has exactly one HTTP status and exactly one
 * `AppError` subclass, so a client can switch on `error.code` and never see a code that is
 * not listed here.
 */
export const ErrorCodeSchema = z.enum([
  "invalid",
  "unauthorized",
  "not_found",
  "refused",
  "too_large",
  "unsupported",
  "upstream",
  "internal",
]);

/** One of the eight error codes in {@link ErrorCodeSchema}. */
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

const HTTP_STATUS: Record<ErrorCode, number> = {
  invalid: 400,
  unauthorized: 401,
  not_found: 404,
  refused: 409,
  too_large: 413,
  unsupported: 422,
  upstream: 502,
  internal: 500,
};

/** The HTTP status a Route Handler answers with for `code` (contracts/server-boundary.md). */
export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code];
}

/**
 * The base of every error this app raises on purpose. `message` is plain language and safe
 * to show a person; `cause` (when given) is the underlying failure kept for diagnosis and
 * never sent to a browser. The class is abstract so the only way to get a `code` is through
 * the one subclass that owns it.
 */
export abstract class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  protected constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
    this.status = httpStatusFor(code);
  }
}

/** One validation failure, addressed by the dotted path of the field it is about. */
export interface ValidationIssue {
  /** Dotted path into the document (`blocks.2.scenes`); empty for the document itself. */
  path: string;
  message: string;
}

/** How many distinct paths the message names before it says how many more there were. */
const NAMED_PATHS = 12;

/**
 * A plain sentence naming the paths in `issues` (`Invalid data at blocks.0.scenes`), or
 * just `Invalid data` for a root-level failure. Zod's generated text is left out on purpose:
 * this message crosses to browsers, so it must read the same for a stored document, a
 * request body or a model reply. Paths are named once each and at most {@link NAMED_PATHS}
 * of them (F35: a long chat history that fails a union names the same few paths per
 * message, and the message must stay a sentence, not a listing).
 */
function describeIssues(issues: readonly ValidationIssue[]): string {
  const paths = [...new Set(issues.map((issue) => issue.path))].filter((path) => path !== "");
  if (paths.length === 0) return "Invalid data";
  const named = paths.slice(0, NAMED_PATHS).join(", ");
  const rest = paths.length - NAMED_PATHS;
  return rest > 0 ? `Invalid data at ${named} (+${rest} more)` : `Invalid data at ${named}`;
}

/**
 * Zod's issues with every `invalid_union` unfolded into the issues of its branches, each
 * path made absolute (a branch's own issue paths are relative to the union's element).
 * A union that fails reports one `Invalid input` at the element and hides the field that
 * actually failed inside `errors` (F35: `messages.3` said nothing, `messages.3.parts.2.state`
 * says everything) — so the leaves are what {@link ProfileInvalidError.issues} carries.
 * A union whose every branch reports nothing (not seen in practice) keeps the union issue.
 */
function leafIssues(issues: readonly z.core.$ZodIssue[], prefix: readonly PropertyKey[]) {
  const leaves: ValidationIssue[] = [];
  for (const issue of issues) {
    const path = [...prefix, ...issue.path];
    if (issue.code === "invalid_union" && issue.errors.some((branch) => branch.length > 0)) {
      for (const branch of issue.errors) leaves.push(...leafIssues(branch, path));
      continue;
    }
    leaves.push({ path: structuralPath(path), message: issue.message });
  }
  return leaves;
}

/** A schema key can never be longer than this; a longer segment is a record key the
 * client chose, not a field name. */
const SEGMENT_MAX = 32;

/**
 * `path` as a dotted string naming only what the *schema* names (F35 review, finding 3):
 * array indexes and schema field names stay; every segment under a free-form record —
 * the AI SDK's per-provider or per-tool metadata, whose keys the client writes — becomes
 * `*`, and any segment longer than a field name ever is, is cut. Paths cross to browsers
 * and to the log, so a crafted key must not ride along in either.
 */
function structuralPath(path: readonly PropertyKey[]): string {
  const segments: string[] = [];
  let underRecord = false;
  for (const key of path) {
    if (typeof key === "number") {
      segments.push(String(key));
      continue;
    }
    const segment = String(key);
    segments.push(underRecord ? "*" : segment.slice(0, SEGMENT_MAX));
    if (segment.endsWith("Metadata")) underRecord = true;
  }
  return segments.join(".");
}

/**
 * A document, request or model output failed schema validation (`invalid`, 400). Carries
 * every Zod issue as a `{ path, message }` pair; `message` names the failing paths and
 * nothing else (see {@link describeIssues}), while Zod's own wording stays in `issues` for
 * diagnosis. Also used by `migrate` for a document this version of the app cannot read.
 */
export class ProfileInvalidError extends AppError {
  readonly issues: readonly ValidationIssue[];

  constructor(
    message: string,
    issues: readonly ValidationIssue[] = [],
    options?: { cause?: unknown },
  ) {
    super("invalid", message, options);
    this.issues = issues;
  }

  /** Builds the error from a Zod failure, keeping the `ZodError` as `cause`; a failed
   * union's own branch issues are unfolded so every path names a real field. */
  static fromZod(error: ZodError): ProfileInvalidError {
    const issues = leafIssues(error.issues, []);
    return new ProfileInvalidError(describeIssues(issues), issues, { cause: error });
  }

  /** The dotted paths of every issue, each once, joined with ", " — for a caller
   * re-wording the message or logging where a document failed. */
  get paths(): string {
    return [...new Set(this.issues.map((issue) => issue.path))].join(", ");
  }
}

/** The caller is not signed in (`unauthorized`, 401). */
export class UnauthorizedError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("unauthorized", message, options);
  }
}

/** The profile or media the caller named does not exist (`not_found`, 404). */
export class NotFoundError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("not_found", message, options);
  }
}

/** A rule refused the action, for example deleting media a published page uses (`refused`, 409). */
export class RefusedError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("refused", message, options);
  }
}

/** An upload or body is over its size cap (`too_large`, 413). */
export class TooLargeError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("too_large", message, options);
  }
}

/** The content is of a kind this app does not handle, such as a file type (`unsupported`, 422). */
export class UnsupportedError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("unsupported", message, options);
  }
}

/** A model or storage call failed; the provider's own text stays in `cause` (`upstream`, 502). */
export class UpstreamError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("upstream", message, options);
  }
}

/** Anything else; the message is generic and the detail is logged (`internal`, 500). */
export class InternalError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("internal", message, options);
  }
}

/**
 * Validates `input` against `schema` and returns the typed value, or throws a
 * {@link ProfileInvalidError} naming every failing path. This is how every boundary — a
 * stored document, a request body, a model reply — turns `unknown` into a typed value
 * without ever coercing it (constitution, Principles IV and VI).
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw ProfileInvalidError.fromZod(result.error);
  }
  return result.data;
}
