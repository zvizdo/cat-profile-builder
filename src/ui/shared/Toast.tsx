import { useId, type CSSProperties, type ReactNode } from "react";
import { IconButton } from "./IconButton";
import { MonoLabel } from "./MonoLabel";
import { Close } from "./icons";

// Toasts report (design sheet §07): ink ground, white sentence, one mono action in
// blue-light, a clay edge on warnings and errors, and for progress a thin bar — never a
// spinner. Whether a toast goes away by itself is the caller's business (TOKENS.json
// `toast.autoDismissMs`); this component only offers the buttons.

/** The four kinds of report; progress carries its percentage. */
export type ToastVariant = "success" | "progress" | "warning" | "error";

/** The one thing a toast may offer, in CONTENT.md's words: `Undo`, `Use anyway`, `Try again`. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface BaseToastProps {
  children: ReactNode;
  action?: ToastAction;
}

/** The close button, for the toasts that stay: `dismissLabel` names it (`Dismiss`). */
interface Dismissable {
  onDismiss?: () => void;
  dismissLabel?: string;
}

/**
 * Progress needs `percent` (0–100); the other variants must not carry one. Success goes
 * away by itself (sheet §07), so it alone takes no close button.
 */
export type ToastProps =
  | (BaseToastProps & Dismissable & { variant: "progress"; percent: number })
  | (BaseToastProps & Dismissable & { variant: "warning" | "error"; percent?: never })
  | (BaseToastProps & { variant: "success"; percent?: never; onDismiss?: never });

function liveRole(variant: ToastVariant): "status" | "alert" {
  return variant === "error" ? "alert" : "status";
}

// The bar's width is data, not style: it is scaled on transform so it composites, and
// the value is the only thing the inline declaration carries.
function progressStyle(percent: number): CSSProperties {
  return { transform: `scaleX(${Math.min(100, Math.max(0, percent)) / 100})` };
}

// Named by the toast's own sentence, so "Uploading rain-day.mov — 2 of 3" is the bar's name.
function ProgressBar({ percent, labelId }: { percent: number; labelId: string }) {
  return (
    <div
      role="progressbar"
      aria-labelledby={labelId}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-4 w-full overflow-hidden rounded-pill bg-card/20"
    >
      <div
        className="h-full w-full origin-left bg-blue-light transition-transform duration-hover ease-progress"
        style={progressStyle(percent)}
      />
    </div>
  );
}

/**
 * One report. Success, progress and warning are `role="status"` (announced politely);
 * error is `role="alert"`. The action and the close button are real buttons, ≥44px, with
 * visible focus; success has no close button because it dismisses itself. Progress shows
 * the percentage and a transform-scaled bar. The clay edge marks warnings and errors;
 * nothing here spins.
 */
export function Toast(props: ToastProps) {
  const { variant, children, action } = props;
  const textId = useId();
  const edged = variant === "warning" || variant === "error";
  const classes = [
    "enter-panel flex w-full max-w-helper flex-col gap-8 rounded-control bg-ink px-16 py-8 text-card shadow-lifted",
    edged ? "edge-clay" : undefined,
  ];
  return (
    <div role={liveRole(variant)} className={classes.filter(Boolean).join(" ")}>
      <div className="flex min-h-44 items-center gap-12">
        {variant === "success" ? (
          <span aria-hidden="true" className="size-8 shrink-0 rounded-pill bg-blue-light" />
        ) : null}
        <p id={textId} className="flex-1 text-ui-dense text-card">
          {children}
        </p>
        {variant === "progress" ? (
          <MonoLabel className="text-card/60">{props.percent}%</MonoLabel>
        ) : null}
        {action === undefined ? null : (
          <button
            type="button"
            onClick={action.onClick}
            className="min-h-44 rounded-control px-8 text-blue-light transition-colors duration-hover ease-default hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            <MonoLabel className="whitespace-nowrap">{action.label}</MonoLabel>
          </button>
        )}
        {variant === "success" || props.onDismiss === undefined ? null : (
          <IconButton
            icon={Close}
            aria-label={props.dismissLabel ?? "Dismiss"}
            onClick={props.onDismiss}
            className="text-card/60"
          />
        )}
      </div>
      {variant === "progress" ? <ProgressBar percent={props.percent} labelId={textId} /> : null}
    </div>
  );
}

export interface ToastRegionProps {
  children: ReactNode;
  /** F44: on the phone builder the stack sits above the bottom bar (`--spacing-topbar`
   * plus the safe-area inset), at the phone's 16px gutter, so a toast never lands under
   * the Media and CATalyst tabs. */
  aboveBar?: boolean;
}

/** The phone's offset: the bar's height, the home-bar inset, and one 16px step of air. */
const ABOVE_BAR =
  "bottom-[calc(var(--spacing-topbar)+env(safe-area-inset-bottom)+var(--spacing-16))] left-16 pr-16";

/**
 * The fixed bottom-left stack toasts live in (TOKENS.json `toast.position`). A plain
 * container: each toast's own `role` is what announces it, so nothing is announced twice
 * through a nested live region. It holds no state and renders only what it is given.
 * `data-toasts` marks the stack for anything that must tell a toast from the page
 * behind it (the media rail's outside-click, F39).
 */
export function ToastRegion({ children, aboveBar = false }: ToastRegionProps) {
  return (
    <div
      data-toasts=""
      className={`pointer-events-none fixed z-30 flex max-w-full flex-col gap-12 *:pointer-events-auto ${aboveBar ? ABOVE_BAR : "bottom-28 left-28 pr-28"}`}
    >
      {children}
    </div>
  );
}
