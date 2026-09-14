import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollProgress } from "@/ui/profile/ScrollProgress";
import { stubMatchMedia } from "./fixtures";

// The fallback for browsers without scroll-driven animations (ADR-009): `--progress` is
// written on every `[data-scene]` in view, from 0 as it enters to 1 as it leaves, and the
// same keyframes read it. Where `animation-timeline` is supported, or under reduced
// motion, it writes nothing.

type Observer = { callback: IntersectionObserverCallback; observed: Element[] };
let observers: Observer[];

function supports(value: boolean): void {
  vi.stubGlobal("CSS", { supports: () => value });
}

function rect(top: number, height: number): DOMRect {
  return { top, height, bottom: top + height } as DOMRect;
}

function entry(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
  return { target, isIntersecting } as IntersectionObserverEntry;
}

beforeEach(() => {
  observers = [];
  stubMatchMedia(false);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observed: Element[] = [];
      constructor(public callback: IntersectionObserverCallback) {
        observers.push(this);
      }
      observe(element: Element) {
        this.observed.push(element);
      }
      disconnect() {}
    },
  );
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});
afterEach(() => vi.unstubAllGlobals());

function scene(kind: string, top: number, height: number): HTMLElement {
  const element = document.createElement("div");
  element.dataset.scene = kind;
  element.getBoundingClientRect = () => rect(top, height);
  document.body.append(element);
  return element;
}

describe("ScrollProgress", () => {
  it("writes --progress for an entering section and a pinned scene", () => {
    supports(false);
    const enter = scene("enter", 575, 400);
    const pin = scene("pin", -1500, 3000);
    const away = scene("enter", 5000, 400);
    render(<ScrollProgress />);
    const observer = observers[0];
    if (observer === undefined) throw new Error("no observer");
    expect(observer.observed).toEqual([enter, pin, away]);
    act(() => {
      observer.callback(
        [entry(enter, true), entry(pin, true), entry(away, false)],
        observer as unknown as IntersectionObserver,
      );
    });
    expect(enter.style.getPropertyValue("--progress")).toBe("0.5");
    expect(pin.style.getPropertyValue("--progress")).toBe("0.75");
    expect(away.style.getPropertyValue("--progress")).toBe("");
    enter.getBoundingClientRect = () => rect(-100, 400);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(enter.style.getPropertyValue("--progress")).toBe("1");
  });

  it("does nothing where scroll-driven animations are supported", () => {
    supports(true);
    scene("enter", 500, 400);
    render(<ScrollProgress />);
    expect(observers).toHaveLength(0);
  });

  it("does nothing under reduced motion", () => {
    supports(false);
    stubMatchMedia(true);
    scene("enter", 500, 400);
    render(<ScrollProgress />);
    expect(observers).toHaveLength(0);
  });
});
