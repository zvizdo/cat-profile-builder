"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createFeed, reduceFeed, type Feed, type FeedAction } from "@/core/carousel/feed";
import { RosterResponseSchema, type CarouselCat } from "@/core/carousel/roster";

// The kiosk's poll (FR-061, FR-066; server-boundary.md → `/kiosk`): `GET /api/carousel`
// once every five minutes, and nothing else — no retry, no back-off, no second request.
// Every decision about what a poll's outcome means is feed.ts's; this owns the interval,
// the fetch, and the store the beat drains at its boundary.

/** How often the kiosk asks for the roster (server-boundary.md: every five minutes). */
export const KIOSK_POLL_MS = 5 * 60_000;

/** Where the roster comes from. */
const ENDPOINT = "/api/carousel";

export interface KioskPollOptions {
  /** The roster the server page rendered, so the first paint needs no fetch. */
  initial: CarouselCat[];
  /** No beat runs (reduced motion), so an answer becomes the roster as it arrives. */
  immediate: boolean;
}

export interface KioskPoll extends Feed<CarouselCat> {
  /** At a beat boundary: what is pending becomes the roster, and is handed back for the step. */
  drain(): CarouselCat[] | undefined;
}

/**
 * One request: the roster the route answers, or `undefined` for anything that is not a
 * 2xx roster — a network failure (`fetch` rejects), a non-2xx status, a body that is not
 * JSON (`json()` rejects), or JSON that is not `{ cats }`.
 */
async function fetchRoster(): Promise<CarouselCat[] | undefined> {
  try {
    const response = await fetch(ENDPOINT);
    if (!response.ok) return undefined;
    const parsed = RosterResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.cats : undefined;
  } catch {
    return undefined;
  }
}

interface FeedStore {
  read(): Feed<CarouselCat>;
  dispatch(action: FeedAction<CarouselCat>): void;
  subscribe(onChange: () => void): () => void;
}

/**
 * The feed as a store rather than reducer state, so `drain` can read what is pending the
 * instant the beat asks — a timer callback, which may run before React has committed the
 * render that would have mirrored it.
 */
function createStore(initial: CarouselCat[]): FeedStore {
  let feed = createFeed(initial, Date.now());
  const listeners = new Set<() => void>();
  return {
    read: () => feed,
    dispatch(action) {
      const next = reduceFeed(feed, action);
      if (next === feed) return;
      feed = next;
      for (const notify of listeners) notify();
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

/**
 * Polls the roster every {@link KIOSK_POLL_MS}, holding each answer for the beat to drain
 * at its next boundary (or applying it at once while `immediate`, or while the roster is
 * empty), and keeps the current roster through every failure, dating the outage.
 */
export function useKioskPoll({ initial, immediate }: KioskPollOptions): KioskPoll {
  const [store] = useState(() => createStore(initial));
  const feed = useSyncExternalStore(store.subscribe, store.read, store.read);

  // Read at the moment an answer lands, so a flip never restarts the interval's cadence.
  const immediateRef = useRef(immediate);
  useEffect(() => {
    immediateRef.current = immediate;
  }, [immediate]);

  useEffect(() => {
    const poll = async (): Promise<void> => {
      const roster = await fetchRoster();
      const at = Date.now();
      store.dispatch(
        roster === undefined
          ? { type: "failed", at }
          : { type: "arrived", roster, at, immediate: immediateRef.current },
      );
    };
    const timer = setInterval(() => void poll(), KIOSK_POLL_MS);
    return () => clearInterval(timer);
  }, [store]);

  const drain = useCallback(() => {
    const pending = store.read().pendingRoster;
    store.dispatch({ type: "drain" });
    return pending;
  }, [store]);
  useEffect(() => {
    if (immediate) drain();
  }, [immediate, drain]);

  return { ...feed, drain };
}
