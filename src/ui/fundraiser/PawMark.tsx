/** What a paw accepts: whether it is lit, and a class that sets its size and colour. */
export interface PawMarkProps {
  /** True once the thermometer has reached this paw's step. */
  lit: boolean;
  className?: string;
}

/**
 * One paw print on the thermometer's scale: a pad and four toes drawn as ellipses in a 100 by 100
 * box, filled with the text colour so CSS decides lit or dim. It is decoration, so it is hidden
 * from assistive technology (the meter's own text carries the figures), cannot take focus, and
 * has no size of its own: the stylesheet sizes it. `data-lit` lets that stylesheet tell the two
 * states apart without extra classes.
 */
export function PawMark({ lit, className }: PawMarkProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 100"
      fill="currentColor"
      data-lit={lit}
      className={className}
    >
      <ellipse cx="50" cy="68" rx="25" ry="20" />
      <ellipse cx="20" cy="44" rx="9" ry="13" transform="rotate(-22 20 44)" />
      <ellipse cx="40" cy="26" rx="9.5" ry="14" />
      <ellipse cx="60" cy="26" rx="9.5" ry="14" />
      <ellipse cx="80" cy="44" rx="9" ry="13" transform="rotate(22 80 44)" />
    </svg>
  );
}
