"use client";
import { Button, type ButtonProps } from "@/ui/shared/Button";
import type { Icon } from "@/ui/shared/icons";

// The touch chip (comp 7c: every action — `Replace`, `Focal point`, `Move`, `Remove`,
// the `Add` strip — is fully rounded, `TOKENS.json` `radius.pill: 99`, the same shape
// `helper/Chips.tsx`'s quick-request buttons already use): `Button dense`, with
// `rounded-pill` overriding `Button`'s own square `rounded-control` corner. The hero's
// row under 768px, the label row's actions in the touch band (F47) and, from F55, a
// gallery tile's controls on touch all draw this one chip, so a finger meets the same
// box everywhere — 44px tall, hairline, the theme's ink.

export interface PillProps extends Omit<ButtonProps, "dense" | "size" | "className"> {
  /**
   * Extra classes on the pill itself (F61: `GalleryCellTouch` passes `min-w-0 flex-1`
   * so the pill fills whatever its flex row has left over, and can shrink below its own
   * text — its label truncates instead of forcing the row onto a second line).
   */
  className?: string;
}

/**
 * A text pill: `dense` and fully rounded; every other `Button` prop passes through. The
 * label sits in its own `min-w-0` span (F61) so a width a caller sets on the pill
 * truncates the text (`truncate`) rather than the text pushing the pill wider than the
 * space it was given.
 */
export function Pill({ className, children, ...rest }: PillProps) {
  return (
    <Button {...rest} dense className={["rounded-pill", className].filter(Boolean).join(" ")}>
      <span className="min-w-0 truncate">{children}</span>
    </Button>
  );
}

export interface IconPillProps extends Omit<
  ButtonProps,
  "dense" | "size" | "className" | "children" | "aria-label"
> {
  /** The glyph is decorative; the name is mandatory. */
  "aria-label": string;
  icon: Icon;
}

/**
 * The same chip for one icon (F55 item 1: a gallery tile's `Move left`, `Move right`,
 * `Remove photo`): the 44px square, fully rounded, so an icon and a word sit in one
 * row at one height. `aria-disabled` fades it the way the ends of a row fade.
 */
export function IconPill({ icon: Glyph, ...rest }: IconPillProps) {
  return (
    <Button {...rest} size="icon" className="rounded-pill aria-disabled:opacity-50">
      <Glyph />
    </Button>
  );
}
