import type { IdSource } from "@/core/ports";

// The real IdSource: random ids in the lowercase base-32 alphabet the id schemas allow
// (`[a-z2-7]`). Each character is one random byte modulo 32 — 256 splits evenly into 32, so
// every symbol is equally likely — and eight of them give 40 bits, enough that a shelter
// never sees a collision (the store still retries once, contracts/server-boundary.md).

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

const PROFILE_LENGTH = 8;
const MEDIA_LENGTH = 8;
const BLOCK_LENGTH = 12;

function draw(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = "";
  for (const byte of bytes) id += ALPHABET.charAt(byte % 32);
  return id;
}

/** Fresh random ids from `crypto.getRandomValues`, each satisfying its id schema. */
export function randomIds(): IdSource {
  return {
    profileId: () => draw(PROFILE_LENGTH),
    blockId: () => draw(BLOCK_LENGTH),
    mediaId: () => draw(MEDIA_LENGTH),
  };
}
