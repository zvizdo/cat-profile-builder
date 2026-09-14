# ADR-004: Profile persistence and publishing model

**Status**: accepted · **Date**: 2026-09-10

## Context

The founding decisions: JSON documents in the same GCS bucket as the media, no database,
tens of profiles (≤ ~50), draft and published are separate documents, last write wins.
The constitution requires byte-faithful round-trips of a schema-versioned document.

## Decision

**Paths, buckets, write rules, and the draft-save protocol are in ADR-015**; this record
keeps the publishing model.

- **Publication state is which file exists** beside `draft.json`: neither → draft;
  `published.json` → live; `archived.json` → archived. Never both.
- **Publish** = validate the draft for readiness, resolve every referenced media id into the
  manifest (ADR-015), and write `published.json` with `publishedAt` and `slug` set; delete
  `archived.json` if present. **Unpublish** = delete whichever exists. **Archive** = copy
  `published.json` to `archived.json` and delete the original; **restore** = the reverse.
  Copies are server-side, so the restored page is byte-identical (FR-087). All take effect
  for the next visitor immediately because public pages read the object on request
  (`revalidate` 0).
- **Public URL** is `/cats/{slug}-{id}`. Lookup uses only the trailing id; the slug is
  derived from the name at publish time and is cosmetic, so renaming never breaks a shared
  link (FR-057) and two cats named Charlotte get distinct addresses.
- **The store port** is `ProfileStore` (contracts/ports.md). It reads and writes `unknown`;
  the core validates on both sides (FR-018) and migrates on load (FR-019).
- **Writes** use plain overwrite, no generation match — the accepted last-write-wins risk.
  Object versioning on the private bucket (ADR-015) is the administrator's recovery net.

## Alternatives rejected

- A database (Firestore, SQLite on a volume) — decided against in founding clarifications.
- A `profiles/index.json` — a derived cache that can drift; object metadata on `draft.json`
  gives the list in one call instead (ADR-015).
- A `status` field in the draft — two places to say "published" is one too many.
