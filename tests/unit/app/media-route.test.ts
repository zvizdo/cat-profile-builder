import { describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "@/app/media/[...path]/route";
import { INTERNAL_MESSAGE } from "@/app/api/_lib/respond";
import { UpstreamError } from "@/core/errors";
import { memoryLogger } from "../../fakes/logger";
import { createMemoryMediaStore } from "../../fakes/media-store";

// The `/media/<name>` route that serves every derived file under every store (T016, F23):
// only a name of the ADR-015 grammar reaches the store, every other shape — including
// anything with `..` — is a 404 before any lookup, a served file carries the immutable cache
// header and its rev as the ETag, `HEAD` answers the headers alone, and a store failure is
// the shared 502. The full `Range`/`If-None-Match` contract is in
// tests/contract/server-boundary.test.ts.

const media = createMemoryMediaStore({ publicBase: "/media" });
const logger = memoryLogger();
const container = { config: { STORE: "fs" }, mediaStore: media, logger };

vi.mock("@/adapters/container", () => ({
  getContainer: () => container,
}));

const PID = "abcdefgh";
const MID = "mmmmmmm2";

function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return GET(new Request(`http://localhost:3000/media/${path}`, { headers }), {
    params: Promise.resolve({ path: path.split("/") }),
  });
}

function head(path: string): Promise<Response> {
  return HEAD(new Request(`http://localhost:3000/media/${path}`, { method: "HEAD" }), {
    params: Promise.resolve({ path: path.split("/") }),
  });
}

describe("GET /media/[...path]", () => {
  it("serves a written rev with its content type, ETag and an immutable cache header", async () => {
    const bytes = new TextEncoder().encode("jpeg bytes");
    const rev = await media.writeDerived(PID, MID, "clean", bytes);
    const response = await get(`profiles/${PID}/media/${MID}/clean.${rev}.jpg`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("etag")).toBe(`"${rev}"`);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("serves video as video/mp4 and honours a Range with 206", async () => {
    const rev = await media.writeDerived(PID, MID, "web", new TextEncoder().encode("mp4 bytes"));
    const response = await get(`profiles/${PID}/media/${MID}/web.${rev}.mp4`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    const partial = await get(`profiles/${PID}/media/${MID}/web.${rev}.mp4`, {
      range: "bytes=4-",
    });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe("bytes 4-8/9");
    expect(await partial.text()).toBe("bytes");
  });

  it("HEAD answers the headers of a written rev with no body", async () => {
    const rev = await media.writeDerived(PID, MID, "poster", new TextEncoder().encode("poster"));
    const response = await head(`profiles/${PID}/media/${MID}/poster.${rev}.jpg`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-length")).toBe("6");
    expect(response.headers.get("etag")).toBe(`"${rev}"`);
    expect(response.body).toBeNull();
  });

  it("answers 404 with the one error shape for a rev that was never written", async () => {
    const response = await get(`profiles/${PID}/media/${MID}/poster.0123456789.jpg`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "There is no file at this address." },
    });
  });

  it("answers the shared 502 shape when the store fails, and logs it", async () => {
    const failing = {
      ...media,
      readDerivedRange: async () =>
        Promise.reject(new UpstreamError("The storage service didn't respond.")),
    };
    const previous = container.mediaStore;
    container.mediaStore = failing;
    try {
      const response = await get(`profiles/${PID}/media/${MID}/clean.0123456789.jpg`);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: { code: "upstream", message: "The storage service didn't respond." },
      });
      expect(logger.entries.some((entry) => entry.level === "warn")).toBe(true);
    } finally {
      container.mediaStore = previous;
    }
  });

  it("answers the generic 500 shape for an unexpected failure", async () => {
    const previous = container.mediaStore;
    container.mediaStore = {
      ...media,
      readDerivedRange: async () => Promise.reject(new Error("boom")),
    };
    try {
      const response = await get(`profiles/${PID}/media/${MID}/clean.0123456789.jpg`);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "internal", message: INTERNAL_MESSAGE },
      });
    } finally {
      container.mediaStore = previous;
    }
  });

  it.each(["memory", "fs", "gcs"])(
    "serves under STORE=%s: this app is the only reader of derived files (F23)",
    async (store) => {
      const rev = await media.writeDerived(PID, MID, "clean", new TextEncoder().encode("x"));
      container.config.STORE = store;
      try {
        const response = await get(`profiles/${PID}/media/${MID}/clean.${rev}.jpg`);
        expect(response.status).toBe(200);
      } finally {
        container.config.STORE = "fs";
      }
    },
  );

  it.each([
    "../etc/passwd",
    `profiles/../${PID}/media/${MID}/clean.0123456789.jpg`,
    `profiles/${PID}/media/${MID}/original`,
    `profiles/${PID}/media/${MID}/asset.json`,
    `profiles/${PID}/media/${MID}/clean.0123456789.mp4`,
    `profiles/${PID}/media/${MID}/web.0123456789.jpg`,
    `profiles/${PID}/media/${MID}/clean.012345678.jpg`,
    `profiles/${PID}/draft.json`,
    `profiles/ABCDEFGH/media/${MID}/clean.0123456789.jpg`,
    "",
  ])("answers 404 for a name outside the grammar: %s", async (path) => {
    const response = await get(path);
    expect(response.status).toBe(404);
    expect((await head(path)).status).toBe(404);
  });
});
