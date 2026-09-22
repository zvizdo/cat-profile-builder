import { beginUpload, finalizeUpload, reportUploadEvent } from "@/app/actions/media";
import type { FinalizedUpload } from "@/app/actions/_lib/media";
import type { UploadEventInput } from "@/adapters/pipeline/report-upload-event";
import type { BeginUploadResult } from "@/adapters/pipeline/begin-upload";
import type { ErrorCode } from "@/core/errors";
import {
  ALLOWED_PHOTO_TYPES,
  ALLOWED_VIDEO_TYPES,
  checkDeclaredSize,
  UNSUPPORTED_MESSAGE,
} from "@/core/media/validation";
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

// The browser's half of an upload (ADR-005): `beginUpload` judges the size and signs the
// upload, the bytes go straight to that URL with progress, then `finalizeUpload` checks
// them and answers the record. `XMLHttpRequest` moves the bytes because `fetch` reports no
// upload progress. Every rule applied here — accepted types, the two caps, the sentences —
// comes from `core/media/validation`; nothing is judged twice in different words.
//
// A GCS upload that drops or stalls part-way asks storage how much arrived and sends the
// rest, up to three retries (`./resumable`). Every failure — and every rescue — is reported
// to the server log with `reportUploadEvent`, since the browser → storage step is invisible
// to the server otherwise.

/** What the file picker accepts: core's photo and video lists, joined for `accept`. */
export const ACCEPTED_TYPES = [...ALLOWED_PHOTO_TYPES, ...ALLOWED_VIDEO_TYPES].join(",");

/** The toast for bytes that did not arrive (CONTENT.md → Toasts, Error). */
export const UPLOAD_FAILED = "Upload failed. Nothing was added.";

/** Why an upload failed: a server code, or `network` when the bytes never landed. */
export type UploadFailureCode = ErrorCode | "network";

/** An upload that did not finish, with the sentence to show and the code to switch on. */
export class UploadFailure extends Error {
  readonly code: UploadFailureCode;

  constructor(code: UploadFailureCode, message: string) {
    super(message);
    this.name = "UploadFailure";
    this.code = code;
  }
}

/** The outcome of {@link screenFile}: send it, or refuse with core's code and sentence. */
export type FileScreen =
  { ok: true } | { ok: false; code: "unsupported" | "too_large"; message: string };

/**
 * The client-side refusal before `beginUpload` is called (FR-007, FR-008): a declared type
 * outside the accepted lists is `unsupported` with the formats named; a size over the cap
 * of its declared kind is `too_large` naming the cap. A file the browser could not type at
 * all goes through — the server's sniff decides what it is.
 */
export function screenFile(file: Pick<File, "type" | "size">): FileScreen {
  if (file.type !== "" && !ACCEPTED_TYPES.split(",").includes(file.type)) {
    return { ok: false, code: "unsupported", message: UNSUPPORTED_MESSAGE };
  }
  const size = checkDeclaredSize({ declaredType: file.type, byteSize: file.size });
  return size.ok ? size : { ok: false, code: "too_large", message: size.message };
}

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
    xhr.onload = () =>
      settle({ status: xhr.status, header: (name) => xhr.getResponseHeader(name) });
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
    // A resumed PUT can itself answer 308 (bytes lost again mid-request); that is not a
    // failure — it is checked again like any other retryable status, while retries remain.
    if (!isRetryable(answer.status) && answer.status !== 308) break;
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
  // The bar only sees bytes sent per-request; a send that finished by status check alone
  // (no final resend) never reported the last of the file, so it is reported here.
  if (ok) progress(file.size);
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
    return {
      ok,
      stage: "send",
      status: answer.status,
      attempts: 1,
      confirmedBytes: ok ? file.size : 0,
    };
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
  const done = await finalizeUpload({
    profileId,
    mediaId: begun.mediaId,
    fileName,
    declaredType,
  }).catch((error: unknown) => {
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
