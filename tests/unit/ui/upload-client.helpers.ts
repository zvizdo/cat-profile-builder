import { vi } from "vitest";
import type { ActionResult } from "@/app/actions/_lib/guard";
import type { FinalizedUpload } from "@/app/actions/_lib/media";
import type { BeginUploadResult } from "@/adapters/pipeline/begin-upload";

// Shared fakes and fixtures for the `upload-client` test files (screenFile/happy-path,
// resume/retry/stall, and report tests — split for the 400-line file ceiling). Each test
// file imports this module and declares its own `vi.mock("@/app/actions/media", …)`, since
// mock factories are hoisted per file; that also means each test file gets its own module
// instance of `upload-client.ts`, with its own `pending` reports array.

/** The three Server Actions `upload-client.ts` calls, spied on so tests never hit the network. */
export const actions = {
  beginUpload: vi.fn<(input: unknown) => Promise<ActionResult<BeginUploadResult>>>(),
  finalizeUpload: vi.fn<(input: unknown) => Promise<ActionResult<FinalizedUpload>>>(),
  reportUploadEvent: vi.fn<(input: unknown) => Promise<unknown>>(),
};

type Handler =
  ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;

/** One scripted answer: a status, headers, a transport error (after `sent` bytes), or none at all. */
export interface Reply {
  status: number;
  headers?: Record<string, string>;
  error?: true;
  sent?: number;
  hang?: true;
  /** Progress events fired via `setTimeout` before answering (proves the watchdog resets). */
  progressAt?: { ms: number; loaded: number }[];
}

/** A scripted XMLHttpRequest: records what was sent and answers with the next scripted reply. */
export class FakeXhr {
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
    if (this.reply.progressAt) {
      const total = body instanceof Blob ? body.size : 0;
      for (const { ms, loaded } of this.reply.progressAt) {
        setTimeout(() => this.upload.onprogress?.({ lengthComputable: true, loaded, total }), ms);
      }
      const last = this.reply.progressAt[this.reply.progressAt.length - 1];
      setTimeout(
        () => {
          this.status = this.reply.status;
          this.onload?.();
        },
        (last?.ms ?? 0) + 1,
      );
      return;
    }
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
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: Math.round(total * 0.68),
          total,
        });
        this.upload.onprogress?.({ lengthComputable: true, loaded: total, total });
      }
      this.status = this.reply.status;
      this.onload?.();
    });
  }
}

export const PID = "abcdefgh";
export const file = new File([new Uint8Array(50)], "rain-day.mov", { type: "video/quicktime" });
export const ASSET = { id: "maaaaaab" } as unknown as FinalizedUpload["asset"];

export const GCS = {
  ok: true as const,
  mediaId: "maaaaaab",
  uploadUrl: "https://storage.googleapis.com/signed",
  method: "POST" as const,
  headers: { "x-goog-resumable": "start" },
};
export const SESSION = "https://storage.googleapis.com/session";
export const started: Reply = { status: 201, headers: { Location: SESSION } };
export const dropped: Reply = { status: 0, error: true };
export const landed = { ok: true as const, asset: ASSET, warnings: [] };
export const noSleep = () => vi.fn(async (_ms: number) => undefined);

/** Common `beforeEach`/`afterEach` setup, called from each test file. */
export function resetForTest(): void {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  FakeXhr.instances = [];
  FakeXhr.replies = [];
  actions.beginUpload.mockReset();
  actions.finalizeUpload.mockReset();
  actions.reportUploadEvent.mockReset();
  actions.reportUploadEvent.mockResolvedValue({ ok: true });
}
