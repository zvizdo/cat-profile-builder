import type { IdSource } from "@/core/ports";

// Deterministic ids: a per-kind counter written in the id alphabet (`a`–`z`, `2`–`7` — the
// lowercase base-32 the schemas allow), padded with `a` and prefixed by the kind's letter,
// so `paaaaaab` is the first profile, `baaaaaaaaaab` the first block, `maaaaaab` the first
// media. Two sources give the same sequence; ids never repeat within one.

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function encode(n: number): string {
  let rest = n;
  let out = "";
  do {
    out = ALPHABET.charAt(rest % 32) + out;
    rest = Math.floor(rest / 32);
  } while (rest > 0);
  return out;
}

function counter(prefix: string, length: number): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}${encode(n).padStart(length - 1, "a")}`;
  };
}

export function sequentialIds(): IdSource {
  return {
    profileId: counter("p", 8),
    blockId: counter("b", 12),
    mediaId: counter("m", 8),
  };
}
