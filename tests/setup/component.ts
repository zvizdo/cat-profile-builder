// Registers Testing Library's DOM matchers (toBeInTheDocument and friends) on Vitest's
// expect, unmounts every rendered tree after each test and empties the window's storage
// (the builder mirrors every edit there), so tests cannot leak into one another.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom implements no ResizeObserver; a no-op stand-in keeps any component that uses one
// (use-stage-fit.ts, F64) from throwing on mount. A test asserting on resize behavior
// stubs a richer fake of its own for its duration (see use-stage-fit.test.tsx).
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = NoopResizeObserver;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
