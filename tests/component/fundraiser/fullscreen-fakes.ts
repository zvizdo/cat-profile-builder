import { vi } from "vitest";

// What the full screen tests share: a `matchMedia` that can flip one named query and fire its
// `change` (the shared `stubMatchMedia` answers false for everything but reduced motion, so it
// cannot show a browser entering `(display-mode: fullscreen)`), and a stand-in for the
// document's full screen API that jsdom lacks.

export const DISPLAY_MODE_FULLSCREEN = "(display-mode: fullscreen)";

type Listener = () => void;

interface FakeList {
  matches: boolean;
  listeners: Set<Listener>;
}

/** What a test drives: flip a query and its listeners hear a `change`. */
export interface MatchMediaFake {
  /** Make `query` match (or stop matching) and fire `change` on its lists. */
  set(query: string, matches: boolean): void;
  /** How many `change` listeners are attached to `query` right now. */
  listenerCount(query: string): number;
}

/** Replace `window.matchMedia` with a fake whose queries all start unmatched. */
export function stubMatchMediaQueries(): MatchMediaFake {
  const lists = new Map<string, FakeList>();
  const listFor = (query: string): FakeList => {
    const existing = lists.get(query);
    if (existing) return existing;
    const created: FakeList = { matches: false, listeners: new Set() };
    lists.set(query, created);
    return created;
  };
  vi.stubGlobal("matchMedia", (query: string): MediaQueryList => {
    const list = listFor(query);
    const fake = {
      media: query,
      get matches() {
        return list.matches;
      },
      addEventListener: (_type: string, listener: Listener) => list.listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => list.listeners.delete(listener),
    };
    return fake as unknown as MediaQueryList;
  });
  return {
    set(query, matches) {
      const list = listFor(query);
      list.matches = matches;
      for (const listener of [...list.listeners]) listener();
    },
    listenerCount: (query) => listFor(query).listeners.size,
  };
}

/** The document's full screen API, as far as the page uses it. */
export interface FullscreenFake {
  /** The stubbed `documentElement.requestFullscreen`. */
  request: ReturnType<typeof vi.fn<() => Promise<void>>>;
  /** Put the document in or out of full screen the way a browser does, firing the event. */
  setElement(element: Element | null): void;
  /** Put everything back as the test found it. */
  restore(): void;
}

/** Give jsdom `requestFullscreen` and a settable `fullscreenElement`. */
export function stubFullscreenApi(): FullscreenFake {
  const root = document.documentElement;
  const hadRequest = Object.prototype.hasOwnProperty.call(root, "requestFullscreen");
  const request = vi.fn<() => Promise<void>>(() => Promise.resolve());
  Object.defineProperty(root, "requestFullscreen", { value: request, configurable: true });
  let current: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", {
    get: () => current,
    configurable: true,
  });
  return {
    request,
    setElement(element) {
      current = element;
      document.dispatchEvent(new Event("fullscreenchange"));
    },
    restore() {
      Reflect.deleteProperty(document, "fullscreenElement");
      if (hadRequest) return;
      Reflect.deleteProperty(root, "requestFullscreen");
    },
  };
}
