import { describe, expect, it } from "vitest";
import { randomIds } from "@/adapters/ids";
import { BlockIdSchema, MediaIdSchema, ProfileIdSchema } from "@/core/profile/schema";

const ALPHABET = /^[a-z2-7]+$/;

describe("randomIds", () => {
  it("draws profile and media ids of 8 and block ids of 12 from the base-32 alphabet", () => {
    const ids = randomIds();
    for (let i = 0; i < 50; i += 1) {
      const profile = ids.profileId();
      const media = ids.mediaId();
      const block = ids.blockId();
      expect(profile).toMatch(ALPHABET);
      expect(profile).toHaveLength(8);
      expect(media).toHaveLength(8);
      expect(block).toMatch(ALPHABET);
      expect(block).toHaveLength(12);
      expect(ProfileIdSchema.safeParse(profile).success).toBe(true);
      expect(MediaIdSchema.safeParse(media).success).toBe(true);
      expect(BlockIdSchema.safeParse(block).success).toBe(true);
    }
  });

  it("does not repeat and uses more than a handful of the alphabet", () => {
    const ids = randomIds();
    const drawn = new Set<string>();
    const letters = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const id = ids.blockId();
      drawn.add(id);
      for (const letter of id) letters.add(letter);
    }
    expect(drawn.size).toBe(200);
    // 2400 draws over 32 symbols: seeing fewer than 24 of them means the source is not random.
    expect(letters.size).toBeGreaterThanOrEqual(24);
  });
});
