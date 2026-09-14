import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { lazyWeb } from "@/adapters/lazy-stream";

// `lazyWeb` (F23 review, finding 2): the Node stream is opened on the first read, never on
// construction, and never at all when the web stream is cancelled first; once read it
// forwards every chunk and closes; a cancel mid-way destroys the Node stream.

function chunks(...texts: string[]): {
  opened: number;
  open: () => Readable;
  destroyed: () => boolean;
} {
  let opened = 0;
  let last: Readable | null = null;
  return {
    get opened() {
      return opened;
    },
    open: () => {
      opened += 1;
      last = Readable.from(texts.map((text) => Buffer.from(text)));
      return last;
    },
    destroyed: () => last?.destroyed ?? false,
  };
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    out += new TextDecoder().decode(next.value);
  }
  return out;
}

describe("lazyWeb", () => {
  it("does not open the Node stream until the first read", async () => {
    const source = chunks("ab", "cd");
    const stream = lazyWeb(source.open);
    await new Promise((done) => setTimeout(done, 10));
    expect(source.opened).toBe(0);
    expect(await drain(stream)).toBe("abcd");
    expect(source.opened).toBe(1);
  });

  it("never opens it when cancelled before any read", async () => {
    const source = chunks("ab");
    const stream = lazyWeb(source.open);
    await stream.cancel();
    expect(source.opened).toBe(0);
  });

  it("destroys the Node stream when cancelled part-way", async () => {
    const source = chunks("ab", "cd", "ef");
    const stream = lazyWeb(source.open);
    const reader = stream.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("ab");
    await reader.cancel();
    expect(source.destroyed()).toBe(true);
  });
});
