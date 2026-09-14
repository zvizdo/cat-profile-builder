import type { ButtonHTMLAttributes, Ref } from "react";

// The tools' square 4px buttons (DESIGN.md §4): primary (blue), secondary (hairline),
// ghost (blue text), destructive (clay outline that fills on hover — never blue), and
// danger — the ghost in clay, for a text-only destructive action beside other ghosts
// (the media card's `Remove`, F38), as `IconButton` has its `danger`.

/** Which of the design system's button styles to draw. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "danger";

// Focus is never the 16 %-alpha ring alone (≈1.2:1 on white): the primary darkens to its
// hover colour, the secondary and ghost gain a blue outline, the destructive fills clay —
// so the control itself changes.
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-blue text-card hover:bg-blue-deep focus-visible:bg-blue-deep focus-visible:outline-none",
  secondary:
    "border border-line-button bg-transparent text-ink hover:border-blue hover:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
  ghost:
    "bg-transparent text-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
  destructive:
    "border border-clay bg-transparent text-clay hover:bg-clay hover:text-card focus-visible:bg-clay focus-visible:text-card focus-visible:outline-none",
  danger:
    "bg-transparent text-clay hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay",
};

/** A native `button`'s attributes plus the variant and a ref; `type` defaults to `button`. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** The dense chrome size (DESIGN.md §2: 13px in dense chrome) — the builder's topbar. */
  dense?: boolean;
  /** The size outright; `dense` is the short way to ask for the dense one. */
  size?: ButtonSize;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The three sizes: the general 15px/500 with 12px vertical padding, the dense chrome
 * one, or `icon` — the 44px square for one glyph (F55: a pill row's `Move left`), the
 * same box `IconButton` draws but in a `variant`'s own border and colours.
 */
export type ButtonSize = "default" | "dense" | "icon";

// Dense (hi-fi 3a's topbar: 13.5px text, 9-10px / 16-18px padding): the 13px dense-chrome
// text on 8px / 16px, the nearest steps. The tap floor stays — `min-h-44` governs the box,
// so a dense button draws 44px tall, not the comp's 36; the design system's own tap rule
// outranks the comp's mouse-only height (this bar is on tablets too). The primary keeps
// its 500 weight, as the comp's Publish does; the others are 400, as its Preview is.
const SIZE: Record<ButtonSize, string> = {
  default: "px-20 py-12 text-ui",
  dense: "min-h-44 px-16 py-8 text-ui-dense",
  icon: "size-44 shrink-0 text-ui-dense",
};

/**
 * The classes of a `variant` button, for a link that must look like one (the builder's
 * Preview): 4px radius, 15px/500 text, 12px vertical padding — at least 44px tall, the
 * tap-target floor — 180ms hover, and a keyboard focus state that changes the control.
 * `dense` is the topbar's size: 13px text on tighter padding, still 44px tall.
 */
export function buttonClasses(
  variant: ButtonVariant,
  className?: string,
  size: ButtonSize = "default",
): string {
  return [
    "inline-flex items-center justify-center rounded-control font-text",
    SIZE[size],
    size === "dense" && variant === "primary" ? "font-medium" : "",
    "transition-colors duration-hover ease-default focus-visible:shadow-focus-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A button in the token language (see {@link buttonClasses}). Disabled buttons fade and
 * leave the Tab order. Every other attribute passes through to the native element.
 */
export function Button({
  variant = "primary",
  dense = false,
  size,
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const classes = buttonClasses(variant, className, size ?? (dense ? "dense" : "default"));
  return <button type={type} className={classes} {...rest} />;
}
