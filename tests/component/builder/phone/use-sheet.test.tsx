import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Turn } from "@/core/helper/reducer";
import { useDrawerSignal } from "@/ui/builder/phone/use-sheet";

// The CATalyst tab's disc (design 2026-09-13 §1): breathing while a turn streams, still
// while a card waits for an answer — even though the reducer keeps `status: "working"`
// for as long as a card is pending — and still once a turn ended unseen behind the
// closed drawer with something to show; opening the drawer clears that.

const EMPTY: Turn = {
  touched: [],
  applied: [],
  results: {},
  card: null,
  outcome: null,
} as unknown as Turn;

const CARD: Turn = { ...EMPTY, card: { toolCallId: "c1", summary: "Remove the bio." } } as Turn;

describe("useDrawerSignal", () => {
  it("breathes while working with no card, and stands still the moment a card waits", () => {
    const { result, rerender } = renderHook(
      ({ status, turn }: { status: "ready" | "working"; turn: Turn }) =>
        useDrawerSignal({ status, turn }, false),
      { initialProps: { status: "working" as const, turn: EMPTY } },
    );
    expect(result.current).toBe("working");
    rerender({ status: "working", turn: CARD });
    expect(result.current).toBe("waiting");
  });

  it("lights for a turn that ended unseen with an edit applied, and clears when the drawer opens", () => {
    const applied = { ...EMPTY, applied: [{ toolCallId: "a" }] } as unknown as Turn;
    const { result, rerender } = renderHook(
      ({ status, open }: { status: "ready" | "working"; open: boolean }) =>
        useDrawerSignal({ status, turn: applied }, open),
      { initialProps: { status: "working" as "ready" | "working", open: false } },
    );
    act(() => rerender({ status: "ready", open: false }));
    expect(result.current).toBe("waiting");
    act(() => rerender({ status: "ready", open: true }));
    expect(result.current).toBe("none");
  });

  it("stays quiet for a turn that ended with nothing to show", () => {
    const { result, rerender } = renderHook(
      ({ status }: { status: "ready" | "working" }) =>
        useDrawerSignal({ status, turn: EMPTY }, false),
      { initialProps: { status: "working" as "ready" | "working" } },
    );
    rerender({ status: "ready" });
    expect(result.current).toBe("none");
  });
});
