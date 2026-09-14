import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLogger, type LogSink } from "@/adapters/logger";

/** Collects every line pino writes so a test can read the JSON back. */
function sink(): LogSink & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    write(line: string) {
      lines.push(line);
    },
  };
}

const Line = z.record(z.string(), z.unknown());

function parsed(lines: string[]): Array<Record<string, unknown>> {
  return lines.map((line) => Line.parse(JSON.parse(line)));
}

describe("createLogger", () => {
  it("writes one JSON line per call with the fields and the message", () => {
    const out = sink();
    const logger = createLogger({ level: "info", destination: out });
    logger.info({ pid: "abcdefgh" }, "saved");

    const [line] = parsed(out.lines);
    expect(line).toMatchObject({ level: "info", pid: "abcdefgh", msg: "saved" });
    expect(typeof line?.time).toBe("number");
  });

  it("redacts every secret-shaped field at the logging boundary", () => {
    const out = sink();
    const logger = createLogger({ level: "info", destination: out });
    logger.info(
      {
        password: "hunter2",
        SESSION_SECRET: "the-session-secret",
        authorization: "Bearer token-1",
        cookie: "session=abc",
        form: { password: "hunter3", cookie: "session=def" },
        req: { headers: { authorization: "Bearer token-2", cookie: "session=ghi" } },
      },
      "sign in",
    );

    const raw = out.lines.join("");
    for (const secret of [
      "hunter2",
      "hunter3",
      "the-session-secret",
      "token-1",
      "token-2",
      "session=abc",
      "session=def",
      "session=ghi",
    ]) {
      expect(raw).not.toContain(secret);
    }
    const [line] = parsed(out.lines);
    expect(line).toMatchObject({
      password: "[redacted]",
      SESSION_SECRET: "[redacted]",
      authorization: "[redacted]",
      cookie: "[redacted]",
      form: { password: "[redacted]", cookie: "[redacted]" },
      req: { headers: { authorization: "[redacted]", cookie: "[redacted]" } },
    });
  });

  it("redacts a secret at any depth, whatever its case — including inside a logged error", () => {
    const out = sink();
    const logger = createLogger({ level: "info", destination: out });
    // What the AI SDK's APICallError carries: response headers as own enumerable properties.
    const providerError = Object.assign(new Error("provider said X"), {
      response: { headers: { Authorization: "Bearer LEAK1", "set-cookie": "s=LEAK2" } },
      requestBodyValues: { nested: { deeper: { PASSWORD: "LEAK3" } } },
    });
    logger.error({ err: providerError, form: { a: { b: { c: { Cookie: "LEAK4" } } } } }, "up");

    const raw = out.lines.join("");
    for (const secret of ["LEAK1", "LEAK3", "LEAK4"]) expect(raw).not.toContain(secret);
    const [line] = parsed(out.lines);
    expect(line?.err).toMatchObject({
      message: "provider said X",
      response: { headers: { Authorization: "[redacted]", "set-cookie": "s=LEAK2" } },
      requestBodyValues: { nested: { deeper: { PASSWORD: "[redacted]" } } },
    });
    expect(line?.form).toEqual({ a: { b: { c: { Cookie: "[redacted]" } } } });
  });

  it("survives a cycle in the logged fields and still redacts inside it", () => {
    const out = sink();
    const logger = createLogger({ level: "info", destination: out });
    const loop: Record<string, unknown> = { password: "LEAK5", list: [1, "two"] };
    loop.self = loop;
    logger.info({ loop, when: new Date(0) }, "cycle");

    const raw = out.lines.join("");
    expect(raw).not.toContain("LEAK5");
    const [line] = parsed(out.lines);
    expect(line?.loop).toMatchObject({ password: "[redacted]", list: [1, "two"] });
    expect(line?.when).toBe("1970-01-01T00:00:00.000Z");
  });

  it("adds no process id or hostname, so pid stays the profile id", () => {
    const out = sink();
    const logger = createLogger({ level: "info", destination: out });
    logger.child({ pid: "abcdefgh" }).info({}, "saved");
    logger.info({}, "bare");

    const [withProfile, bare] = parsed(out.lines);
    expect(withProfile?.pid).toBe("abcdefgh");
    expect(out.lines[0]?.match(/"pid":/g)).toHaveLength(1);
    expect(withProfile).not.toHaveProperty("hostname");
    expect(bare).not.toHaveProperty("pid");
  });

  it("redacts inside child bindings too", () => {
    const out = sink();
    createLogger({ level: "info", destination: out })
      .child({ req: { headers: { cookie: "session=LEAK6" } } })
      .info({}, "bound");
    expect(out.lines.join("")).not.toContain("LEAK6");
    expect(parsed(out.lines)[0]?.req).toEqual({ headers: { cookie: "[redacted]" } });
  });

  it("child loggers carry their bindings on every line", () => {
    const out = sink();
    const logger = createLogger({ level: "debug", destination: out }).child({ pid: "abcdefgh" });
    logger.debug({ mid: "mmmmmmm2" }, "probed");
    logger.warn({}, "slow");

    const lines = parsed(out.lines);
    expect(lines[0]).toMatchObject({ level: "debug", pid: "abcdefgh", mid: "mmmmmmm2" });
    expect(lines[1]).toMatchObject({ level: "warn", pid: "abcdefgh", msg: "slow" });
  });

  it("drops lines under the level, and everything when silent", () => {
    const out = sink();
    const logger = createLogger({ level: "warn", destination: out });
    logger.info({}, "quiet");
    logger.error({}, "loud");
    expect(parsed(out.lines).map((line) => line.msg)).toEqual(["loud"]);

    const silent = sink();
    createLogger({ level: "silent", destination: silent }).error({}, "nothing");
    expect(silent.lines).toEqual([]);
  });

  it("defaults to info", () => {
    const out = sink();
    const logger = createLogger({ destination: out });
    logger.debug({}, "hidden");
    logger.info({}, "shown");
    expect(parsed(out.lines).map((line) => line.msg)).toEqual(["shown"]);
  });

  it("serialises an error under err with its message and stack", () => {
    const out = sink();
    const logger = createLogger({ level: "info", destination: out });
    logger.error({ err: new Error("provider said X") }, "unhandled");

    const [line] = parsed(out.lines);
    expect(line?.err).toMatchObject({ type: "Error", message: "provider said X" });
  });
});
