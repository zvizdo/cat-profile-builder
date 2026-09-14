import { describe, expect, it } from "vitest";
import { revOf } from "@/core/media/rev";
import { RevSchema } from "@/core/media/schema";

describe("revOf", () => {
  it("is the first 10 hex characters of the SHA-256 of the bytes", () => {
    // SHA-256("") = e3b0c442…, SHA-256("abc") = ba7816bf…
    expect(revOf(new Uint8Array())).toBe("e3b0c44298");
    expect(revOf(new TextEncoder().encode("abc"))).toBe("ba7816bf8f");
  });

  it("gives the same rev for the same bytes, and always a valid rev", () => {
    const bytes = new TextEncoder().encode("the same clip");
    expect(revOf(bytes)).toBe(revOf(new Uint8Array(bytes)));
    expect(RevSchema.safeParse(revOf(bytes)).success).toBe(true);
  });
});
