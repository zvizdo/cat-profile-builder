import "server-only";
import { z } from "zod";
import { InternalError } from "@/core/errors";

// Every environment variable the app reads, validated once at boot (data-model.md →
// Configuration, ADR-014). The process refuses to start on a missing or malformed value, and
// the boot error names all of them at once so a coordinator fixes the file in one pass.
// `FPS_GATE` is deliberately absent: only Playwright reads it (ADR-009).

/** pino's level names; `silent` is what the test suites run under. */
export const LogLevelSchema = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

const NonEmpty = z.string().min(1);

/**
 * The shape of a valid configuration. Only these keys are read from the environment; the
 * Google Cloud values are optional here and demanded by `loadConfig` exactly when `STORE=gcs`
 * or `MODEL=vertex` needs them. Model ids default to the ADR-003 values.
 */
export const ConfigSchema = z.object({
  STORE: z.enum(["memory", "fs", "gcs"]).default("fs"),
  MODEL: z.enum(["fake", "vertex"]).default("fake"),
  DATA_DIR: NonEmpty.default(".data"),
  PUBLIC_BASE_URL: z.url(),
  SESSION_SECRET: z.string().min(16),
  SHELTER_USERNAME: NonEmpty,
  SHELTER_PASSWORD_HMAC: z.string().regex(/^[0-9a-f]{64}$/, "must be 64 hex characters"),
  GCS_PRIVATE_BUCKET: NonEmpty.optional(),
  GCS_PUBLIC_BUCKET: NonEmpty.optional(),
  GOOGLE_CLOUD_PROJECT: NonEmpty.optional(),
  VERTEX_LOCATION: NonEmpty.default("global"),
  MODEL_DRAFTING: NonEmpty.default("gemini-3.8-flash"),
  MODEL_DESCRIBER: NonEmpty.default("gemini-2.5-flash-lite"),
  FAKE_MODEL_SCENARIO: NonEmpty.default("noop"),
  FAKE_DESCRIBER: z.literal("fail").optional(),
  LOG_LEVEL: LogLevelSchema.default("info"),
});

/** The validated configuration the container is built from. */
export type Config = z.infer<typeof ConfigSchema>;

/** One thing wrong with the environment, as the boot error prints it. */
interface Problem {
  name: string;
  detail: string;
}

const CLOUD_KEYS = ["GCS_PRIVATE_BUCKET", "GCS_PUBLIC_BUCKET", "GOOGLE_CLOUD_PROJECT"] as const;

/**
 * The Google Cloud values the chosen modes need but the environment lacks. This is not a
 * Zod refinement on purpose: Zod skips refinements once any field has failed, and the boot
 * error must list everything in one go.
 */
function cloudProblems(raw: Record<string, string>): Problem[] {
  const needed = new Map<string, string>();
  if (raw.STORE === "gcs") for (const key of CLOUD_KEYS) needed.set(key, "STORE=gcs");
  if (raw.MODEL === "vertex") needed.set("GOOGLE_CLOUD_PROJECT", "MODEL=vertex");
  return [...needed]
    .filter(([key]) => raw[key] === undefined)
    .map(([name, reason]) => ({ name, detail: `required when ${reason}` }));
}

function schemaProblems(error: z.ZodError): Problem[] {
  return error.issues.map((issue) => ({
    name: issue.path.map(String).join("."),
    detail: issue.code === "invalid_type" ? "missing" : issue.message,
  }));
}

/**
 * What `process.env` looks like before validation: any name, maybe a string. Next's typing of
 * `NodeJS.ProcessEnv` adds a required `NODE_ENV`, which a test's hand-built environment
 * should not have to carry, so `loadConfig` takes this shape and `process.env` satisfies it.
 */
export type Env = Readonly<Record<string, string | undefined>>;

/** The known keys only, with `""` read as unset — `.env.example` leaves optional values blank. */
function pick(env: Env): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of Object.keys(ConfigSchema.shape)) {
    const value = env[key];
    if (value !== undefined && value !== "") picked[key] = value;
  }
  return picked;
}

/**
 * Validates `env` and returns the configuration, or throws one `InternalError` whose message
 * names every missing or invalid variable and what is wrong with it. Nothing in `env` is
 * trusted until the schema has seen it (constitution, Principle IV); keys the schema does not
 * know are never read.
 */
export function loadConfig(env: Env): Config {
  const raw = pick(env);
  const result = ConfigSchema.safeParse(raw);
  const problems = [...(result.success ? [] : schemaProblems(result.error)), ...cloudProblems(raw)];
  if (result.success && problems.length === 0) return result.data;
  const listed = problems.map(({ name, detail }) => `${name} (${detail})`).join("; ");
  throw new InternalError(`Configuration is invalid: ${listed}.`);
}
