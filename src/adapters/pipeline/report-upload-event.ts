import "server-only";
import { z } from "zod";
import type { Container } from "@/adapters/container";
import { MediaIdSchema, ProfileIdSchema } from "@/core/profile/schema";

// The upload's own diagnostics (spec 2026-09-22, §3). The bytes go from the browser straight
// to Cloud Storage, so when that step fails nothing on the server sees it; the browser tells
// us here instead, with one structured line: which step, what status, how far it got. The
// schema is strict and names no field that could carry a file name or a signed or session
// URL — those URLs are bearer credentials and must never be logged (constitution, Logging).

/** What the browser reports about one upload that failed, or that a retry rescued. */
export const UploadEventInputSchema = z.strictObject({
  profileId: ProfileIdSchema,
  mediaId: MediaIdSchema,
  stage: z.enum(["start", "send", "finalize"]),
  outcome: z.enum(["failed", "resumed"]),
  /** The last HTTP status seen; `0` when no answer came at all. */
  status: z.number().int().min(0).max(599),
  byteSize: z.number().int().positive(),
  declaredType: z.string().max(100),
  /** Bytes storage confirmed holding (or the whole file, once it did). */
  confirmedBytes: z.number().int().nonnegative(),
  attempts: z.number().int().min(1).max(10),
});

export type UploadEventInput = z.infer<typeof UploadEventInputSchema>;

/** What reporting takes from the container. */
export type ReportUploadEventDeps = Pick<Container, "logger">;

/** Longest user agent kept; enough to name the phone and browser, never a dump. */
const USER_AGENT_MAX = 300;

/**
 * Writes the one `upload event` line: `warn` for a failure, `info` for an upload a retry
 * saved, with the report's fields and the requesting browser's user agent. Writes nothing
 * else and answers nothing.
 */
export async function reportUploadEvent(
  deps: ReportUploadEventDeps,
  input: UploadEventInput,
  userAgent: string,
): Promise<Record<never, never>> {
  const fields = { ...input, userAgent: userAgent.slice(0, USER_AGENT_MAX) };
  if (input.outcome === "failed") deps.logger.warn(fields, "upload event");
  else deps.logger.info(fields, "upload event");
  return {};
}
