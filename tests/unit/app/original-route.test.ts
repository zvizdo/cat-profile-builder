import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, type CookieReader } from "@/adapters/auth/session";
import { serveOriginal } from "@/app/api/_lib/original";
import { GET } from "@/app/api/profiles/[id]/media/[mid]/original/route";
import { photoAsset, PHOTO_ID, videoAsset, VIDEO_ID } from "../core/media/builders";
import { memoryLogger } from "../../fakes/logger";
import { createMemoryMediaStore } from "../../fakes/media-store";

// `GET /api/profiles/{id}/media/{mid}/original` (contracts/server-boundary.md; ADR-006):
// the private original of a video, for the trim editor only. Signed-in, `Range` honoured
// one range at a time, and a 404 for anything that is not a video of this cat — a photo's
// original is never served, to anyone.

const PID = "abcdefgh";
const SESSION = { sub: "shelter" as const, iat: 0, exp: 4_102_444_800 };
const readSession = async (cookies: CookieReader) =>
  cookies.get(SESSION_COOKIE) === undefined ? null : SESSION;

function deps() {
  return {
    mediaStore: createMemoryMediaStore({ publicBase: "https://cdn.test" }),
    logger: memoryLogger(),
    readSession,
  };
}

const routeDeps = deps();

vi.mock("@/adapters/container", () => ({
  getContainer: () => routeDeps,
}));

function get(mid: string, options: { range?: string; cookie?: boolean; pid?: string } = {}) {
  const headers = new Headers();
  if (options.cookie !== false) headers.set("cookie", `${SESSION_COOKIE}=t`);
  if (options.range !== undefined) headers.set("range", options.range);
  return new NextRequest(
    `http://localhost:3000/api/profiles/${options.pid ?? PID}/media/${mid}/original`,
    {
      headers,
    },
  );
}

const BYTES = new TextEncoder().encode("0123456789");

async function withVideo(d: ReturnType<typeof deps>) {
  await d.mediaStore.writeAsset(PID, VIDEO_ID, videoAsset());
  await d.mediaStore.putOriginal(PID, VIDEO_ID, BYTES);
}

describe("GET …/original", () => {
  it("streams the whole original of a video with its type, length and Accept-Ranges", async () => {
    const d = deps();
    await withVideo(d);
    const response = await serveOriginal(d, get(VIDEO_ID), { id: PID, mid: VIDEO_ID });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/quicktime");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("0123456789");
  });

  it("answers 206 with the slice and a Content-Range for a bytes=start-end range", async () => {
    const d = deps();
    await withVideo(d);
    const response = await serveOriginal(d, get(VIDEO_ID, { range: "bytes=2-4" }), {
      id: PID,
      mid: VIDEO_ID,
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("content-type")).toBe("video/quicktime");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("234");
  });

  it("runs an open-ended range to the end and clamps an end past it", async () => {
    const d = deps();
    await withVideo(d);
    const open = await serveOriginal(d, get(VIDEO_ID, { range: "bytes=7-" }), {
      id: PID,
      mid: VIDEO_ID,
    });
    expect(open.status).toBe(206);
    expect(open.headers.get("content-range")).toBe("bytes 7-9/10");
    expect(new TextDecoder().decode(await open.arrayBuffer())).toBe("789");

    const past = await serveOriginal(d, get(VIDEO_ID, { range: "bytes=8-100" }), {
      id: PID,
      mid: VIDEO_ID,
    });
    expect(past.headers.get("content-range")).toBe("bytes 8-9/10");

    // A suffix range, since the parser is the shared one (F23 review, finding 3).
    const suffix = await serveOriginal(d, get(VIDEO_ID, { range: "bytes=-3" }), {
      id: PID,
      mid: VIDEO_ID,
    });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("content-range")).toBe("bytes 7-9/10");
    expect(new TextDecoder().decode(await suffix.arrayBuffer())).toBe("789");
  });

  it("answers 416 with the size for a range it cannot satisfy or cannot read", async () => {
    const d = deps();
    await withVideo(d);
    for (const range of ["bytes=10-12", "bytes=5-2", "bytes=-0", "bytes=1-2,4-5", "items=1-2"]) {
      const response = await serveOriginal(d, get(VIDEO_ID, { range }), { id: PID, mid: VIDEO_ID });
      expect(response.status, range).toBe(416);
      expect(response.headers.get("content-range"), range).toBe("bytes */10");
    }
  });

  it("answers 404 for a photo — an original photo is never served", async () => {
    const d = deps();
    await d.mediaStore.writeAsset(PID, PHOTO_ID, photoAsset());
    await d.mediaStore.putOriginal(PID, PHOTO_ID, BYTES);
    const response = await serveOriginal(d, get(PHOTO_ID), { id: PID, mid: PHOTO_ID });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "There's no clip at this address." },
    });
  });

  it("answers 404 for a video record whose original is not there, or vanishes mid-request", async () => {
    const d = deps();
    await d.mediaStore.writeAsset(PID, VIDEO_ID, videoAsset());
    expect((await serveOriginal(d, get(VIDEO_ID), { id: PID, mid: VIDEO_ID })).status).toBe(404);
    await d.mediaStore.putOriginal(PID, VIDEO_ID, BYTES);
    d.mediaStore.readOriginal = async () => null;
    expect((await serveOriginal(d, get(VIDEO_ID), { id: PID, mid: VIDEO_ID })).status).toBe(404);
    d.mediaStore.readRange = async () => null;
    const range = await serveOriginal(d, get(VIDEO_ID, { range: "bytes=0-1" }), {
      id: PID,
      mid: VIDEO_ID,
    });
    expect(range.status).toBe(416);
  });

  it("answers 404 for a media id with no record, or one of another cat", async () => {
    const d = deps();
    await withVideo(d);
    expect((await serveOriginal(d, get("zzzzzzzz"), { id: PID, mid: "zzzzzzzz" })).status).toBe(
      404,
    );
    expect(
      (
        await serveOriginal(d, get(VIDEO_ID, { pid: "zyxwvuts" }), {
          id: "zyxwvuts",
          mid: VIDEO_ID,
        })
      ).status,
    ).toBe(404);
  });

  it("answers 400 for a malformed id and 401 without a session, before any lookup", async () => {
    const d = deps();
    let reads = 0;
    d.mediaStore.readAsset = async () => {
      reads += 1;
      return null;
    };
    const bad = await serveOriginal(d, get("../x"), { id: PID, mid: "../x" });
    expect(bad.status).toBe(400);
    const out = await serveOriginal(d, get(VIDEO_ID, { cookie: false }), {
      id: PID,
      mid: VIDEO_ID,
    });
    expect(out.status).toBe(401);
    expect(await out.json()).toEqual({
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
    expect(reads).toBe(0);
  });
});

describe("the route file", () => {
  it("hands the container, the request and the path ids to serveOriginal", async () => {
    await withVideo(routeDeps);
    const response = await GET(get(VIDEO_ID, { range: "bytes=0-1" }), {
      params: Promise.resolve({ id: PID, mid: VIDEO_ID }),
    });
    expect(response.status).toBe(206);
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("01");
  });
});
