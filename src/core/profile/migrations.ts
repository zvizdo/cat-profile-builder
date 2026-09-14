import { z, type ZodType } from "zod";
import { parseOrThrow, ProfileInvalidError } from "../errors";
import {
  ProfileDocumentSchema,
  PublishedDocumentSchema,
  type ProfileDocument,
  type PublishedDocument,
} from "./schema";

/** The `schemaVersion` this build writes and the highest one it can read. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Just enough shape to read the version off a stored document; every other key passes through. */
const VersionedSchema = z.looseObject({ schemaVersion: z.number() });

/**
 * Brings a stored document (`unknown`, straight from the store) up to
 * {@link CURRENT_SCHEMA_VERSION} through a chain of pure `v{n} → v{n+1}` steps
 * (contracts/profile-document.md, guarantee 4). There is no v0, so the chain is empty at v1
 * and a current document is returned as the same object, untouched. Nothing is coerced: a
 * document with no numeric `schemaVersion`, or one written by a newer app, throws a
 * {@link ProfileInvalidError} rather than being guessed at. The result is still `unknown` —
 * `loadProfile` is what validates it.
 *
 * F1 (Checkpoint 2) added the hero-at-`blocks[0]` rule as a refinement of the v1 schema
 * itself, not a `v2`: nothing is in production and no stored document predates the rule
 * (constitution Principle VI waiver, recorded in F1's commit), so a v1 document missing a
 * hero, or with one not first, is simply invalid — {@link loadProfile} throws the same
 * {@link ProfileInvalidError} any other broken document does, never silently repaired.
 */
export function migrate(input: unknown): unknown {
  const { schemaVersion } = parseOrThrow(VersionedSchema, input);
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new ProfileInvalidError(
      `This profile was saved by a version newer than this app (schemaVersion ${schemaVersion}; this app reads up to ${CURRENT_SCHEMA_VERSION}).`,
    );
  }
  return input;
}

/** {@link migrate} then a full parse against `schema`, with the failure reworded for a volunteer. */
function loadWith<T>(schema: ZodType<T>, input: unknown): T {
  try {
    return parseOrThrow(schema, migrate(input));
  } catch (error) {
    if (error instanceof ProfileInvalidError && error.issues.length > 0) {
      throw new ProfileInvalidError(`This profile couldn't be read: ${error.paths}`, error.issues, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Reads a stored document: {@link migrate} then a full parse against
 * `ProfileDocumentSchema` (guarantee 3). A schema failure at either step is rethrown as a
 * {@link ProfileInvalidError} with the volunteer-facing message
 * `This profile couldn't be read: <paths>` (same issues, the neutral error as `cause`);
 * `migrate`'s own "newer than this app" error already reads that way and passes through.
 * A document is never partially loaded or repaired.
 */
export function loadProfile(input: unknown): ProfileDocument {
  return loadWith(ProfileDocumentSchema, input);
}

/**
 * Reads a stored `published.json` the way {@link loadProfile} reads a draft, against
 * `PublishedDocumentSchema` (guarantee 6): the same migration chain, then the published
 * shape with its manifest checked against every referenced id. A draft, or a published
 * copy whose manifest is short, fails the same way — the public page never renders a
 * document it cannot resolve.
 */
export function loadPublished(input: unknown): PublishedDocument {
  return loadWith(PublishedDocumentSchema, input);
}
