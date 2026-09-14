# ADR-010: Drag-and-drop

**Status**: accepted · **Date**: 2026-09-10

## Context

FR-022: reorder by dragging *and* by keyboard-operable controls; WCAG AA; touch on tablets
and phones. The design handoff flags keyboard and screen-reader behaviour for the canvas as
"not designed yet — flag it rather than guessing".

## Decision

**`@dnd-kit/core` + `@dnd-kit/sortable`** with the vertical-list strategy.

- Pointer, touch, and keyboard sensors; the keyboard sensor gives space-to-lift,
  arrow-to-move, space-to-drop with live-region announcements out of the box. Announcement
  strings are ours, in the content file, in the spec's voice.
- Explicit **Move up / Move down** buttons on the selected block are separate plain buttons
  that dispatch the same `reorder_blocks` operation (they are the FR-022 guarantee; the
  keyboard sensor is a bonus). Focus stays on the button after the move (acceptance
  scenario 1.3).
- The drop indicator is the design's 2 px blue rule with a mono "drop here" label.
- The library touches only the UI layer; the resulting order is passed to core as one
  `reorder_blocks` operation, so undo and validation are unchanged.

## Alternatives rejected

- **Pragmatic drag and drop** — smaller and framework-agnostic, but accessibility is a
  separate package to assemble.
- **Native HTML5 drag events** — no keyboard story, poor on touch, inconsistent ghost images.
  The one case where "prefer the platform" loses.
