import type { ReactNode } from "react";
import type { Block } from "@/core/profile/schema";
import { frameLabel } from "../block-content";
import { JustNowTag, useTouchedByHelper } from "../follow";
import { PhoneLabelRow } from "../phone/PhoneLabelRow";
import { useSurface } from "../use-surface";
import { useWorkingLock } from "../working-lock";
import { Pill } from "./Pill";
import { useTouchBand } from "./use-touch-band";

// The part of a frame every editor shares (hi-fi 3a): the body, then the label row with
// the type in mono on the left and the actions on the right — the editor's own first
// (`replace photo`, `re-trim`, `add photos`, …), then `duplicate` (never on the hero,
// FR-021) and `remove` in clay. The row is in the DOM for the keyboard and fades in when
// the frame is hovered or holds focus, as the hi-fi shows actions on the selected frame.
// The row is the tool, not the page: it keeps the chrome's colours (`theme-chrome`) on
// its own paper ground whatever theme the frame wears, so clay `remove` and blue actions
// hold 4.5:1 on Sand and Night as well — the themed surface put clay under the floor.
// F44: under 768px there is no hover, so the row is the phone label row instead
// (`phone/PhoneLabelRow.tsx`: kicker, `↑` `↓`, `duplicate`, `remove` as icon buttons,
// always visible) and the editor's own actions move into the body as visible buttons.
// F47 (F28 review #6; comp 7c "iPad 1024×768 · touch-first"): the touch band between
// that floor and the docked `wide` column (768–1179, `useTouchBand`) has no hover
// either, but keeps the desktop's row shape (label left, actions right) rather than the
// phone's icon row — a finger just can't wait for a hover it will never get, so the
// same actions draw as always-visible chips (`Pill.tsx`): `secondary` (the same chip
// the phone's own `PhoneActions` already draws) and `destructive` for `remove`, each
// rounded-full — comp 7c's pills are fully rounded, `radius.pill` (99), not a
// colour-only stand-in for the hover-revealed text. The tap floor is already built
// into `Button`. At `wide` (1180) and up the hover reveal is exactly what it always was.

/** One text action on the label row; `id` lets an editor hand it focus; `disabled` while its own call runs. */
export interface ShellAction {
  label: string;
  onClick: () => void;
  id?: string;
  disabled?: boolean;
}

export interface BlockShellProps {
  block: Block;
  /** The id the frame's `region` is labelled by. */
  labelId: string;
  /** The editor's own actions, before `duplicate` and `remove`. */
  actions?: ShellAction[];
  /**
   * True for the hero's frame (F1: mandatory and fixed at the top of every profile): no
   * `duplicate`, no `remove` — the hero can only ever have its photo replaced. The row's
   * own `actions` (`replace photo`) still show.
   */
  fixed?: boolean;
  /**
   * No body padding (F28 review #10, comp 3a): the hero's photo is full-bleed inside its
   * frame, edge to edge, rather than sitting on the body's usual 16px inset. Every other
   * editor keeps the inset.
   */
  flush?: boolean;
  onDuplicate: () => void;
  onRemove: () => void;
  children: ReactNode;
}

const ACTION =
  "inline-flex min-h-44 items-center rounded-control px-8 font-label text-mono-label tracking-normal " +
  "transition-colors duration-hover ease-default hover:underline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2";

function Action({
  label,
  onClick,
  id,
  tone,
  disabled,
}: Omit<ShellAction, "disabled"> & { tone: "blue" | "clay"; disabled: boolean }) {
  const colour =
    tone === "blue"
      ? "text-blue focus-visible:outline-blue"
      : "text-clay focus-visible:outline-clay";
  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      className={`${ACTION} ${colour} disabled:pointer-events-none disabled:opacity-50`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** The editor's actions as text buttons, each disabled by the lock or by its own call. */
function Actions({ actions, working }: { actions: ShellAction[]; working: boolean }) {
  return actions.map(({ disabled = false, ...action }) => (
    <Action
      key={action.id ?? action.label}
      tone="blue"
      disabled={working || disabled}
      {...action}
    />
  ));
}

// The same actions on the phone (design §2; comp 7c's touch rule: a finger cannot find a
// 10px caption): bordered chips at the dense chrome size, 44px tall, always visible.
function PhoneActions({ actions, working }: { actions: ShellAction[]; working: boolean }) {
  return (
    <div className="mt-12 flex flex-wrap gap-8">
      {actions.map(({ disabled = false, id, label, onClick }) => (
        <Pill
          key={id ?? label}
          id={id}
          variant="secondary"
          disabled={working || disabled}
          onClick={onClick}
        >
          {label}
        </Pill>
      ))}
    </div>
  );
}

// The same actions again, but as bordered chips rather than mono links — the same chip
// `PhoneActions` above already draws for the phone — standing in for the `Action`
// pairing above's blue text. Always in the flow, never faded.
function PillActions({ actions, working }: { actions: ShellAction[]; working: boolean }) {
  return actions.map(({ disabled = false, id, label, onClick }) => (
    <Pill
      key={id ?? label}
      id={id}
      variant="secondary"
      disabled={working || disabled}
      onClick={onClick}
    >
      {label}
    </Pill>
  ));
}

interface EndProps {
  fixed: boolean;
  working: boolean;
  onDuplicate: () => void;
  onRemove: () => void;
}

// `duplicate` and `remove` as the touch band's chips — the row's own two, always after
// the editor's actions, never on the hero's `fixed` frame.
function PillEnd({ fixed, working, onDuplicate, onRemove }: EndProps) {
  if (fixed) return null;
  return (
    <>
      <Pill variant="secondary" disabled={working} onClick={onDuplicate}>
        duplicate
      </Pill>
      <Pill variant="destructive" disabled={working} onClick={onRemove}>
        remove
      </Pill>
    </>
  );
}

// The same pair as `wide`'s hover-gated text links.
function ActionEnd({ fixed, working, onDuplicate, onRemove }: EndProps) {
  if (fixed) return null;
  return (
    <>
      <Action label="duplicate" tone="blue" disabled={working} onClick={onDuplicate} />
      <Action label="remove" tone="clay" disabled={working} onClick={onRemove} />
    </>
  );
}

interface RowProps extends Omit<BlockShellProps, "block" | "children"> {
  label: string;
  touched: boolean;
  working: boolean;
}

// The desktop row: the label on the left; the actions on the right. At `wide` (1180)
// and up they are in the DOM for the keyboard and faded in when the frame is hovered or
// holds focus; in the touch band below it (`useTouchBand`, F47) a finger has no hover to
// reveal them with, so the same actions draw as always-visible pills instead.
function DesktopLabelRow(props: RowProps) {
  const { label, labelId, actions = [], fixed = false, touched, working } = props;
  const touchBand = useTouchBand();
  const end = { fixed, working, onDuplicate: props.onDuplicate, onRemove: props.onRemove };
  return (
    <div className="theme-chrome flex items-center justify-between gap-12 border-t border-line-chrome bg-paper px-12">
      <div className="flex min-h-44 flex-wrap items-center gap-x-12 gap-y-4 py-4">
        <span id={labelId} className="font-label text-mono-label tracking-normal text-meta">
          {label}
        </span>
        {touched ? <JustNowTag /> : null}
      </div>
      {touchBand ? (
        <div className="flex flex-wrap items-center gap-8 py-4">
          <PillActions actions={actions} working={working} />
          <PillEnd {...end} />
        </div>
      ) : (
        <div className="flex gap-4 opacity-0 transition-opacity duration-hover ease-default group-focus-within:opacity-100 group-hover:opacity-100">
          <Actions actions={actions} working={working} />
          <ActionEnd {...end} />
        </div>
      )}
    </div>
  );
}

/**
 * The body over the label row; the row carries the mono label the frame is named by. F9:
 * every action here — the editor's own (`replace photo`, `re-trim`, `add photos`,
 * `rewrite`, `shorten`, …), `duplicate`, `remove` — is one place to disable while the
 * helper works, since every block editor's label row is built through this shell. F34:
 * the `CATalyst · just now` tag sits beside the label, outside the span the region is
 * named by, so a touched frame is still "BIO · …" to a screen reader. On the phone the
 * editor's own actions sit under the body, always visible — a finger has no hover to
 * reveal them with — and the row is `PhoneLabelRow`.
 */
export function BlockShell(props: BlockShellProps) {
  const { block, labelId, actions = [], fixed = false, flush = false } = props;
  const { onDuplicate, onRemove, children } = props;
  const working = useWorkingLock();
  const touched = useTouchedByHelper();
  const phone = useSurface() === "phone";
  const label = frameLabel(block);
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div data-block-body className={flush ? "p-0" : "p-16"}>
        {children}
        {phone && actions.length > 0 ? <PhoneActions actions={actions} working={working} /> : null}
      </div>
      {phone ? (
        <PhoneLabelRow
          labelId={labelId}
          label={label}
          touched={touched}
          fixed={fixed}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      ) : (
        <DesktopLabelRow {...props} label={label} touched={touched} working={working} />
      )}
    </div>
  );
}
