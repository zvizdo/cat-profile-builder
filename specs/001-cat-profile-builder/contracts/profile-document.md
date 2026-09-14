# Contract: Profile document

Shapes are in [data-model.md](../data-model.md). This file states the guarantees.

## Guarantees

1. **Single definition.** `ProfileDocumentSchema` in `src/core/profile/schema.ts` is the only
   definition. Types are `z.infer`ed. No other file declares a profile type.
2. **Versioned.** Every stored document has `schemaVersion`. The current version is `1`.
   Checkpoint 2 (F1) added the rule that `blocks[0]` is always the one hero block as a
   refinement of this same v1 schema, not a version bump: nothing was in production and no
   stored document predates it, so this is a waiver of constitution Principle VI ("a shape
   change ships with its migration"), recorded in F1's commit rather than a `v2` and a
   migration. A document with no hero, or with one anywhere but first, is invalid the same
   way any other broken shape is (guarantee 3).
3. **Validated both ways.** `ProfileStore` returns `unknown`; `loadProfile(unknown)` runs
   `migrate` then `parse`. `saveDraft` parses before writing. A parse failure is a
   `ProfileInvalidError` with the Zod issue path, surfaced to the volunteer as "This profile
   couldn't be read" — never partially rendered, never repaired (FR-018).
4. **Migrated on load.** `migrate(unknown): unknown` is a chain of pure
   `v{n}→v{n+1}` functions. There is no v0, so the chain is empty at v1; the test that a
   document at the current version passes through unchanged exists from day one.
5. **Byte-faithful round-trip.** `JSON.parse(JSON.stringify(doc))` re-validates to a deep-equal
   document. Key order is not guaranteed and is not relied on.
6. **Published ⊃ draft shape.** `PublishedDocumentSchema = ProfileDocumentSchema.extend({
   publishedAt, slug, media: z.record(MediaIdSchema, ResolvedMediaSchema) })` — the media
   manifest (data-model.md, ADR-015). Publishing while the helper is working is refused by the
   Publish button (a UI state); no such flag exists in either schema.
7. **Media records are documents too.** `MediaAssetSchema` carries `schemaVersion`, is read
   from storage as `unknown`, migrated and validated exactly like the profile.

## Contract tests (`tests/contract/profile-document.test.ts`)

- round-trip of a maximal fixture (every block type, every optional field)
- rejection of: unknown block type, duplicate block ids, `warmth` out of range, `href` with a
  `javascript:` scheme, a document without `schemaVersion`, a document with version `2`, a
  `tagline` over 80 characters, a `day` block without exactly three scenes, a `needs` block
  with zero or four cards, a document with no hero block, and a document whose hero is not
  `blocks[0]` (Checkpoint 2, F1)
- migration identity at v1; when v2 arrives, a v1 fixture migrating to v2 — for both
  `ProfileDocument` and `MediaAsset`
- manifest: `PublishedDocument` round-trips; rejection of a manifest missing an id the blocks
  reference, or with a non-`https:` `src`; `resolveManifest(doc, assets)` covers exactly the
  referenced ids and nothing else
- `checkReadiness` returns the exact strings in data-model.md for each missing item,
  including the 15-second clip rule
- `displayLine` returns the tagline, else the bio's first sentence, else empty
