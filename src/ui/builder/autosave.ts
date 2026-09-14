import { z } from "zod";
import type { ProfileDocument } from "@/core/profile/schema";

// The draft autosave (FR-023, FR-024; ADR-015 → Draft saves). The browser owns the
// working document; this sends the whole of it to `PUT /api/profiles/{id}/draft` one
// second after the last change and no later than five seconds after the first, and at
// once with `keepalive` when the page hides. Every failure keeps the local copy (FR-027):
// the scheduler never drops a document, it only reports.

/** What one send came to. `terminal` means stop: the cat no longer exists. */
export type SendResult =
  { ok: true; updatedAt: string } | { ok: false; message: string; terminal: boolean };

/**
 * What the scheduler needs: the send, and where to report that it started and how it
 * went — with the document that was sent, so the caller can tell a save for the current
 * document from one for an older one.
 */
export interface AutosaveOptions {
  send: (doc: ProfileDocument, keepalive: boolean) => Promise<SendResult>;
  onStart: () => void;
  onResult: (result: SendResult, doc: ProfileDocument) => void;
}

/**
 * The scheduler: `touch` after every change, `flush` when the page is about to go or
 * before a publish, `retry` when the connection is back (the `online` event).
 */
export interface Autosave {
  touch: (doc: ProfileDocument) => void;
  /**
   * Sends what is pending at once and settles once nothing is in flight: with the outcome
   * of the last send it waited on, or `null` when there was nothing to send.
   */
  flush: () => Promise<SendResult | null>;
  retry: () => void;
}

/** How long after the last change a save goes out. GCS takes about one write a second. */
export const DEBOUNCE_MS = 1000;

/** The longest a change waits while edits keep coming (FR-023: at least every five seconds). */
export const MAX_WAIT_MS = 5000;

/** The longest a failed save waits before it is tried again. */
export const RETRY_CAP_MS = 30_000;

/** The sentence for a send that never reached the server, or came back unreadable. */
export const RETRY_MESSAGE = "Couldn't save. Your change is kept here and will be sent again.";

/** The sentence for a 404: the cat was deleted under this tab. */
export const DELETED_MESSAGE = "This cat was deleted.";

type TimerKind = "debounce" | "ceiling";

/** The flushes waiting on a send: each settles with the outcome once nothing is in flight. */
function createWaiters() {
  let waiting: Array<(result: SendResult | null) => void> = [];
  return {
    add: () => new Promise<SendResult | null>((resolve) => waiting.push(resolve)),
    settle(result: SendResult) {
      const settled = waiting;
      waiting = [];
      for (const resolve of settled) resolve(result);
    },
  };
}

/** The scheduler's two timers. Arming one always clears what it held, and a timer that fires empties its own slot, so no stale timer can fire on its own. */
function createTimers(onFire: () => void) {
  const slots: Record<TimerKind, ReturnType<typeof setTimeout> | null> = {
    debounce: null,
    ceiling: null,
  };
  const disarm = (kind: TimerKind) => {
    const timer = slots[kind];
    if (timer !== null) clearTimeout(timer);
    slots[kind] = null;
  };
  const arm = (kind: TimerKind, ms: number) => {
    disarm(kind);
    slots[kind] = setTimeout(() => {
      slots[kind] = null;
      onFire();
    }, ms);
  };
  return { arm, disarm, armed: (kind: TimerKind) => slots[kind] !== null };
}

/**
 * A debounced, capped scheduler over `send`. A burst of touches within a second is one
 * send of the latest document; continuous touches still send every five seconds. A touch
 * while a send is in flight is sent right after it. After a terminal result nothing is
 * scheduled or sent again. Any other failure keeps the document as pending — so a flush
 * or a newer touch sends it — and tries again by itself after the max wait, doubling up
 * to `RETRY_CAP_MS` while it keeps failing (FR-024, FR-027). `retry` sends what is
 * pending at once without `keepalive`; a second call while that send is in flight adds
 * nothing, so the `online` event can call it freely.
 */
export function createAutosave({ send, onStart, onResult }: AutosaveOptions): Autosave {
  let pending: ProfileDocument | null = null;
  let inFlight = false;
  /** A flush asked for while a send was in flight: the follow-up send keeps `keepalive`. */
  let flushRequested = false;
  let stopped = false;
  let failures = 0;
  const waiters = createWaiters();
  const timers = createTimers(() => fire(false));

  const settle = (doc: ProfileDocument, result: SendResult) => {
    inFlight = false;
    if (result.ok) failures = 0;
    else if (result.terminal) stopped = true;
    else {
      // A newer touch during the send wins; otherwise the failed document stays pending.
      pending ??= doc;
      failures += 1;
      timers.arm("ceiling", Math.min(MAX_WAIT_MS * 2 ** (failures - 1), RETRY_CAP_MS));
    }
    onResult(result, doc);
    const keepalive = flushRequested;
    flushRequested = false;
    if (pending !== null && !stopped && (result.ok || keepalive)) fire(keepalive);
    if (!inFlight) waiters.settle(result);
  };

  const fire = (keepalive: boolean) => {
    if (inFlight) {
      flushRequested ||= keepalive;
      return;
    }
    timers.disarm("debounce");
    timers.disarm("ceiling");
    if (pending === null || stopped) return;
    const doc = pending;
    pending = null;
    inFlight = true;
    onStart();
    void send(doc, keepalive).then((result) => settle(doc, result));
  };

  const touch = (doc: ProfileDocument) => {
    if (stopped) return;
    pending = doc;
    timers.arm("debounce", DEBOUNCE_MS);
    if (!timers.armed("ceiling")) timers.arm("ceiling", MAX_WAIT_MS);
  };

  const flush = () => {
    fire(true);
    return inFlight ? waiters.add() : Promise.resolve(null);
  };

  return { touch, flush, retry: () => fire(false) };
}

const StampSchema = z.object({ updatedAt: z.iso.datetime() });
const ErrorBodySchema = z.object({ error: z.object({ message: z.string() }) });

/** The response body as `unknown`, or `undefined` when it is not JSON. */
async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * One `PUT` of the whole document to the draft route. A `200` answers the server's stamp;
 * a `404` is terminal (`DELETED_MESSAGE`); another `4xx` — the document was refused — is
 * reported in the server's own sentence (FR-027); a `5xx`, a network failure or an
 * unreadable answer is `RETRY_MESSAGE`, because the scheduler will send it again.
 */
export async function sendDraft(doc: ProfileDocument, keepalive: boolean): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(`/api/profiles/${doc.id}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
      keepalive,
    });
  } catch {
    return { ok: false, message: RETRY_MESSAGE, terminal: false };
  }
  if (response.status === 404) return { ok: false, message: DELETED_MESSAGE, terminal: true };
  const body = await bodyOf(response);
  if (response.ok) {
    const stamp = StampSchema.safeParse(body);
    if (stamp.success) return { ok: true, updatedAt: stamp.data.updatedAt };
  }
  const failure = ErrorBodySchema.safeParse(body);
  const refused = response.status < 500 && failure.success;
  const message = refused ? failure.data.error.message : RETRY_MESSAGE;
  return { ok: false, message, terminal: false };
}
