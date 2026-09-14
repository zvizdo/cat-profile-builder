import type { ButtonHTMLAttributes, Ref } from "react";
import type { Icon } from "./icons";

// A 44px square control carrying one icon (DESIGN.md §4: anything tapped is ≥44px). The
// icon is decorative, so the accessible name is the required `aria-label`.

/** Ghost inherits the surrounding colour; danger is clay and never blue. */
export type IconButtonVariant = "ghost" | "danger";

// Ghost keys everything off `currentColor` so the same button reads on paper and on a
// night or ink toast without a variant per ground. Focus changes the control (an outline
// in its own colour), never the faint ring alone.
const VARIANT: Record<IconButtonVariant, string> = {
  ghost: "hover:bg-current/10 focus-visible:outline-current",
  danger: "text-clay hover:bg-clay hover:text-card focus-visible:outline-clay",
};

/** A native `button`'s attributes with `aria-label` made mandatory and the icon named. */
export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> {
  "aria-label": string;
  icon: Icon;
  variant?: IconButtonVariant;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A square icon button that is always at least 44px, always named, and keyboard-operable
 * with a visible focus outline. `type` defaults to `button`; everything else passes through.
 */
export function IconButton({
  icon: Glyph,
  variant = "ghost",
  type = "button",
  className,
  ...rest
}: IconButtonProps) {
  const classes = [
    "inline-flex size-44 shrink-0 items-center justify-center rounded-control",
    "transition-colors duration-hover ease-default",
    "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50",
    VARIANT[variant],
    className,
  ];
  return (
    <button type={type} className={classes.filter(Boolean).join(" ")} {...rest}>
      <Glyph />
    </button>
  );
}
