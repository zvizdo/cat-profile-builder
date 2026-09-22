# Video Upload Resume and Trim Preview Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make long videos preview in the trim editor, make phone uploads resume after a dropped connection, and log every upload failure or rescue.

**Architecture:** A pure `capRange` rule in core limits every media range answer to 8 MiB, so no response crosses Cloud Run's 32 MiB limit. The browser upload client talks to the GCS resumable session through one `exchange` helper that never throws and abandons a request stalled for 30 s. After a drop it asks storage how much arrived and resends the rest, up to 3 retries. A new Server Action `reportUploadEvent` writes one structured log line per failure or rescue.

**Tech Stack:** Next.js App Router (Server Actions, route handlers), TypeScript, zod, Vitest (unit, component and contract), `XMLHttpRequest`, Google Cloud Storage resumable uploads, Terraform.

**Spec:** `docs/superpowers/specs/2026-09-22-video-upload-and-preview-fixes-design.md`

## Global Constraints

- Range cap: `MAX_RANGE_BYTES = 8 * 1024 * 1024` (8 MiB), defined once in `src/core/media/byte-range.ts`.
- Retries: `RETRY_DELAYS_MS = [1000, 4000, 15000]`, i.e. 3 retries. Retry only on status `0` (no answer, a transport error, an abort or a 30 s stall), `408`, `429` or `5xx`. Never retry any other `4xx`.
- Stall watchdog: `STALL_MS = 30_000`. A request with no progress for 30 s is aborted and treated as status `0`.
- Reports are best-effort and never awaited. A report that cannot be sent is held (at most 20) and sent after the next upload that lands. A rescue is reported after `finalizeUpload`, never before it.
- Only the GCS path (`method: "POST"`) resumes. The `PUT` path (fs dev store) sends once, as today.
- The toast text stays `Upload failed. Nothing was added.` (`UPLOAD_FAILED`).
- Never log a file name, a signed URL or a session URL (constitution, Logging and secrets). `UploadEventInputSchema` is a `z.strictObject` with no field that can carry them.
- `/original` answers a request with no `Range` as a capped `206` from byte 0. `/media` without `Range` stays a `200` of the whole file.
- Test first for every task (constitution, Principle II): write the test, watch it fail, then implement.
- Commits carry no `Co-Authored-By` or other AI attribution lines (user preference).
- Gates before claiming done: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`.
- Do not run `terraform apply`. The user runs or approves it (Task 7).

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/core/media/byte-range.ts` | modify | adds `MAX_RANGE_BYTES`, `capRange` |
| `src/app/api/_lib/original.ts` | modify | every answer is a capped `206` |
| `src/app/api/_lib/derived.ts` | modify | `206` answers capped |
| `src/ui/builder/resumable.ts` | create | pure resume rules + `wait` |
| `src/adapters/pipeline/report-upload-event.ts` | create | schema + the one log line |
| `src/app/actions/_lib/media.ts` | modify | `reportUploadEventWith` |
| `src/app/actions/media.ts` | modify | `reportUploadEvent` action |
| `src/ui/builder/upload-client.ts` | modify | `exchange`, resume loop, reports |
| `infra/terraform/buckets.tf` | modify | private bucket CORS headers |
| `specs/001-cat-profile-builder/contracts/server-boundary.md` | modify | contract rows |
| `tests/contract/server-boundary.test.ts` | modify | capped answers for `/original` and `/media` |
| other tests | modify/create | see each task |

---

### Task 1: `capRange` core rule

**Files:**
- Modify: `src/core/media/byte-range.ts`
- Test: `tests/unit/core/media/byte-range.test.ts`

**Interfaces:**
- Consumes: `ByteRange` from `src/core/ports` (`{ start: number; end: number }`, inclusive).
- Produces: `export const MAX_RANGE_BYTES: number` and `export function capRange(range: ByteRange): ByteRange`. The `end` passed in may be `Infinity` (an open-ended request); the result's end is then `start + MAX_RANGE_BYTES - 1`.

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/core/media/byte-range.test.ts` and extend its import to `import { capRange, MAX_RANGE_BYTES, parseByteRange, parseRangeHeader } from "@/core/media/byte-range";`:

```ts
describe("capRange", () => {
  it("is 8 MiB — well under Cloud Run's 32 MiB response limit", () => {
    expect(MAX_RANGE_BYTES).toBe(8 * 1024 * 1024);
  });

  it("leaves a range of at most MAX_RANGE_BYTES alone", () => {
    expect(capRange({ start: 0, end: 0 })).toEqual({ start: 0, end: 0 });
    expect(capRange({ start: 5, end: 99 })).toEqual({ start: 5, end: 99 });
    expect(capRange({ start: 0, end: MAX_RANGE_BYTES - 1 })).toEqual({
      start: 0,
      end: MAX_RANGE_BYTES - 1,
    });
  });

  it("pulls in the end of a longer range so it spans exactly MAX_RANGE_BYTES", () => {
    expect(capRange({ start: 0, end: MAX_RANGE_BYTES })).toEqual({
      start: 0,
      end: MAX_RANGE_BYTES - 1,
    });
    expect(capRange({ start: 100, end: 60_000_000 })).toEqual({
      start: 100,
      end: 100 + MAX_RANGE_BYTES - 1,
    });
  });

  it("caps an open-ended range (end = Infinity)", () => {
    expect(capRange({ start: 7, end: Infinity })).toEqual({
      start: 7,
      end: 7 + MAX_RANGE_BYTES - 1,
    });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `pnpm vitest run tests/unit/core/media/byte-range.test.ts`. Expected: FAIL (`capRange` is not exported).

- [ ] **Step 3: Implement.** Append to `src/core/media/byte-range.ts`:

```ts
/**
 * The most bytes any media route answers in one response (8 MiB). Cloud Run refuses an
 * HTTP/1 response over 32 MiB that declares its length, so a `<video>` asking for
 * `bytes=0-` of a 60 MB original got a `500`; a short `206` is always legal, and the
 * player asks for the next slice.
 */
export const MAX_RANGE_BYTES = 8 * 1024 * 1024;

/**
 * `range` with its end pulled in so it spans at most {@link MAX_RANGE_BYTES}. The end may
 * be `Infinity` (an open-ended request not yet clamped to a file); the start never moves.
 */
export function capRange(range: ByteRange): ByteRange {
  return { start: range.start, end: Math.min(range.end, range.start + MAX_RANGE_BYTES - 1) };
}
```

- [ ] **Step 4: Run it and confirm it passes.** Run `pnpm vitest run tests/unit/core/media/byte-range.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core/media/byte-range.ts tests/unit/core/media/byte-range.test.ts
git commit -m "feat(media): capRange limits a range answer to 8 MiB"
```

---

### Task 2: `/original` answers capped `206`s

**Files:**
- Modify: `src/app/api/_lib/original.ts`
- Modify: `specs/001-cat-profile-builder/contracts/server-boundary.md:52`
- Test: `tests/unit/app/original-route.test.ts`
- Test (contract): `tests/contract/server-boundary.test.ts`

**Interfaces:**
- Consumes: `capRange`, `MAX_RANGE_BYTES` (Task 1); `parseByteRange` (existing); `mediaStore.readRange(pid, mid, range): Promise<Uint8Array | null>` (existing, buffered).
- Produces: `serveOriginal` behaviour: with or without `Range`, a `206` of at most 8 MiB. `416` and error answers are unchanged. It no longer calls `mediaStore.readOriginal`.

- [ ] **Step 1: Update the tests first.** In `tests/unit/app/original-route.test.ts`:

  b) Replace the test `"streams the whole original of a video with its type, length and Accept-Ranges"` with:

```ts
  it("answers a request without Range as a 206 from the first byte, with type and Accept-Ranges", async () => {
    const d = deps();
    await withVideo(d);
    const response = await serveOriginal(d, get(VIDEO_ID), { id: PID, mid: VIDEO_ID });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/quicktime");
    expect(response.headers.get("content-range")).toBe("bytes 0-9/10");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("0123456789");
  });
```

  c) In `"answers 404 for a video record whose original is not there, or vanishes mid-request"`, replace the lines from `await d.mediaStore.putOriginal(PID, VIDEO_ID, BYTES);` to the end of the test with:

```ts
    await d.mediaStore.putOriginal(PID, VIDEO_ID, BYTES);
    d.mediaStore.readRange = async () => null;
    expect((await serveOriginal(d, get(VIDEO_ID), { id: PID, mid: VIDEO_ID })).status).toBe(416);
    const range = await serveOriginal(d, get(VIDEO_ID, { range: "bytes=0-1" }), {
      id: PID,
      mid: VIDEO_ID,
    });
    expect(range.status).toBe(416);
```

  Also rename that test to `"answers 404 for a video record whose original is not there, and 416 when it vanishes mid-request"`.

  d) The cap itself is contract (spec §1, Principle VI), so it goes in `tests/contract/server-boundary.test.ts`. Add imports as needed (skip any already there): `import { serveOriginal } from "@/app/api/_lib/original";`, `import { SESSION_COOKIE } from "@/adapters/auth/session";`, `import { MAX_RANGE_BYTES } from "@/core/media/byte-range";`, and add `videoAsset, VIDEO_ID` to the existing `../unit/core/media/builders` import. Then add this describe block after the `/media` one:

```ts
// `GET /api/profiles/{id}/media/{mid}/original` (2026-09-22): Cloud Run refuses an HTTP/1
// response over 32 MiB, so every answer is a 206 of at most MAX_RANGE_BYTES — with or
// without a Range — and the trim editor's <video> asks for the rest.
describe("GET /api/profiles/{id}/media/{mid}/original — capped answers", () => {
  const PID = "abcdefgh";
  const SESSION = { sub: "shelter" as const, iat: 0, exp: 4_102_444_800 };

  async function withOriginal(size: number) {
    const mediaStore = createMemoryMediaStore({ publicBase: "/media" });
    await mediaStore.writeAsset(PID, VIDEO_ID, videoAsset());
    await mediaStore.putOriginal(PID, VIDEO_ID, new Uint8Array(size));
    return { mediaStore, logger: memoryLogger(), readSession: async () => SESSION };
  }

  function get(range?: string) {
    const headers = new Headers({ cookie: `${SESSION_COOKIE}=t` });
    if (range !== undefined) headers.set("range", range);
    return new NextRequest(
      `http://localhost:3000/api/profiles/${PID}/media/${VIDEO_ID}/original`,
      { headers },
    );
  }

  it("206: never more than MAX_RANGE_BYTES, whether the Range is open-ended or absent", async () => {
    const size = MAX_RANGE_BYTES + 5;
    const deps = await withOriginal(size);
    const ids = { id: PID, mid: VIDEO_ID };
    for (const request of [get(), get("bytes=0-")]) {
      const response = await serveOriginal(deps, request, ids);
      expect(response.status).toBe(206);
      expect(response.headers.get("content-range")).toBe(`bytes 0-${MAX_RANGE_BYTES - 1}/${size}`);
      expect(response.headers.get("content-length")).toBe(String(MAX_RANGE_BYTES));
      expect((await response.arrayBuffer()).byteLength).toBe(MAX_RANGE_BYTES);
    }
    const rest = await serveOriginal(deps, get(`bytes=${MAX_RANGE_BYTES}-`), ids);
    expect(rest.headers.get("content-range")).toBe(`bytes ${MAX_RANGE_BYTES}-${size - 1}/${size}`);
    expect((await rest.arrayBuffer()).byteLength).toBe(5);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `pnpm vitest run tests/unit/app/original-route.test.ts tests/contract/server-boundary.test.ts`. Expected: FAIL. The no-`Range` test gets `200`, and the contract cap test gets a `content-range` ending at `size - 1`.

- [ ] **Step 3: Implement.** In `src/app/api/_lib/original.ts`:

  - Change the import to `import { capRange, parseByteRange } from "@/core/media/byte-range";`.
  - In `partial`, replace the body's first two lines and the `Content-Range` so the slice is capped:

```ts
  const range = parseByteRange(header, size);
  if (range !== null) {
    const capped = capRange(range);
    const slice = await deps.mediaStore.readRange(ids.pid, ids.mid, capped);
    if (slice !== null) {
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          "Content-Type": asset.mimeType,
          "Content-Length": String(slice.byteLength),
          "Content-Range": `bytes ${capped.start}-${capped.start + slice.byteLength - 1}/${size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
  }
```

  - In `serveOriginal`, replace everything from `const header = request.headers.get("range");` to the end of the `return new Response(stream, …)` statement with:

```ts
    // No `Range` is read as `bytes=0-`: a capped `206` is always a legal answer for a
    // resource that says `Accept-Ranges: bytes`, and the whole file never goes in one
    // response (Cloud Run refuses one over 32 MiB — the trim preview's 500s).
    const header = request.headers.get("range") ?? "bytes=0-";
    return await partial(deps, asset, { pid, mid }, header, size);
```

  - Update the doc comments: the file-top comment gains a sentence that every answer is a `206` of at most `MAX_RANGE_BYTES`. The `serveOriginal` comment's "the whole file as a `200` stream" becomes "the first slice as a `206` when no `Range` is sent". Remove the now-unused `readOriginal` mention.

- [ ] **Step 4: Run the tests and confirm they pass.** Run `pnpm vitest run tests/unit/app/original-route.test.ts tests/contract/server-boundary.test.ts`. Expected: PASS, including the `the route file` test (`bytes=0-1` → `"01"`).

- [ ] **Step 5: Update the contract.** In `specs/001-cat-profile-builder/contracts/server-boundary.md`, line 52, replace the Purpose cell with:

```
Streams the private original with `Range` support, for the trim editor only (ADR-006). Every answer is a `206` of at most 8 MiB (`MAX_RANGE_BYTES`) with `Content-Range`; a request without `Range` is answered as `bytes=0-` (Cloud Run refuses a response over 32 MiB). `416` with `Content-Range: bytes */size` for a range it cannot satisfy, or when the original vanishes between the size lookup and the read. `404` unless the asset is a video of this profile.
```

- [ ] **Step 6: Commit.**

```bash
git add src/app/api/_lib/original.ts tests/unit/app/original-route.test.ts tests/contract/server-boundary.test.ts specs/001-cat-profile-builder/contracts/server-boundary.md
git commit -m "fix(media): serve originals in capped 206 slices so long videos preview"
```

---

### Task 3: `/media` caps its `206` answers

**Files:**
- Modify: `src/app/api/_lib/derived.ts` (function `partial`)
- Modify: `specs/001-cat-profile-builder/contracts/server-boundary.md:53`
- Test (contract): `tests/contract/server-boundary.test.ts`

**Interfaces:**
- Consumes: `capRange`, `MAX_RANGE_BYTES` (Task 1); `mediaStore.readDerivedRange(pid, mid, kind, rev, range?)` (existing; clamps `end` to the last byte and accepts `end: Infinity`).
- Produces: every `206` from `serveDerived` spans at most 8 MiB. A `200` (no `Range`) is unchanged.

- [ ] **Step 1: Write the failing test.** In `tests/contract/server-boundary.test.ts` (import `MAX_RANGE_BYTES` from `@/core/media/byte-range` if Task 2 has not already), add inside `describe("GET and HEAD /media/profiles/{pid}/media/{mid}/{kind}.{rev}.{ext}", …)`:

```ts
  it("206: never more than MAX_RANGE_BYTES in one answer; a plain GET is still the whole file", async () => {
    const mediaStore = createMemoryMediaStore({ publicBase: "/media" });
    const size = MAX_RANGE_BYTES + 5;
    const rev = await mediaStore.writeDerived(PID, MID, "web", new Uint8Array(size));
    const name = `profiles/${PID}/media/${MID}/web.${rev}.mp4`;
    const deps = { mediaStore, logger: memoryLogger() };

    const open = await serveDerived(deps, request(name, { headers: { range: "bytes=0-" } }), name);
    expect(open.status).toBe(206);
    expect(open.headers.get("content-range")).toBe(`bytes 0-${MAX_RANGE_BYTES - 1}/${size}`);
    expect(open.headers.get("content-length")).toBe(String(MAX_RANGE_BYTES));
    expect((await open.arrayBuffer()).byteLength).toBe(MAX_RANGE_BYTES);

    const suffix = await serveDerived(
      deps,
      request(name, { headers: { range: `bytes=-${size}` } }),
      name,
    );
    expect(suffix.headers.get("content-range")).toBe(`bytes 0-${MAX_RANGE_BYTES - 1}/${size}`);

    const whole = await serveDerived(deps, request(name), name);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-length")).toBe(String(size));
  });
```

- [ ] **Step 2: Run it and confirm it fails.** Run `pnpm vitest run tests/contract/server-boundary.test.ts`. Expected: FAIL (`content-range` ends at `size - 1`).

- [ ] **Step 3: Implement.** In `src/app/api/_lib/derived.ts`:
  - Change the import to `import { capRange, parseRangeHeader, resolveRange, type RangeRequest } from "@/core/media/byte-range";`.
  - In `partial`, cap both reads:

```ts
  if ("start" in request) {
    slice = await read(deps, path, capRange({ start: request.start, end: request.end ?? Infinity }));
  } else {
    const whole = await read(deps, path);
    await discard(whole);
    const range = resolveRange(request, whole.size);
    if (range === null) return unsatisfiable(path, whole.size);
    slice = await read(deps, path, capRange(range));
  }
```

  - Add to the `partial` doc comment: "A slice never spans more than `MAX_RANGE_BYTES`; the player asks for the rest."

- [ ] **Step 4: Run the tests and confirm they pass.** Run `pnpm vitest run tests/unit/app/media-route.test.ts tests/contract/server-boundary.test.ts`. Expected: PASS.

- [ ] **Step 5: Update the contract.** In `server-boundary.md`, line 53, change `→ `206` with `Content-Range`` to `→ `206` with `Content-Range`, at most 8 MiB per answer (`MAX_RANGE_BYTES`; the player asks for the rest)`.

- [ ] **Step 6: Commit.**

```bash
git add src/app/api/_lib/derived.ts tests/contract/server-boundary.test.ts specs/001-cat-profile-builder/contracts/server-boundary.md
git commit -m "fix(media): cap /media range answers at 8 MiB"
```

---

### Task 4: Pure resume rules

**Files:**
- Create: `src/ui/builder/resumable.ts`
- Test: `tests/unit/ui/resumable.test.ts`

**Interfaces:**
- Produces (all exported from `@/ui/builder/resumable`):
  - `RETRY_DELAYS_MS: readonly number[]` = `[1000, 4000, 15000]`: three retries, about 20 s of patience for a phone switching networks.
  - `STALL_MS = 30_000`: a request with no progress for this long is abandoned (Task 6 uses it).
  - `isSuccess(status: number): boolean`: 2xx.
  - `isRetryable(status: number): boolean`: `0`, `408`, `429` or 5xx (GCS's own retry guidance).
  - `type ResumePoint = { done: true } | { offset: number } | { retry: true } | { fail: true }`
  - `parseResumeOffset(status: number, range: string | null, size: number): ResumePoint`
  - `statusCheckRange(size: number): string` → `bytes */{size}`
  - `resumeRange(offset: number, size: number): string` → `bytes {offset}-{size-1}/{size}`
  - `wait(ms: number): Promise<void>`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/ui/resumable.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRetryable,
  isSuccess,
  parseResumeOffset,
  resumeRange,
  RETRY_DELAYS_MS,
  STALL_MS,
  statusCheckRange,
  wait,
} from "@/ui/builder/resumable";

// The rules of resuming a GCS resumable upload (spec 2026-09-22, §2): what a status check's
// answer means, which failures earn a retry, and the Content-Range each request carries.

afterEach(() => {
  vi.useRealTimers();
});

describe("retry rules", () => {
  it("waits 1 s, 4 s, then 15 s — three retries — and gives up on a request stalled 30 s", () => {
    expect(RETRY_DELAYS_MS).toEqual([1000, 4000, 15000]);
    expect(STALL_MS).toBe(30_000);
  });

  it("retries no answer, a timeout, a rate limit and a 5xx — never another 4xx or a success", () => {
    for (const status of [0, 408, 429, 500, 503, 599]) expect(isRetryable(status), `${status}`).toBe(true);
    for (const status of [200, 308, 400, 403, 404, 410]) expect(isRetryable(status), `${status}`).toBe(false);
  });

  it("counts only a 2xx as success", () => {
    expect(isSuccess(200)).toBe(true);
    expect(isSuccess(201)).toBe(true);
    expect(isSuccess(299)).toBe(true);
    expect(isSuccess(308)).toBe(false);
    expect(isSuccess(0)).toBe(false);
  });
});

describe("parseResumeOffset", () => {
  it("resumes after the last byte storage has when it answers 308 with a Range", () => {
    expect(parseResumeOffset(308, "bytes=0-19", 50)).toEqual({ offset: 20 });
    expect(parseResumeOffset(308, " bytes=0-0 ", 50)).toEqual({ offset: 1 });
  });

  it("resumes from the first byte when a 308 carries no Range (nothing arrived)", () => {
    expect(parseResumeOffset(308, null, 50)).toEqual({ offset: 0 });
  });

  it("checks again when a 308 says every byte arrived but the object is not complete yet", () => {
    expect(parseResumeOffset(308, "bytes=0-49", 50)).toEqual({ retry: true });
  });

  it("is done when the status check answers 2xx — the object is complete", () => {
    expect(parseResumeOffset(200, null, 50)).toEqual({ done: true });
    expect(parseResumeOffset(201, null, 50)).toEqual({ done: true });
  });

  it("asks for another retry when the status check itself got no answer, a 429 or a 5xx", () => {
    expect(parseResumeOffset(0, null, 50)).toEqual({ retry: true });
    expect(parseResumeOffset(429, null, 50)).toEqual({ retry: true });
    expect(parseResumeOffset(503, null, 50)).toEqual({ retry: true });
  });

  it("fails on a gone session, any other 4xx, or a Range it cannot read", () => {
    expect(parseResumeOffset(404, null, 50)).toEqual({ fail: true });
    expect(parseResumeOffset(410, null, 50)).toEqual({ fail: true });
    expect(parseResumeOffset(308, "bytes=5-19", 50)).toEqual({ fail: true });
    expect(parseResumeOffset(308, "items=0-19", 50)).toEqual({ fail: true });
  });
});

describe("Content-Range values", () => {
  it("asks for status with an unknown range over the whole size", () => {
    expect(statusCheckRange(50)).toBe("bytes */50");
  });

  it("names the rest of the file from the offset", () => {
    expect(resumeRange(20, 50)).toBe("bytes 20-49/50");
    expect(resumeRange(0, 50)).toBe("bytes 0-49/50");
  });
});

describe("wait", () => {
  it("resolves after the given milliseconds", async () => {
    vi.useFakeTimers();
    let done = false;
    const waiting = wait(1000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(done).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `pnpm vitest run tests/unit/ui/resumable.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `src/ui/builder/resumable.ts`:

```ts
// The rules of resuming a Google Cloud Storage resumable upload (spec 2026-09-22, §2), kept
// pure so the upload client's loop reads as steps. A dropped `PUT` is followed by a status
// check — an empty `PUT` with `Content-Range: bytes */{size}` — whose answer says what to do
// next: `308` with `Range: bytes=0-N` means resume from `N + 1`, a `308` without `Range`
// means nothing arrived, a `2xx` means the object is already complete.

/** The wait before each retry: three retries, about 20 s for a phone to find a network. */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 4000, 15000];

/**
 * How long a request may go without progress before it is abandoned and treated as no
 * answer. A stalled mobile connection can hang for minutes without the browser reporting
 * an error; this turns that into a retry instead of a wait.
 */
export const STALL_MS = 30_000;

/** True for a 2xx answer. */
export function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * True for a failure worth retrying: no answer at all (`0`), a timeout (`408`), a rate
 * limit (`429`) or a 5xx — GCS's own retry guidance. Never any other 4xx.
 */
export function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || (status >= 500 && status < 600);
}

/** What a status check's answer means for the next step. */
export type ResumePoint = { done: true } | { offset: number } | { retry: true } | { fail: true };

/** GCS's `Range` on a 308: always from byte 0, up to the last byte it holds. */
const HELD = /^bytes=0-(\d+)$/;

/**
 * Reads a status check's answer for a file of `size` bytes: resume from an offset, done,
 * check again, or fail. A 308 claiming every byte is odd but not fatal — the object is not
 * complete yet — so it earns another check rather than a resend of nothing.
 */
export function parseResumeOffset(status: number, range: string | null, size: number): ResumePoint {
  if (isSuccess(status)) return { done: true };
  if (status === 308) {
    if (range === null) return { offset: 0 };
    const match = HELD.exec(range.trim());
    if (match === null) return { fail: true };
    const offset = Number(match[1]) + 1;
    return offset >= size ? { retry: true } : { offset };
  }
  return isRetryable(status) ? { retry: true } : { fail: true };
}

/** The `Content-Range` of a status check over a file of `size` bytes. */
export function statusCheckRange(size: number): string {
  return `bytes */${size}`;
}

/** The `Content-Range` of a resumed `PUT` carrying bytes `offset` to the end. */
export function resumeRange(offset: number, size: number): string {
  return `bytes ${offset}-${size - 1}/${size}`;
}

/** Resolves after `ms` milliseconds; the upload client's default pause between retries. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Run it and confirm it passes.** Run `pnpm vitest run tests/unit/ui/resumable.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/builder/resumable.ts tests/unit/ui/resumable.test.ts
git commit -m "feat(upload): pure rules for resuming a GCS resumable upload"
```

---

### Task 5: `reportUploadEvent` Server Action

**Files:**
- Create: `src/adapters/pipeline/report-upload-event.ts`
- Modify: `src/app/actions/_lib/media.ts`
- Modify: `src/app/actions/media.ts`
- Modify: `specs/001-cat-profile-builder/contracts/server-boundary.md` (Server Actions table, after the `finalizeUpload` row at line 37)
- Test: `tests/contract/server-boundary.media.test.ts`

**Interfaces:**
- Consumes: `withSession`, `GetCookies` (`src/app/actions/_lib/guard.ts`); `parseOrThrow` (`@/core/errors`); `ProfileIdSchema`, `MediaIdSchema` (`@/core/profile/schema`).
- Produces:
  - `UploadEventInputSchema` and `type UploadEventInput` from `@/adapters/pipeline/report-upload-event`. Fields: `profileId`, `mediaId`, `stage: "start" | "send" | "finalize"`, `outcome: "failed" | "resumed"`, `status` (int 0–599), `byteSize` (int > 0), `declaredType` (≤ 100 chars), `confirmedBytes` (int ≥ 0), `attempts` (int 1–10).
  - `reportUploadEvent(deps: Pick<Container, "logger">, input: UploadEventInput, userAgent: string): Promise<Record<never, never>>`: logs `warn` (failed) or `info` (resumed), message `"upload event"`, with fields `{ ...input, userAgent }` (`userAgent` cut to 300 chars).
  - `reportUploadEventWith(deps: MediaDeps, input: unknown, getCookies?: GetCookies, getUserAgent?: () => Promise<string>)` in `_lib/media.ts`.
  - The Server Action `reportUploadEvent(input: UploadEventInput): Promise<ActionResult<Record<never, never>>>` in `@/app/actions/media`. Task 6 imports it.

- [ ] **Step 1: Write the failing tests.** In `tests/contract/server-boundary.media.test.ts`:
  - Add `reportUploadEventWith` to the `@/app/actions/_lib/media` import and `reportUploadEvent` to the `@/app/actions/media` import.
  - In `"the exported actions read Next's cookies…"`, add before `vi.unstubAllEnvs();`:

```ts
    expect(await reportUploadEvent(EVENT)).toMatchObject(internal);
```

  - Add after the `TRIM` constant:

```ts
const EVENT = {
  profileId: PID,
  mediaId: MID,
  stage: "send" as const,
  outcome: "failed" as const,
  status: 0,
  byteSize: 61_346_637,
  declaredType: "video/quicktime",
  confirmedBytes: 20_000_000,
  attempts: 4,
};
const IPHONE = async () => "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)";
```

  - Add a new describe block at the end of the file:

```ts
describe("reportUploadEvent — the upload's own diagnostics (spec 2026-09-22, §3)", () => {
  it("logs a failure at warn with every field and the phone's user agent, and answers ok", async () => {
    const deps = mediaDeps();
    expect(await reportUploadEventWith(deps, EVENT, signedIn, IPHONE)).toEqual({ ok: true });
    expect(deps.logger.entries).toEqual([
      {
        level: "warn",
        msg: "upload event",
        fields: { ...EVENT, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" },
      },
    ]);
  });

  it("logs a rescue at info", async () => {
    const deps = mediaDeps();
    const rescued = {
      profileId: PID,
      mediaId: MID,
      stage: "start" as const,
      outcome: "resumed" as const,
      status: 201,
      byteSize: 8_905_917,
      declaredType: "video/mp4",
      confirmedBytes: 8_905_917,
      attempts: 2,
    };
    expect(await reportUploadEventWith(deps, rescued, signedIn, IPHONE)).toEqual({ ok: true });
    expect(deps.logger.entries[0]).toMatchObject({ level: "info", fields: rescued });
  });

  it("refuses any field it does not name — a file name or URL can never reach the log", async () => {
    const deps = mediaDeps();
    for (const extra of [
      { fileName: "rain-day.mov" },
      { url: "https://storage.googleapis.com/upload?upload_id=secret" },
    ]) {
      expect(await reportUploadEventWith(deps, { ...EVENT, ...extra }, signedIn, IPHONE)).toEqual(
        INVALID,
      );
    }
    expect(await reportUploadEventWith(deps, { ...EVENT, stage: "other" }, signedIn, IPHONE)).toEqual(
      INVALID,
    );
    expect(await reportUploadEventWith(deps, { ...EVENT, attempts: 0 }, signedIn, IPHONE)).toEqual(
      INVALID,
    );
    expect(
      await reportUploadEventWith(deps, { ...EVENT, mediaId: undefined }, signedIn, IPHONE),
    ).toEqual(INVALID);
    expect(deps.logger.entries.filter((entry) => entry.msg === "upload event")).toEqual([]);
  });

  it("answers unauthorized without a session and logs nothing", async () => {
    const deps = mediaDeps();
    expect(await reportUploadEventWith(deps, EVENT, signedOut, IPHONE)).toEqual(UNAUTHORIZED);
    expect(deps.logger.entries).toEqual([]);
  });

  it("keeps an absurdly long user agent to 300 characters", async () => {
    const deps = mediaDeps();
    await reportUploadEventWith(deps, EVENT, signedIn, async () => "x".repeat(5000));
    expect(deps.logger.entries[0]?.fields.userAgent).toBe("x".repeat(300));
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `pnpm vitest run tests/contract/server-boundary.media.test.ts`. Expected: FAIL (`reportUploadEventWith` is not exported).

- [ ] **Step 3: Implement the pipeline function.** Create `src/adapters/pipeline/report-upload-event.ts`:

```ts
import "server-only";
import { z } from "zod";
import type { Container } from "@/adapters/container";
import { MediaIdSchema, ProfileIdSchema } from "@/core/profile/schema";

// The upload's own diagnostics (spec 2026-09-22, §3). The bytes go from the browser straight
// to Cloud Storage, so when that step fails nothing on the server sees it; the browser tells
// us here instead, with one structured line: which step, what status, how far it got. The
// schema is strict and names no field that could carry a file name or a signed or session
// URL — those URLs are bearer credentials and must never be logged (constitution, Logging).

/** What the browser reports about one upload that failed, or that a retry rescued. */
export const UploadEventInputSchema = z.strictObject({
  profileId: ProfileIdSchema,
  mediaId: MediaIdSchema,
  stage: z.enum(["start", "send", "finalize"]),
  outcome: z.enum(["failed", "resumed"]),
  /** The last HTTP status seen; `0` when no answer came at all. */
  status: z.number().int().min(0).max(599),
  byteSize: z.number().int().positive(),
  declaredType: z.string().max(100),
  /** Bytes storage confirmed holding (or the whole file, once it did). */
  confirmedBytes: z.number().int().nonnegative(),
  attempts: z.number().int().min(1).max(10),
});

export type UploadEventInput = z.infer<typeof UploadEventInputSchema>;

/** What reporting takes from the container. */
export type ReportUploadEventDeps = Pick<Container, "logger">;

/** Longest user agent kept; enough to name the phone and browser, never a dump. */
const USER_AGENT_MAX = 300;

/**
 * Writes the one `upload event` line: `warn` for a failure, `info` for an upload a retry
 * saved, with the report's fields and the requesting browser's user agent. Writes nothing
 * else and answers nothing.
 */
export async function reportUploadEvent(
  deps: ReportUploadEventDeps,
  input: UploadEventInput,
  userAgent: string,
): Promise<Record<never, never>> {
  const fields = { ...input, userAgent: userAgent.slice(0, USER_AGENT_MAX) };
  if (input.outcome === "failed") deps.logger.warn(fields, "upload event");
  else deps.logger.info(fields, "upload event");
  return {};
}
```

- [ ] **Step 4: Implement the action logic.** In `src/app/actions/_lib/media.ts`:
  - Add imports:

```ts
import { headers } from "next/headers";
import {
  reportUploadEvent,
  UploadEventInputSchema,
} from "@/adapters/pipeline/report-upload-event";
```

  - Change `"the seven media Server Actions"` in the file-top comment to `"the media Server Actions"`.
  - Append:

```ts
/** How the report reaches the browser's user agent; the request's header in the app. */
export type GetUserAgent = () => Promise<string>;

const requestUserAgent: GetUserAgent = async () => (await headers()).get("user-agent") ?? "";

/** Logs one upload failure or rescue the browser saw (spec 2026-09-22, §3). */
export function reportUploadEventWith(
  deps: MediaDeps,
  input: unknown,
  getCookies?: GetCookies,
  getUserAgent: GetUserAgent = requestUserAgent,
): Promise<ActionResult<Record<never, never>>> {
  return withSession(
    deps,
    async () =>
      reportUploadEvent(deps, parseOrThrow(UploadEventInputSchema, input), await getUserAgent()),
    getCookies,
  )();
}
```

- [ ] **Step 5: Export the action.** In `src/app/actions/media.ts`:
  - Add `import type { UploadEventInput } from "@/adapters/pipeline/report-upload-event";` and add `reportUploadEventWith` to the `_lib/media` import list.
  - Change `// The seven media Server Actions` to `// The media Server Actions`.
  - Append:

```ts
/** Logs one upload the browser saw fail, or saw a retry rescue; answers nothing (spec 2026-09-22). */
export async function reportUploadEvent(
  input: UploadEventInput,
): Promise<ActionResult<Record<never, never>>> {
  return reportUploadEventWith(getContainer(), input);
}
```

- [ ] **Step 6: Run the tests and confirm they pass.** Run `pnpm vitest run tests/contract/server-boundary.media.test.ts`. Expected: PASS.

- [ ] **Step 7: Update the contract.** In `server-boundary.md`, insert after the `finalizeUpload` row (line 37):

```
| `reportUploadEvent` | `{ profileId, mediaId, stage: "start" \| "send" \| "finalize", outcome: "failed" \| "resumed", status, byteSize, declaredType, confirmedBytes, attempts }` | `{}` | Diagnostics only (2026-09-22): writes one `upload event` log line — `warn` for `failed`, `info` for `resumed` — with the fields and the request's `User-Agent` (≤ 300 chars). Strict schema: any other field is `invalid`, so a file name or signed/session URL can never be logged. The browser sends it without awaiting; a report that cannot be sent is held and resent after the next upload that lands — best-effort, so a failure while the network stays down may never arrive. |
```

- [ ] **Step 8: Commit.**

```bash
git add src/adapters/pipeline/report-upload-event.ts src/app/actions/_lib/media.ts src/app/actions/media.ts tests/contract/server-boundary.media.test.ts specs/001-cat-profile-builder/contracts/server-boundary.md
git commit -m "feat(upload): reportUploadEvent logs upload failures and rescues"
```

---

### Task 6: Upload client resumes, watches for stalls, and reports

**Files:**
- Modify: `src/ui/builder/upload-client.ts`
- Test: `tests/unit/ui/upload-client.test.ts`

**Interfaces:**
- Consumes: everything from `@/ui/builder/resumable` (Task 4), including `STALL_MS`; the `reportUploadEvent` action and `type UploadEventInput` (Task 5; `mediaId` is required).
- Produces: `UploadFileInput` gains `sleep?: (ms: number) => Promise<void>` (defaults to `wait`, and tests pass a spy). `uploadFile`'s return type and the `UploadFailure` shape are unchanged, so `use-upload-queue.ts` needs no change.

**Behaviour this task adds (spec §2, §3):**
- `exchange` never rejects. A transport error, an abort, or **no progress for `STALL_MS` (30 s)** all become status `0`. The stall watchdog calls `xhr.abort()`, so a hung mobile request turns into a retry instead of a wait of minutes.
- The GCS path retries the start and resumes the send (Task 4 rules). A resumed slice keeps the file's type: `file.slice(offset, file.size, file.type)`.
- Reports are **held, then flushed**. A failure is held and sent at once. If that send rejects (the network is probably still down), the report is held again and goes out after the next upload that lands (e.g. after `Try again`). A rescue (`resumed`) is sent **after** `finalizeUpload`, so a report never queues ahead of finalize (Next runs one client's Server Actions one at a time). At most 20 reports are held; the oldest is dropped past that. The rejection handler is not empty: it re-holds the event.

- [ ] **Step 1: Update the fake and the mock.** In `tests/unit/ui/upload-client.test.ts`:
  - Add `reportUploadEvent: vi.fn<(input: unknown) => Promise<unknown>>(),` to `actions`, `reportUploadEvent: (input: unknown) => actions.reportUploadEvent(input),` to the `vi.mock` factory, and in `beforeEach`: `actions.reportUploadEvent.mockReset(); actions.reportUploadEvent.mockResolvedValue({ ok: true });`. In `afterEach`, add `vi.useRealTimers();`.
  - Replace the `FakeXhr` class with this version. It adds `sent` (progress before an error), `hang` (never answers) and `abort()`:

```ts
/** One scripted answer: a status, headers, a transport error (after `sent` bytes), or none at all. */
interface Reply {
  status: number;
  headers?: Record<string, string>;
  error?: true;
  sent?: number;
  hang?: true;
}

/** A scripted XMLHttpRequest: records what was sent and answers with the next scripted reply. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  static replies: Reply[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = undefined;
  status = 0;
  aborted = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload: { onprogress: Handler } = { onprogress: null };
  private reply: Reply = { status: 200 };

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  getResponseHeader(name: string): string | null {
    return this.reply.headers?.[name] ?? null;
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  send(body: unknown) {
    this.body = body;
    this.reply = FakeXhr.replies.shift() ?? { status: 200 };
    if (this.reply.hang) return;
    queueMicrotask(() => {
      const total = body instanceof Blob ? body.size : 0;
      if (this.reply.error) {
        if (this.reply.sent !== undefined) {
          this.upload.onprogress?.({ lengthComputable: true, loaded: this.reply.sent, total });
        }
        this.onerror?.();
        return;
      }
      if (body instanceof Blob) {
        this.upload.onprogress?.({ lengthComputable: true, loaded: Math.round(total * 0.68), total });
        this.upload.onprogress?.({ lengthComputable: true, loaded: total, total });
      }
      this.status = this.reply.status;
      this.onload?.();
    });
  }
}
```

  (For the 50-byte file a clean send still reports 34 then 50, so the existing `[[68], [100]]` expectation holds.)

  - Add `import { STALL_MS } from "@/ui/builder/resumable";` and these helpers after `ASSET`:

```ts
const GCS = {
  ok: true as const,
  mediaId: "maaaaaab",
  uploadUrl: "https://storage.googleapis.com/signed",
  method: "POST" as const,
  headers: { "x-goog-resumable": "start" },
};
const SESSION = "https://storage.googleapis.com/session";
const started: Reply = { status: 201, headers: { Location: SESSION } };
const dropped: Reply = { status: 0, error: true };
const landed = { ok: true as const, asset: ASSET, warnings: [] };
const noSleep = () => vi.fn(async (_ms: number) => undefined);
```

- [ ] **Step 2: Write the failing tests.** Add inside `describe("uploadFile", …)`:

```ts
  it("resumes a dropped PUT from the byte storage confirmed, and reports the rescue after finalize", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [
      started,
      { status: 0, error: true, sent: 45 },
      { status: 308, headers: { Range: "bytes=0-19" } },
      { status: 200 },
    ];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    const sleep = noSleep();
    const onProgress = vi.fn();

    await uploadFile({ profileId: PID, file, onProgress, sleep });

    const [, first, check, resumed] = FakeXhr.instances;
    expect(first).toMatchObject({ method: "PUT", url: SESSION, body: file });
    expect(check).toMatchObject({
      method: "PUT",
      url: SESSION,
      headers: { "Content-Range": "bytes */50" },
      body: null,
    });
    expect(resumed?.headers).toEqual({ "Content-Range": "bytes 20-49/50" });
    expect((resumed?.body as Blob).size).toBe(30);
    expect((resumed?.body as Blob).type).toBe("video/quicktime");
    expect(sleep.mock.calls).toEqual([[1000]]);
    // 45 of 50 showed 90%; the resend from byte 20 passes 40 (80%) silently — never backwards.
    expect(onProgress.mock.calls).toEqual([[90], [100]]);
    expect(actions.reportUploadEvent).toHaveBeenCalledWith({
      profileId: PID,
      mediaId: "maaaaaab",
      stage: "send",
      outcome: "resumed",
      status: 200,
      byteSize: 50,
      declaredType: "video/quicktime",
      confirmedBytes: 50,
      attempts: 2,
    });
    const [finalized] = actions.finalizeUpload.mock.invocationCallOrder;
    const [reported] = actions.reportUploadEvent.mock.invocationCallOrder;
    expect(finalized).toBeLessThan(reported ?? 0);
  });

  it("resends from the first byte when the status check's 308 names no Range", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, dropped, { status: 308 }, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);

    await uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() });

    const resumed = FakeXhr.instances[3];
    expect(resumed?.headers).toEqual({ "Content-Range": "bytes 0-49/50" });
    expect((resumed?.body as Blob).size).toBe(50);
  });

  it("goes straight to finalize when the status check says the object is complete", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, dropped, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);

    await uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() });

    expect(FakeXhr.instances).toHaveLength(3);
    expect(actions.finalizeUpload).toHaveBeenCalledOnce();
  });

  it("abandons a PUT that makes no progress for 30 s and resumes it", async () => {
    vi.useFakeTimers();
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 0, hang: true }, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);

    const upload = uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() });
    await vi.advanceTimersByTimeAsync(STALL_MS);
    await upload;

    expect(FakeXhr.instances[1]?.aborted).toBe(true);
    expect(actions.finalizeUpload).toHaveBeenCalledOnce();
  });

  it("does not retry a 4xx, fails with the usual toast, and reports it", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 403 }];
    const sleep = noSleep();

    await expect(
      uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep }),
    ).rejects.toMatchObject({ code: "network", message: UPLOAD_FAILED });

    expect(sleep).not.toHaveBeenCalled();
    expect(actions.finalizeUpload).not.toHaveBeenCalled();
    expect(actions.reportUploadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "send", outcome: "failed", status: 403, attempts: 1 }),
    );
  });

  it("gives up after three retries at 1 s, 4 s and 15 s, reporting how far it got", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    const held: Reply = { status: 308, headers: { Range: "bytes=0-9" } };
    FakeXhr.replies = [started, dropped, held, dropped, held, dropped, held, dropped];
    const sleep = noSleep();

    await expect(
      uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep }),
    ).rejects.toMatchObject({ code: "network", message: UPLOAD_FAILED });

    expect(sleep.mock.calls).toEqual([[1000], [4000], [15000]]);
    expect(actions.reportUploadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "send",
        outcome: "failed",
        status: 0,
        confirmedBytes: 10,
        attempts: 4,
      }),
    );
  });

  it("retries a session start that got no answer, and reports the rescue at the start", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [dropped, started, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    const sleep = noSleep();

    await uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep });

    expect(sleep.mock.calls).toEqual([[1000]]);
    expect(actions.reportUploadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "start", outcome: "resumed", status: 201, attempts: 2 }),
    );
  });

  it("reports a finalize call that never answered, then fails as before", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 200 }];
    actions.finalizeUpload.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() }),
    ).rejects.toBeInstanceOf(TypeError);

    expect(actions.reportUploadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "finalize", outcome: "failed", status: 0, confirmedBytes: 50 }),
    );
  });

  it("keeps a report it could not send and sends it after the next upload lands", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 403 }];
    actions.reportUploadEvent.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(
      uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() }),
    ).rejects.toMatchObject({ message: UPLOAD_FAILED });
    expect(actions.reportUploadEvent).toHaveBeenCalledTimes(1);

    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    await uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() });

    expect(actions.reportUploadEvent).toHaveBeenCalledTimes(2);
    expect(actions.reportUploadEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: "send", outcome: "failed", status: 403 }),
    );
  });

  it("sends no report for an upload that worked first time", async () => {
    actions.beginUpload.mockResolvedValueOnce(GCS);
    FakeXhr.replies = [started, { status: 200 }];
    actions.finalizeUpload.mockResolvedValueOnce(landed);
    await uploadFile({ profileId: PID, file, onProgress: vi.fn(), sleep: noSleep() });
    expect(actions.reportUploadEvent).not.toHaveBeenCalled();
  });
```

  Also, in the existing test `"treats a non-2xx upload answer, and a session with no Location, as the same failure"`, add after the second `rejects` assertion:

```ts
    expect(actions.reportUploadEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: "start", outcome: "failed", status: 201 }),
    );
```

- [ ] **Step 3: Run the tests and confirm they fail.** Run `pnpm vitest run tests/unit/ui/upload-client.test.ts`. Expected: FAIL. That covers the new tests and the edited `"treats a non-2xx…"` test (no reports, resume or watchdog yet). The other existing tests still pass.

- [ ] **Step 4: Implement.** Rewrite the transport half of `src/ui/builder/upload-client.ts`. Keep everything above `interface Request` (imports aside, plus `ACCEPTED_TYPES`, `UPLOAD_FAILED`, `UploadFailure`, `screenFile`) as is.
  - Imports: add `reportUploadEvent` to the `@/app/actions/media` import. Add `import type { UploadEventInput } from "@/adapters/pipeline/report-upload-event";` and:

```ts
import {
  isRetryable,
  isSuccess,
  parseResumeOffset,
  resumeRange,
  RETRY_DELAYS_MS,
  STALL_MS,
  statusCheckRange,
  wait,
} from "./resumable";
```

  - Update the file-top comment. Add: "A GCS upload that drops or stalls part-way asks storage how much arrived and sends the rest, up to three retries (`./resumable`). Every failure — and every rescue — is reported to the server log with `reportUploadEvent`, since the browser → storage step is invisible to the server otherwise."
  - Replace `interface Request`, `send`, `sendBytes` and `uploadFile` with:

```ts
interface Request {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Blob | null;
  /** Bytes of this request's body sent so far. */
  onSent?: (loaded: number) => void;
}

/** How one XHR ended: its status (`0` when no answer came) and a reader for its headers. */
interface Answer {
  status: number;
  header: (name: string) => string | null;
}

const NO_ANSWER: Answer = { status: 0, header: () => null };

/**
 * One request over XHR. Never rejects: a transport error, an abort, or a request that made
 * no progress for {@link STALL_MS} is status `0`. The stall watchdog is what turns a hung
 * mobile connection — which may never report an error — into a retry instead of a long wait.
 */
function exchange(request: Request): Promise<Answer> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const settle = (answer: Answer) => {
      clearTimeout(stall);
      resolve(answer);
    };
    const watch = () => {
      clearTimeout(stall);
      stall = setTimeout(() => xhr.abort(), STALL_MS);
    };
    xhr.open(request.method, request.url);
    for (const [name, value] of Object.entries(request.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      watch();
      if (event.lengthComputable) request.onSent?.(event.loaded);
    };
    xhr.onerror = () => settle(NO_ANSWER);
    xhr.onabort = () => settle(NO_ANSWER);
    xhr.onload = () => settle({ status: xhr.status, header: (name) => xhr.getResponseHeader(name) });
    watch();
    xhr.send(request.body);
  });
}

/** What moving the bytes came to: the step it ended on, how, and how far it got. */
interface Sent {
  ok: boolean;
  stage: "start" | "send";
  status: number;
  attempts: number;
  confirmedBytes: number;
}

type Sleep = (ms: number) => Promise<void>;

/** A progress reporter over the whole file that never moves backwards. */
function progressOver(size: number, onProgress: (percent: number) => void) {
  let shown = 0;
  return (bytes: number) => {
    const percent = Math.round((bytes / size) * 100);
    if (percent > shown) {
      shown = percent;
      onProgress(percent);
    }
  };
}

/** `send` once, then again after each delay while the answer is worth retrying. */
async function retrying(send: () => Promise<Answer>, sleep: Sleep) {
  let answer = await send();
  let attempts = 1;
  for (const delay of RETRY_DELAYS_MS) {
    if (!isRetryable(answer.status)) break;
    await sleep(delay);
    attempts += 1;
    answer = await send();
  }
  return { answer, attempts };
}

/**
 * The bytes to a GCS resumable session: the whole file, then — after a drop, a stall or a
 * retryable status — a status check and the rest from the first byte storage lacks, up to
 * three retries. `status` is the last answer seen: the send's, or the check's when the
 * check is what failed.
 */
async function sendToSession(
  session: string,
  file: File,
  progress: (bytes: number) => void,
  sleep: Sleep,
): Promise<Omit<Sent, "stage">> {
  // The first send is the whole file with no Content-Range, as it always was; a resend —
  // even one from byte 0, after a 308 naming no Range — names its range and keeps the type.
  const put = (offset: number, resuming: boolean) =>
    exchange({
      method: "PUT",
      url: session,
      headers: resuming ? { "Content-Range": resumeRange(offset, file.size) } : {},
      body: resuming ? file.slice(offset, file.size, file.type) : file,
      onSent: (loaded) => progress(offset + loaded),
    });
  let answer = await put(0, false);
  let attempts = 1;
  let confirmed = 0;
  for (const delay of RETRY_DELAYS_MS) {
    if (!isRetryable(answer.status)) break;
    await sleep(delay);
    attempts += 1;
    const check = await exchange({
      method: "PUT",
      url: session,
      headers: { "Content-Range": statusCheckRange(file.size) },
      body: null,
    });
    const point = parseResumeOffset(check.status, check.header("Range"), file.size);
    if (!("offset" in point)) {
      answer = check;
      if ("retry" in point) continue;
      break;
    }
    confirmed = point.offset;
    answer = await put(point.offset, true);
  }
  const ok = isSuccess(answer.status);
  return { ok, status: answer.status, attempts, confirmedBytes: ok ? file.size : confirmed };
}

/**
 * The bytes to where `beginUpload` said (ADR-005 step 2). A `PUT` (the fs dev store) is
 * sent once, as it always was. A `POST` is a GCS resumable start, retried when it got no
 * answer or a retryable status; the session URL it answers in `Location` then takes the bytes.
 */
async function sendBytes(
  upload: BeginUploadResult,
  file: File,
  onProgress: (percent: number) => void,
  sleep: Sleep,
): Promise<Sent> {
  const progress = progressOver(file.size, onProgress);
  if (upload.method === "PUT") {
    const answer = await exchange({
      method: "PUT",
      url: upload.uploadUrl,
      headers: upload.headers,
      body: file,
      onSent: progress,
    });
    const ok = isSuccess(answer.status);
    return { ok, stage: "send", status: answer.status, attempts: 1, confirmedBytes: ok ? file.size : 0 };
  }
  const start = await retrying(
    () => exchange({ method: "POST", url: upload.uploadUrl, headers: upload.headers, body: null }),
    sleep,
  );
  const session = start.answer.header("Location");
  const began = { stage: "start" as const, status: start.answer.status, attempts: start.attempts };
  if (!isSuccess(start.answer.status) || session === null) {
    return { ...began, ok: false, confirmedBytes: 0 };
  }
  const sent = await sendToSession(session, file, progress, sleep);
  // A rescue is reported at the step that needed it: the send's, else the start's.
  if (sent.ok && sent.attempts === 1 && start.attempts > 1) {
    return { ...began, ok: true, confirmedBytes: file.size };
  }
  return { ...sent, stage: "send" };
}

/** Reports not yet delivered, kept for the next upload that lands. */
const pending: UploadEventInput[] = [];

/** Most reports held at once; past it the oldest is let go. */
const MAX_PENDING = 20;

/** Holds `event` until the next {@link flushReports}. */
function hold(event: UploadEventInput): void {
  pending.push(event);
  if (pending.length > MAX_PENDING) pending.shift();
}

/**
 * Sends every held report, never awaited: diagnostics must not slow an upload. A report
 * that cannot be sent — most often because the network that failed the upload is still
 * down — is held again, and goes out after the next upload that lands.
 */
function flushReports(): void {
  for (const event of pending.splice(0)) {
    reportUploadEvent(event).catch(() => hold(event));
  }
}

/** What one upload needs: the cat, the file, where to report progress, and how to pause. */
export interface UploadFileInput {
  profileId: string;
  file: File;
  onProgress: (percent: number) => void;
  /** The pause between retries; `wait` in the app, a spy in tests. */
  sleep?: Sleep;
}

/**
 * Begin → bytes → finalize, for one file. Answers the finished record's view and any
 * warnings; throws {@link UploadFailure} with the action's own code and sentence when the
 * server refuses at either end, or `network` with {@link UPLOAD_FAILED} when the bytes did
 * not land after the retries. A failure is reported at once; a rescue by retry is reported
 * after finalize, so its report never queues ahead of it.
 */
export async function uploadFile(input: UploadFileInput): Promise<FinalizedUpload & { ok: true }> {
  const { profileId, file, sleep = wait } = input;
  const fileName = file.name;
  const declaredType = file.type;
  const begun = await beginUpload({ profileId, fileName, byteSize: file.size, declaredType });
  if (!begun.ok) throw new UploadFailure(begun.error.code, begun.error.message);
  const event = { profileId, mediaId: begun.mediaId, byteSize: file.size, declaredType };
  const { ok, ...facts } = await sendBytes(begun, file, input.onProgress, sleep);
  if (!ok) {
    hold({ ...event, ...facts, outcome: "failed" });
    flushReports();
    throw new UploadFailure("network", UPLOAD_FAILED);
  }
  const done = await finalizeUpload({ profileId, mediaId: begun.mediaId, fileName, declaredType })
    .catch((error: unknown) => {
      const lost = { stage: "finalize", status: 0, attempts: 1, confirmedBytes: file.size } as const;
      hold({ ...event, ...lost, outcome: "failed" });
      flushReports();
      throw error;
    });
  if (facts.attempts > 1) hold({ ...event, ...facts, outcome: "resumed" });
  flushReports();
  if (!done.ok) throw new UploadFailure(done.error.code, done.error.message);
  return done;
}
```

- [ ] **Step 5: Run the tests and confirm they pass.** Run `pnpm vitest run tests/unit/ui/upload-client.test.ts tests/component/builder/MediaLibrary.upload.test.tsx`. Expected: PASS. (`MediaLibrary.upload` fakes `uploadFile`, so it never reaches the new code. It is run only to confirm nothing around it broke.)

- [ ] **Step 6: Lint the file.** Run `pnpm lint`. `sendToSession`, `sendBytes` and `uploadFile` must stay within `max-lines-per-function` 50 and `complexity` 10. If `sendToSession` warns, move the status check and its reading into `async function checkSession(session: string, size: number): Promise<{ check: Answer; point: ResumePoint }>` in the same file (import `type ResumePoint` from `./resumable`). Then run `pnpm format`.

- [ ] **Step 7: Commit.**

```bash
git add src/ui/builder/upload-client.ts tests/unit/ui/upload-client.test.ts
git commit -m "fix(upload): resume dropped or stalled GCS uploads and report them to the log"
```

---

### Task 7: Bucket CORS for the resume headers

**Files:**
- Modify: `infra/terraform/buckets.tf:39`
- Modify: `infra/terraform/README.md` (only if it lists the CORS headers; check with `grep -n "response_header\|x-goog-if-generation-match" infra/terraform/README.md`)

- [ ] **Step 1: Edit.** In the private bucket's `cors` block, replace the `response_header` line with:

```hcl
    # `Content-Range` is sent on a resumed upload's status check and resend; `Range` is read
    # off the 308 that says how much arrived (spec 2026-09-22, §4). GCS uses this one list for
    # both the headers a browser may send and the ones it may read.
    response_header = ["Content-Type", "Location", "Range", "Content-Range", "x-goog-resumable", "x-goog-content-length-range", "x-goog-if-generation-match"]
```

- [ ] **Step 2: Check it parses.** Run `terraform -chdir=infra/terraform fmt -check && terraform -chdir=infra/terraform validate`. Expected: no output from `fmt -check`, then `Success! The configuration is valid.`.

- [ ] **Step 3: Show the plan, do not apply.** Run `terraform -chdir=infra/terraform plan -target='google_storage_bucket.private' -out=cors.tfplan`. Expected: 1 to change (in place), 0 to add, 0 to destroy, with only the `cors.response_header` diff. **Stop and ask the user before running `terraform apply cors.tfplan`.** It changes a live bucket. It must be applied before the app deploy, or resumes fail CORS in the browser. Delete `cors.tfplan` afterwards (never commit it).

- [ ] **Step 4: Commit.**

```bash
git add infra/terraform/buckets.tf
git commit -m "infra: allow Range/Content-Range on the private bucket for resumed uploads"
```

---

### Task 8: Gates and handoff

- [ ] **Step 1: Run every gate.**

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
```

Expected: all pass, and coverage thresholds hold. Paste the tail of the output in the handoff. If one fails, fix it in the task it belongs to, then re-run.

- [ ] **Step 2: End-to-end suite.** Run `pnpm build && pnpm test:e2e`. Expected: PASS. `tests/e2e/media.spec.ts` uploads through the fs `PUT` path, which is unchanged. It proves the trim editor still loads with the capped `/original`.

- [ ] **Step 3: Hand off the manual checks** (these need the deploy, which the user runs):
  1. `terraform apply` of the CORS plan (Task 7).
  2. Deploy the app.
  3. On an iPhone (Safari) and an Android phone (Chrome), open the trim editor for a video over 32 MB. It must play. In Cloud Run logs, `/original` requests answer `206`, and there are no `Response size was too large` lines.
  4. Upload a long video, turn airplane mode on for about 3 s mid-upload, then off. It must land with no toast, and one `upload event` line with `outcome: "resumed"` must appear:
     `gcloud logging read 'resource.labels.service_name="south-county-cats-adopt" AND jsonPayload.msg="upload event"' --limit 20 --freshness=1d`
