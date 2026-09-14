"use client";
import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { SetThemeOperation } from "@/core/profile/operations";
import type { Theme } from "@/core/profile/schema";
import {
  isLightOnDark,
  passesContrast,
  resolveTheme,
  restoreToPassing,
} from "@/core/profile/theme";
import { Button } from "@/ui/shared/Button";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { PRESET_LABEL, themeStyle } from "./theme-css";
import { useWorkingLock } from "./working-lock";

// The rail's Theme group (hi-fi 3a; FR-029–FR-031; CONTENT.md → Rail, Contrast note):
// the four preset swatches, the warmth and contrast sliders, and the note core writes
// about the text's contrast. A slider previews while it is held — the canvas follows
// through `onPreview` — and records one `set_theme` when it is let go, so history holds
// one entry per gesture, never one per pixel. No colour is computed here: the swatches
// and the sheet paint from `themeStyle`, the note from `resolveTheme`.

const PRESETS: readonly Theme["preset"][] = ["paper", "card", "night", "sand"];

/** The two sliders, each 0..1 in steps of `STEP.arrow`. */
type Slider = "warmth" | "contrast";

const STEP = { arrow: 0.01, page: 0.1 };

export interface ThemePickerProps {
  /** The document's theme; what the controls show between gestures. */
  theme: Theme;
  /** One `set_theme` per gesture: a swatch click, a slider let go, `Restore to passing`. */
  onChange: (op: SetThemeOperation) => void;
  /** The theme while a slider is held, and `null` when the gesture ends. */
  onPreview: (theme: Theme | null) => void;
  /** F44: false inside the phone's collapsed Theme group, whose head row is the heading. */
  heading?: boolean;
}

/** CONTENT.md → Contrast note, chosen by core's verdict on the resolved theme. */
function contrastNote(theme: Theme): string {
  if (!passesContrast(theme)) return "contrast check: fails — publish will warn";
  if (isLightOnDark(resolveTheme(theme))) return "contrast check: passes AA · light labels swap in";
  return "contrast check: passes AA";
}

/** A slider value to two places, the reading the label and `aria-valuetext` show. */
function reading(value: number): string {
  return value.toFixed(2);
}

// Where a key sends a slider: the arrows step by 0.01, PageUp/PageDown by 0.1, Home and
// End to the ends. Handled here so a keyboard steps the same in every browser (and in
// jsdom, which has no native range keys); anything else is left to the browser.
function keyedValue(event: KeyboardEvent<HTMLInputElement>, value: number): number | null {
  switch (event.key) {
    case "ArrowRight":
    case "ArrowUp":
      return value + STEP.arrow;
    case "ArrowLeft":
    case "ArrowDown":
      return value - STEP.arrow;
    case "PageUp":
      return value + STEP.page;
    case "PageDown":
      return value - STEP.page;
    case "Home":
      return 0;
    case "End":
      return 1;
    default:
      return null;
  }
}

/** Clamped into 0..1 and rounded to the step, so 0.1 + 0.2 never leaks its float noise. */
function snap(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

// The fill is the value as a percentage of the track: data, so it travels inline.
function fillStyle(value: number): CSSProperties & { "--fill": string } {
  return { "--fill": `${value * 100}%` };
}

interface SliderRowProps {
  name: Slider;
  value: number;
  onMove: (value: number) => void;
  onRelease: () => void;
}

// One labelled range input: mono name and reading above, the track below. Every key
// press and every pixel is a preview through `onMove`; the gesture ends — pointer up,
// key up, focus gone — through `onRelease`. F9: a real `disabled` while the helper works.
function SliderRow({ name, value, onMove, onRelease }: SliderRowProps) {
  const id = useId();
  const working = useWorkingLock();
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const next = keyedValue(event, value);
    if (next === null) return;
    event.preventDefault();
    onMove(snap(next));
  };
  return (
    <div className="flex flex-col">
      <div className="flex justify-between">
        <MonoLabel as="label" htmlFor={id} variant="reading" className="text-meta">
          {name}
        </MonoLabel>
        <MonoLabel variant="reading" className="text-ink">
          {reading(value)}
        </MonoLabel>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={STEP.arrow}
        value={value}
        disabled={working}
        aria-valuetext={reading(value)}
        className="theme-slider disabled:opacity-50"
        style={fillStyle(value)}
        onChange={(event) => onMove(snap(Number(event.target.value)))}
        onKeyDown={onKeyDown}
        onKeyUp={onRelease}
        onPointerUp={onRelease}
        onBlur={onRelease}
      />
    </div>
  );
}

// The four swatches as a radio group: each painted from its preset at the defaults,
// the checked one ringed in blue. F9: a real `disabled` while the helper works.
function Swatches({ theme, onChange }: Pick<ThemePickerProps, "theme" | "onChange">) {
  const working = useWorkingLock();
  return (
    <div role="radiogroup" aria-label="Preset" className="grid grid-cols-4 gap-8">
      {PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          role="radio"
          disabled={working}
          aria-checked={theme.preset === preset}
          aria-label={PRESET_LABEL[preset]}
          style={themeStyle({ preset, warmth: 0.5, contrast: 0.5 })}
          className="theme-swatch aspect-square min-h-44 rounded-control border border-line-tag aria-checked:outline-2 aria-checked:outline-offset-2 aria-checked:outline-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:pointer-events-none disabled:opacity-50"
          onClick={() => onChange({ op: "set_theme", preset })}
        />
      ))}
    </div>
  );
}

interface ContrastNoteProps extends Pick<ThemePickerProps, "theme" | "onChange"> {
  /** The theme the note judges: the preview while a slider is held, else the document's. */
  shown: Theme;
}

// The note as a live region — it changes only at a threshold, so it is not chatty — and,
// while the text fails 4.5:1, `Restore to passing`: the one `set_theme` that
// `restoreToPassing` gives for the recorded theme (FR-031), undoable like any edit.
function ContrastNote({ theme, shown, onChange }: ContrastNoteProps) {
  const working = useWorkingLock();
  return (
    <>
      <p
        role="status"
        className="edge-blue bg-paper px-12 py-8 font-label text-mono-label tracking-normal text-body"
      >
        {contrastNote(shown)}
      </p>
      {passesContrast(shown) ? null : (
        <Button
          variant="secondary"
          disabled={working}
          onClick={() => onChange({ op: "set_theme", ...restoreToPassing(theme) })}
        >
          Restore to passing
        </Button>
      )}
    </>
  );
}

/**
 * The Theme group: heading and the current preset's name, the swatches, the two sliders,
 * and the contrast note with `Restore to passing` when the text fails. A slider previews
 * while held and records one `set_theme` when let go; one let go where it started
 * records nothing.
 */
export function ThemePicker({ theme, onChange, onPreview, heading = true }: ThemePickerProps) {
  const headingId = useId();
  const [preview, setPreview] = useState<Theme | null>(null);
  const shown = preview ?? theme;

  const move = (name: Slider, value: number) => {
    const next = { ...shown, [name]: value };
    setPreview(next);
    onPreview(next);
  };
  const release = (name: Slider) => {
    if (preview === null) return;
    if (preview[name] !== theme[name]) onChange({ op: "set_theme", [name]: preview[name] });
    setPreview(null);
    onPreview(null);
  };

  const controls = (
    <>
      <Swatches theme={theme} onChange={onChange} />
      <SliderRow
        name="warmth"
        value={shown.warmth}
        onMove={(value) => move("warmth", value)}
        onRelease={() => release("warmth")}
      />
      <SliderRow
        name="contrast"
        value={shown.contrast}
        onMove={(value) => move("contrast", value)}
        onRelease={() => release("contrast")}
      />
      <ContrastNote theme={theme} shown={shown} onChange={onChange} />
    </>
  );
  if (!heading) return <div className="flex flex-col gap-12">{controls}</div>;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-12">
      <div className="flex items-baseline justify-between">
        <h2 id={headingId}>
          <MonoLabel className="text-meta">Theme</MonoLabel>
        </h2>
        <MonoLabel variant="reading" className="text-meta">
          {PRESET_LABEL[theme.preset]}
        </MonoLabel>
      </div>
      {controls}
    </section>
  );
}
