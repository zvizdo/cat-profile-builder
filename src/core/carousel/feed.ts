// The kiosk's feed (FR-061, FR-066; server-boundary.md → `/kiosk`; CONTENT.md → Event
// carousel → Offline) as pure transitions, the way beat.ts holds the beat's: what a poll
// brings is held until the beat drains it at a boundary, so a cat never vanishes or
// appears mid-wipe; a poll that fails keeps what is on screen — the carousel keeps
// looping on yesterday's cats — and dates the moment the feed went quiet. The hook that
// owns the interval and the fetch calls these; nothing here touches a clock or the network.

/** The feed's state for a roster of `T`, which it never looks inside. */
export interface Feed<T> {
  /** What the beat shows. */
  roster: T[];
  /** What the last poll brought, not yet applied; `undefined` when nothing is waiting. */
  pendingRoster: T[] | undefined;
  /** When the roster was last known good (ms since the epoch): the load until a poll succeeds. */
  lastGoodAt: number;
  /** When polls started failing, or `undefined` while the feed answers. */
  failedSince: number | undefined;
}

export type FeedAction<T> =
  /** A poll succeeded. `immediate`: nothing is mid-beat, so apply it now rather than hold it. */
  | { type: "arrived"; roster: T[]; at: number; immediate: boolean }
  /** A poll failed — the network, a non-2xx, an answer that is not a roster. */
  | { type: "failed"; at: number }
  /** A beat boundary: what is pending becomes the roster. */
  | { type: "drain" };

/** The feed as the page loads: the server's roster, known good as of `now`. */
export function createFeed<T>(roster: T[], now: number): Feed<T> {
  return { roster, pendingRoster: undefined, lastGoodAt: now, failedSince: undefined };
}

/**
 * One transition. An answer is held unless told nothing is mid-beat — or the roster on
 * show is empty, where no beat runs and no boundary can come. A failure keeps everything
 * and dates only the first of a run, so the line names when the feed went quiet. A drain
 * with nothing pending changes nothing.
 */
export function reduceFeed<T>(feed: Feed<T>, action: FeedAction<T>): Feed<T> {
  switch (action.type) {
    case "arrived": {
      const now = action.immediate || feed.roster.length === 0;
      return {
        roster: now ? action.roster : feed.roster,
        pendingRoster: now ? undefined : action.roster,
        lastGoodAt: action.at,
        failedSince: undefined,
      };
    }
    case "failed":
      return feed.failedSince === undefined ? { ...feed, failedSince: action.at } : feed;
    case "drain":
      return feed.pendingRoster === undefined
        ? feed
        : { ...feed, roster: feed.pendingRoster, pendingRoster: undefined };
  }
}
