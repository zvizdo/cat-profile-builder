import { describe, expect, it } from "vitest";
import { BlockIdSchema, MediaIdSchema, ProfileIdSchema } from "@/core/profile/schema";
import { fixedClock } from "../../fakes/clock";
import { sequentialIds } from "../../fakes/id-source";
import { memoryLogger } from "../../fakes/logger";

describe("fixedClock", () => {
  it("always answers the same instant", () => {
    const clock = fixedClock("2026-09-10T12:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-09-10T12:00:00.000Z");
    expect(clock.now()).toEqual(clock.now());
    expect(clock.now()).not.toBe(clock.now());
  });

  it("refuses a string that is not a date", () => {
    expect(() => fixedClock("not a date")).toThrow(/date/i);
  });
});

describe("sequentialIds", () => {
  it("makes ids that satisfy the id schemas and never repeat", () => {
    const ids = sequentialIds();
    const profiles = [ids.profileId(), ids.profileId(), ids.profileId()];
    const blocks = [ids.blockId(), ids.blockId()];
    const media = [ids.mediaId(), ids.mediaId()];

    for (const id of profiles) expect(ProfileIdSchema.safeParse(id).success).toBe(true);
    for (const id of blocks) expect(BlockIdSchema.safeParse(id).success).toBe(true);
    for (const id of media) expect(MediaIdSchema.safeParse(id).success).toBe(true);
    expect(new Set([...profiles, ...blocks, ...media]).size).toBe(7);
  });

  it("is deterministic: two sources give the same sequence", () => {
    const a = sequentialIds();
    const b = sequentialIds();
    expect([a.profileId(), a.blockId(), a.mediaId()]).toEqual([
      b.profileId(),
      b.blockId(),
      b.mediaId(),
    ]);
    expect(a.profileId()).toBe("paaaaaac");
  });

  it("keeps counting past one base-32 digit", () => {
    const ids = sequentialIds();
    let last = "";
    for (let i = 0; i < 40; i += 1) last = ids.blockId();
    expect(last).toBe("baaaaaaaaabi");
    expect(BlockIdSchema.safeParse(last).success).toBe(true);
  });
});

describe("memoryLogger", () => {
  it("records every level with its fields and message", () => {
    const logger = memoryLogger();
    logger.debug({ a: 1 }, "one");
    logger.info({}, "two");
    logger.warn({ b: "x" }, "three");
    logger.error({ err: "boom" }, "four");
    expect(logger.entries).toEqual([
      { level: "debug", fields: { a: 1 }, msg: "one" },
      { level: "info", fields: {}, msg: "two" },
      { level: "warn", fields: { b: "x" }, msg: "three" },
      { level: "error", fields: { err: "boom" }, msg: "four" },
    ]);
  });

  it("a child logger merges its bindings into every entry and shares the sink", () => {
    const logger = memoryLogger();
    const child = logger.child({ pid: "abcdefgh" });
    child.info({ step: 1 }, "hello");
    child.child({ mid: "m" }).warn({ pid: "override" }, "nested");
    expect(logger.entries).toEqual([
      { level: "info", fields: { pid: "abcdefgh", step: 1 }, msg: "hello" },
      { level: "warn", fields: { pid: "override", mid: "m" }, msg: "nested" },
    ]);
  });
});
