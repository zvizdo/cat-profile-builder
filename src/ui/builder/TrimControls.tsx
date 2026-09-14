"use client";
import type { KeyboardEvent } from "react";
import { formatClock } from "@/core/format/clock";
import { TrimTrack, type TrimRange as Range } from "./TrimTrack";

// The trim editor's track and handles (split out of `TrimEditor.tsx` for the lint line
// ceiling, F55): two native range inputs over the shared track, moved by the same tenths
// from a pointer or the arrow keys, never crossing each other.

/** A handle moves 0.1 s per arrow and 1 s with Shift. */
const STEP = { arrow: 0.1, shift: 1 } as const;

/** `seconds` to a tenth, so a slider never carries 4.300000000000001. */
function tenth(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

/** The signed step an arrow key asks for, or `null` for any other key. */
function arrowStep(event: KeyboardEvent): number | null {
  const size = event.shiftKey ? STEP.shift : STEP.arrow;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") return size;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") return -size;
  return null;
}

interface HandleProps {
  name: "Start" | "End";
  value: number;
  max: number;
  onMove: (seconds: number) => void;
}

// One native range input over the track: named, valued in seconds, read aloud as a clock.
// Arrows are handled here so a keyboard moves it by the same tenths a pointer does.
function Handle({ name, value, max, onMove }: HandleProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = arrowStep(event);
    if (step === null) return;
    event.preventDefault();
    onMove(Math.min(max, Math.max(0, tenth(value + step))));
  };
  return (
    <input
      type="range"
      aria-label={name}
      aria-valuetext={formatClock(value)}
      min={0}
      max={max}
      step={STEP.arrow}
      value={value}
      onChange={(event) => onMove(Number(event.target.value))}
      onKeyDown={onKeyDown}
      className="trim-handle"
    />
  );
}

interface TrackProps {
  range: Range;
  max: number;
  onChange: (range: Range) => void;
}

// The shared track with the blue window over the chosen stretch (hi-fi video block) and
// the two handles over it. A handle never crosses the other: it stops where the other stands.
// Under the tablet floor the thumbs are 44px wide (globals.css `trim-handle`), so the
// track steps in by 12px each side and the bars keep sitting on the window's edges.
export function Track({ range, max, onChange }: TrackProps) {
  return (
    <div className="relative h-44">
      <div className="absolute inset-x-0 top-8 max-md:inset-x-12">
        <TrimTrack range={range} max={max} />
      </div>
      <Handle
        name="Start"
        value={range.start}
        max={max}
        onMove={(seconds) => onChange({ ...range, start: Math.min(seconds, range.end) })}
      />
      <Handle
        name="End"
        value={range.end}
        max={max}
        onMove={(seconds) => onChange({ ...range, end: Math.max(seconds, range.start) })}
      />
    </div>
  );
}
