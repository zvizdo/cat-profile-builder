import { MonoLabel } from "./MonoLabel";

// DESIGN.md §4 Media: an empty slot is 45° stripes with a mono label saying what belongs
// there — never a spinner, never a grey box. The stripes are the `stripes` utility in
// globals.css, the one place that gradient is written.

/** The shape of the slot; omitted, the parent sizes it. */
export type PlaceholderAspect = "square" | "video";

const ASPECT: Record<PlaceholderAspect, string> = {
  square: "aspect-square",
  video: "aspect-video",
};

interface BaseProps {
  /** What belongs here, in CONTENT.md's words: `drop a photo`, `+ add section`, … */
  label: string;
  aspect?: PlaceholderAspect;
  className?: string;
  /** An element id, for the shell to hand focus to the slot. */
  id?: string;
}

/** A plain slot (`div`), or the add-section affordance (`button`) with what it does. */
export type StripedPlaceholderProps =
  | (BaseProps & { as?: "div" })
  | (BaseProps & { as: "button"; onClick: () => void; disabled?: boolean });

/**
 * A striped, labelled empty slot. As a `button` it is a real button: ≥44px tall, focusable,
 * fires on Enter and Space, with a visible focus outline and the label darkening on hover.
 * As a `div` it is inert and carries no role.
 */
export function StripedPlaceholder(props: StripedPlaceholderProps) {
  const { label, aspect, className, id } = props;
  const base = [
    "stripes grid min-h-44 w-full place-items-center rounded-control p-16 text-meta",
    aspect === undefined ? undefined : ASPECT[aspect],
    className,
  ];
  const text = <MonoLabel className="text-center">{label}</MonoLabel>;
  if (props.as === "button") {
    const classes = [
      ...base,
      "cursor-pointer transition-colors duration-hover ease-default hover:text-ink",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
      "disabled:pointer-events-none disabled:cursor-default disabled:opacity-50",
    ];
    return (
      <button
        type="button"
        id={id}
        disabled={props.disabled}
        className={classes.filter(Boolean).join(" ")}
        onClick={props.onClick}
      >
        {text}
      </button>
    );
  }
  return (
    <div id={id} className={base.filter(Boolean).join(" ")}>
      {text}
    </div>
  );
}
