/**
 * Fresh ids for the three things that get one. Every id satisfies its schema
 * (`ProfileIdSchema`/`MediaIdSchema`: `[a-z2-7]{8}`, `BlockIdSchema`: `[a-z2-7]{12}`).
 * The real source draws from `crypto.getRandomValues`; tests use `sequentialIds`.
 */
export interface IdSource {
  profileId(): string;
  blockId(): string;
  mediaId(): string;
}
