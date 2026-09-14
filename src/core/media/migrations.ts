import { z } from "zod";
import { parseOrThrow, ProfileInvalidError } from "../errors";
import { MediaAssetSchema, type MediaAsset } from "./schema";

/** The `schemaVersion` this build writes into `asset.json` and the highest one it can read. */
export const CURRENT_ASSET_SCHEMA_VERSION = 1;

/** Just enough shape to read the version off a stored record; every other key passes through. */
const VersionedSchema = z.looseObject({ schemaVersion: z.number() });

/**
 * Brings a stored media record (`unknown`, straight from the store) up to
 * {@link CURRENT_ASSET_SCHEMA_VERSION} — the same rule as the profile's `migrate`
 * (contracts/profile-document.md, guarantee 7). There is no v0, so the chain is empty at v1
 * and a current record is returned as the same object, untouched. A record with no numeric
 * `schemaVersion`, or one written by a newer app, throws a {@link ProfileInvalidError}
 * rather than being guessed at. The result is still `unknown` — `loadAsset` validates it.
 */
export function migrateAsset(input: unknown): unknown {
  const { schemaVersion } = parseOrThrow(VersionedSchema, input);
  if (schemaVersion > CURRENT_ASSET_SCHEMA_VERSION) {
    throw new ProfileInvalidError(
      `This media record was saved by a version newer than this app (schemaVersion ${schemaVersion}; this app reads up to ${CURRENT_ASSET_SCHEMA_VERSION}).`,
    );
  }
  return input;
}

/**
 * Reads a stored media record: {@link migrateAsset} then a full parse against
 * `MediaAssetSchema`. A failure at either step is a {@link ProfileInvalidError} naming the
 * failing paths; a record is never partially loaded or repaired.
 */
export function loadAsset(input: unknown): MediaAsset {
  return parseOrThrow(MediaAssetSchema, migrateAsset(input));
}
