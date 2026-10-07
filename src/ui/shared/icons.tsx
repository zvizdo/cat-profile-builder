import type { ReactElement, ReactNode } from "react";

// The tools' geometric icons (design sheet §06): a 20px box, 1.5px stroke, `currentColor`,
// never filled. Every one is decorative — the control that carries it supplies the name —
// so all are hidden from assistive technology.

/** What an icon accepts: only a class, for colour or placement; size is fixed at 20px. */
export interface IconProps {
  className?: string;
}

/** An icon component from this set — what `IconButton` takes. */
export type Icon = (props: IconProps) => ReactElement;

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["size-20 shrink-0", className].filter(Boolean).join(" ")}
    >
      {children}
    </svg>
  );
}

/** Two crossed strokes: dismiss or close. */
export const Close: Icon = (p) => (
  <Svg {...p}>
    <path d="M4 4l12 12M16 4L4 16" />
  </Svg>
);

/** An arc curling back to the left: undo. */
export const Undo: Icon = (p) => (
  <Svg {...p}>
    <path d="M4 8h8a4 4 0 0 1 0 8H8M7 5L4 8l3 3" />
  </Svg>
);

/** The undo arc mirrored: redo. */
export const Redo: Icon = (p) => (
  <Svg {...p}>
    <path d="M16 8H8a4 4 0 0 0 0 8h4M13 5l3 3-3 3" />
  </Svg>
);

/** Chevron up: move a block one place earlier. */
export const MoveUp: Icon = (p) => (
  <Svg {...p}>
    <path d="M5 12l5-5 5 5" />
  </Svg>
);

/** Chevron down: move a block one place later. */
export const MoveDown: Icon = (p) => (
  <Svg {...p}>
    <path d="M5 8l5 5 5-5" />
  </Svg>
);

/** Two offset squares: duplicate a block. */
export const Duplicate: Icon = (p) => (
  <Svg {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7" />
  </Svg>
);

/** A minus in a circle: remove a block (the destructive one, always clay). */
export const Remove: Icon = (p) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M7 10h6" />
  </Svg>
);

/** A frame with a small sun: a photo. */
export const Photo: Icon = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
    <circle cx="7" cy="7" r="1.5" />
  </Svg>
);

/** A frame with a lens flap: a video clip. */
export const Video: Icon = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="5" width="11" height="10" rx="2" />
    <path d="M13.5 9l4-2.5v7l-4-2.5" />
  </Svg>
);

/** A four-point spark: enhance a photo. */
export const Enhance: Icon = (p) => (
  <Svg {...p}>
    <path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8z" />
  </Svg>
);

/** Six dots: the drag handle for reordering. */
export const Drag: Icon = (p) => (
  <Svg {...p}>
    {[5, 10, 15].flatMap((y) =>
      [7, 13].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.25" fill="currentColor" />),
    )}
  </Svg>
);

/** A tick: done, passes, saved. */
export const Check: Icon = (p) => (
  <Svg {...p}>
    <path d="M4 10.5l4 4 8-9" />
  </Svg>
);

/** A triangle with a bar: warning. */
export const Warning: Icon = (p) => (
  <Svg {...p}>
    <path d="M10 3l7.5 13h-15zM10 8v4M10 14.5h.01" />
  </Svg>
);

/** A triangle pointing right: play. */
export const Play: Icon = (p) => (
  <Svg {...p}>
    <path d="M6 4l10 6-10 6z" />
  </Svg>
);

/** Two bars: pause. */
export const Pause: Icon = (p) => (
  <Svg {...p}>
    <path d="M7 4v12M13 4v12" />
  </Svg>
);

/** Chevron left: previous. */
export const Prev: Icon = (p) => (
  <Svg {...p}>
    <path d="M12 5l-5 5 5 5" />
  </Svg>
);

/** Chevron right: next. */
export const Next: Icon = (p) => (
  <Svg {...p}>
    <path d="M8 5l5 5-5 5" />
  </Svg>
);

/** A plus: add. */
export const Add: Icon = (p) => (
  <Svg {...p}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);

/** An arrow to the upper right: open, leave for the page this points at. */
export const Open: Icon = (p) => (
  <Svg {...p}>
    <path d="M6 14l8-8M8 6h6v6" />
  </Svg>
);

/** An arrow pointing up: send what is typed. */
export const Send: Icon = (p) => (
  <Svg {...p}>
    <path d="M10 16V4M5 9l5-5 5 5" />
  </Svg>
);

/** Four corner brackets pointing outward: go full screen. */
export const Expand: Icon = (p) => (
  <Svg {...p}>
    <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
  </Svg>
);
