import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import type { EditState } from "@/core/fundraiser/edit-session";
import type { Fundraiser } from "@/core/fundraiser/fundraiser";
import { InPlaceField } from "@/ui/fundraiser/InPlaceField";
import { useEditSession } from "@/ui/fundraiser/use-edit-session";

// A small page for testing `useEditSession` the way T017 will wire it: a stage that holds the
// headline, the thermometer button, the amounts block and the edit row, plus the helpers the
// two test files share (queries, pointer and focus events, the fake clock).

export const CURRENT: Fundraiser = {
  headline: "Help Mochi get home",
  raisedCents: 650_000,
  goalCents: 1_000_000,
};

/** One animation frame, as the fake timers count it. */
export const FRAME_MS = 16;

export interface HarnessProps {
  enabled?: boolean;
  onCommit?: (changes: Partial<Fundraiser>) => void;
  onKind?: (kind: EditState["kind"]) => void;
  onSticky?: (sticky: boolean) => void;
  /** Told about every distinct state: "idle", "amounts:preview", "amounts:sticky" or "headline". */
  onSeen?: (label: string) => void;
}

export function noop(): void {}

/** The page, as T017 will wire it. Fields and Done render only while a session is open. */
export function Harness({
  enabled = true,
  onCommit = noop,
  onKind,
  onSticky,
  onSeen,
}: HarnessProps) {
  const session = useEditSession(CURRENT, onCommit, enabled);
  const { state, field, done } = session;
  useEffect(() => {
    onKind?.(state.kind);
  }, [state.kind, onKind]);
  useEffect(() => {
    onSticky?.(state.kind === "amounts" && state.sticky);
  }, [state, onSticky]);
  useEffect(() => {
    if (state.kind === "amounts") onSeen?.(state.sticky ? "amounts:sticky" : "amounts:preview");
    else onSeen?.(state.kind);
  }, [state, onSeen]);
  return (
    <div>
      <button type="button">Outside the stage</button>
      <div data-testid="stage" {...session.stage}>
        <p data-testid="backdrop">Backdrop</p>
        <button type="button" {...session.headlineButton}>
          Help Mochi get home
        </button>
        {state.kind === "headline" ? (
          <div data-headline data-testid="headline-box">
            <InPlaceField
              kind="wrap"
              label="Headline"
              value={state.text}
              onChange={(text) => field.onChange("headline", text)}
              onConfirm={field.onConfirm}
              onCancel={field.onCancel}
            />
          </div>
        ) : null}
        <button type="button" data-figures {...session.amountsButton}>
          <span data-testid="thermo-glyph">Edit the amount raised and the goal</span>
        </button>
        <div data-figures data-testid="amounts">
          {state.kind === "amounts" ? (
            <>
              <InPlaceField
                kind="line"
                label="Amount raised"
                value={state.raised}
                onChange={(text) => field.onChange("raised", text)}
                onConfirm={field.onConfirm}
                onCancel={field.onCancel}
              />
              <InPlaceField
                kind="line"
                label="Goal"
                value={state.goal}
                onChange={(text) => field.onChange("goal", text)}
                onConfirm={field.onConfirm}
                onCancel={field.onCancel}
              />
            </>
          ) : (
            <span data-testid="raised-text">$6,500</span>
          )}
        </div>
        <div data-edit-row>
          {state.kind === "idle" ? null : (
            <button type="button" {...done}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function thermometer(): HTMLElement {
  return screen.getByRole("button", { name: "Edit the amount raised and the goal" });
}
export function headlineButton(): HTMLElement {
  return screen.getByRole("button", { name: "Help Mochi get home" });
}
export function amountsBlock(): HTMLElement {
  return screen.getByTestId("amounts");
}
export function done(): HTMLElement {
  return screen.getByRole("button", { name: "Done" });
}
export function outside(): HTMLElement {
  return screen.getByRole("button", { name: "Outside the stage" });
}
export function raisedField(): HTMLElement {
  return screen.getByRole("textbox", { name: "Amount raised" });
}
export function goalField(): HTMLElement {
  return screen.getByRole("textbox", { name: "Goal" });
}
export function fieldsOpen(): boolean {
  return screen.queryByRole("textbox", { name: "Amount raised" }) !== null;
}
export function headlineOpen(): boolean {
  return screen.queryByRole("textbox", { name: "Headline" }) !== null;
}

export function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
export function nextFrame(): void {
  advance(FRAME_MS);
}
/**
 * jsdom schedules a zero-delay timer of its own for the `selectionchange` that follows a focus;
 * running what is due now keeps it from being counted as one of the hook's timers.
 */
export function flushJsdomSelectionTimer(): void {
  vi.advanceTimersByTime(0);
}
export function focus(element: HTMLElement): void {
  act(() => {
    element.focus();
    flushJsdomSelectionTimer();
  });
}
export function blur(element: HTMLElement): void {
  act(() => {
    element.blur();
    flushJsdomSelectionTimer();
  });
}
export function type(element: HTMLElement, text: string): void {
  fireEvent.change(element, { target: { value: text } });
}

export type PointerKind = "mouse" | "pen" | "touch";
export function over(element: HTMLElement, pointerType: PointerKind = "mouse"): void {
  fireEvent.pointerOver(element, { pointerType });
}
export function out(element: HTMLElement, pointerType: PointerKind = "mouse"): void {
  fireEvent.pointerOut(element, { pointerType });
}
export function pointerDown(element: HTMLElement, pointerType: PointerKind = "mouse"): void {
  fireEvent.pointerDown(element, { pointerType });
}

/** Opens the amounts as a person would with a mouse press: a sticky session. */
export function openByClick(onCommit?: HarnessProps["onCommit"]): void {
  render(<Harness onCommit={onCommit} />);
  fireEvent.click(thermometer(), { detail: 1 });
}

/** Fake timers for a test file: timeouts and animation frames, and nothing else. */
export function installFakeClock(): void {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}
