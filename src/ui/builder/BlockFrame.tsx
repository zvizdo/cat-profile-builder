"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, type CSSProperties } from "react";
import { IconButton } from "@/ui/shared/IconButton";
import { Drag, MoveDown, MoveUp } from "@/ui/shared/icons";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import type { Block } from "@/core/profile/schema";
import { BlockBody } from "./BlockBody";
import { TouchedProvider, type TouchProps } from "./follow";
import { MoveProvider, type MoveControls } from "./phone/PhoneLabelRow";
import { blockElementId } from "./readiness-scroll";
import { moveButtonId } from "./reorder";
import type { BlockEditorProps } from "./blocks/editor-props";
import { useSurface } from "./use-surface";
import { useWorkingLock } from "./working-lock";

export { moveButtonId };

// One section on the canvas (hi-fi 3a; ADR-010): a handle column on the left — drag,
// move up, move down — then the block's editor, which draws the body and the label row
// with the type in mono and the actions (`BlockShell`). Selection is focus: a frame with
// focus anywhere inside it gets the 2px blue outline. The hero (F1: mandatory, fixed at
// the top) never sits here — {@link FixedHeroFrame} below is its frame, with no handle
// column and no `duplicate`/`remove`. F44: under 768px the handle column is not rendered
// at all — the phone's label row (`phone/PhoneLabelRow.tsx`, drawn by `BlockShell`)
// carries `↑` `↓` instead, through `MoveProvider`, and with no handle there is no
// sortable activator for a touch to start a drag from.

export interface BlockFrameProps extends Omit<BlockEditorProps, "labelId">, TouchProps {
  /** Where the block sits, so the ends of the stack know they cannot move further. */
  index: number;
  count: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

type Sortable = ReturnType<typeof useSortable>;

// The dragged frame follows the pointer on transform alone (constitution IX); nothing else
// moves until the drop, when the document reorders — the blue rule says where (ADR-010).
// The value is data, so it is inline.
function dragStyle(dragging: boolean, transform: Sortable["transform"]): CSSProperties {
  return dragging ? { transform: CSS.Translate.toString(transform) } : {};
}

// The frame: card ground, the 2px blue outline when focus is inside, lifted while
// dragged. `relative` so the pulse ring below can lie over the whole frame.
function frameClasses(dragging: boolean): string {
  return [
    "group relative flex bg-card focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-blue",
    dragging ? "z-10 shadow-lifted" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The helper's touch (F34, FR-042): the frame's own 2px blue focus ring, drawn over it
 * and blinked twice (`pulse-ring`, globals.css — 1.6s; under reduced motion one still
 * ring for the same time) — never a fill, so the block's words and photo stay as they
 * are. Keyed by the count, so a second touch of the same frame is a fresh ring that
 * starts its blink from the top; the builder drops the count when the blink is done.
 */
function PulseRing({ pulse }: Pick<TouchProps, "pulse">) {
  if (pulse === undefined) return null;
  return (
    <span
      key={pulse}
      data-pulse-ring
      aria-hidden="true"
      className="pulse-ring pointer-events-none absolute inset-0 z-10 outline-2 -outline-offset-1 outline-blue"
    />
  );
}

// The 2px blue rule with `drop here` (ADR-010), above or below the frame the drag is over.
function DropIndicator() {
  return (
    <div className="relative z-20 flex items-center gap-8 py-4" aria-hidden="true">
      <span className="flex-1 border-t-2 border-blue" />
      <MonoLabel className="text-blue">drop here</MonoLabel>
    </div>
  );
}

interface HandlesProps {
  /** Where the block stands and how to move it — the same object the phone row reads. */
  controls: MoveControls;
  /** `useSortable`'s activator ref callback: the drag handle is where a drag starts. */
  attach: Sortable["setActivatorNodeRef"];
  /** The sensors' attributes and listeners, spread onto the handle. */
  attributes: Sortable["attributes"];
  listeners: Sortable["listeners"];
}

// The ends of the stack use `aria-disabled` rather than `disabled`, so a Move button keeps
// focus after the block reaches the top or bottom (acceptance 1.3). The column is the tool,
// like the label row beneath the body (`BlockShell`): it keeps the chrome's colours on its
// own paper ground under every preset, so the frame's two tool edges read as one surface.
function Handles(props: HandlesProps) {
  const { controls, attach, attributes, listeners } = props;
  const { blockId, first, last, onMoveUp, onMoveDown } = controls;
  // F9: a real `disabled` while the helper works, on top of the ends-of-the-stack
  // `aria-disabled` — the drag handle's own sensors are already unarmed
  // (`CanvasStack`), this is belt and braces for the handle itself and for Move up/down,
  // which have no sensor to disable.
  const working = useWorkingLock();
  return (
    <div className="theme-chrome hidden shrink-0 flex-col items-center border-r border-line-chrome bg-paper py-4 text-meta md:flex">
      <IconButton
        ref={attach}
        icon={Drag}
        className="cursor-grab touch-none disabled:cursor-default"
        disabled={working}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      />
      <IconButton
        id={moveButtonId(blockId, "up")}
        icon={MoveUp}
        aria-label="Move up"
        aria-disabled={first}
        disabled={working}
        className="aria-disabled:opacity-50"
        onClick={first || working ? undefined : onMoveUp}
      />
      <IconButton
        id={moveButtonId(blockId, "down")}
        icon={MoveDown}
        aria-label="Move down"
        aria-disabled={last}
        disabled={working}
        className="aria-disabled:opacity-50"
        onClick={last || working ? undefined : onMoveDown}
      />
    </div>
  );
}

/**
 * A sortable frame: a `region` named by its mono label, with the drag handle, Move up
 * and Move down, every one ≥44px and keyboard-operable, and the editor for its type.
 * While a drag is over this frame the drop indicator shows on the side the block would
 * land. Under the tablet floor the handle column gives way to the phone label row's
 * `↑` `↓`, fed from here through `MoveProvider`.
 */
export function BlockFrame(props: BlockFrameProps) {
  const { block, index, count, onMoveUp, onMoveDown, pulse, touched = false, ...editor } = props;
  const labelId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
    isOver,
    activeIndex,
  } = useSortable({ id: block.id });
  const overFromBelow = isOver && !isDragging && activeIndex > index;
  const overFromAbove = isOver && !isDragging && activeIndex < index;
  const phone = useSurface() === "phone";
  const controls = { blockId: block.id, first: index === 0, last: index === count - 1 };
  return (
    <li>
      {overFromBelow ? <DropIndicator /> : null}
      <section
        ref={setNodeRef}
        id={blockElementId(block.id)}
        aria-labelledby={labelId}
        data-block-type={block.type}
        style={dragStyle(isDragging, transform)}
        className={frameClasses(isDragging)}
      >
        {phone ? null : (
          <Handles
            controls={{ ...controls, onMoveUp, onMoveDown }}
            attach={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
          />
        )}
        <MoveProvider controls={{ ...controls, onMoveUp, onMoveDown }}>
          <TouchedProvider touched={touched}>
            <BlockBody {...editor} block={block} labelId={labelId} />
          </TouchedProvider>
        </MoveProvider>
        <PulseRing pulse={pulse} />
      </section>
      {overFromAbove ? <DropIndicator /> : null}
    </li>
  );
}

/** Never called: `fixed` (`BlockShell`) hides the buttons that would call `onDuplicate`/`onRemove`. */
function unreachable(): void {}

export type FixedHeroFrameProps = Omit<
  BlockEditorProps<Extract<Block, { type: "hero" }>>,
  "labelId" | "onDuplicate" | "onRemove"
> &
  TouchProps;

/**
 * The hero's frame (F1: mandatory, fixed at the top of every profile): the same card
 * ground and focus outline as a sortable frame, but no handle column — nothing here can
 * drag, move, duplicate or remove it — and its editor (`HeroEditor`) renders `fixed`, so
 * the label row keeps only `replace photo`. Sits above the sortable `SortableContext` in
 * the canvas, not inside it.
 */
export function FixedHeroFrame(props: FixedHeroFrameProps) {
  const { block, pulse, touched = false, ...editor } = props;
  const labelId = useId();
  return (
    <section
      id={blockElementId(block.id)}
      aria-labelledby={labelId}
      data-block-type={block.type}
      className={frameClasses(false)}
    >
      <TouchedProvider touched={touched}>
        <BlockBody
          {...editor}
          block={block}
          labelId={labelId}
          onDuplicate={unreachable}
          onRemove={unreachable}
        />
      </TouchedProvider>
      <PulseRing pulse={pulse} />
    </section>
  );
}
