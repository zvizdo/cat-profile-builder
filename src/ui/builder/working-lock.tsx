"use client";
import { createContext, useContext, useEffect, type ReactNode, type RefObject } from "react";

// F9: while the AI helper is mid-turn (`state.helper.status === "working"`), the whole
// profile is read-only. One source of truth rather than a `working` prop threaded through
// every editor, tile and field between here and the leaf that renders a control (the
// controller's own ruling): `FullBuilder`/`PhoneMode` compute `working` once, from
// `session.state.helper.status`, and provide it; every control that can edit the document
// reads `useWorkingLock()` for itself. Outside a provider (every test and surface that
// never mounts the builder) the default is `false`, so nothing elsewhere in the app has to
// know this context exists.

const WorkingLockContext = createContext(false);

/** CONTENT.md → Helper, Failure — Publish's own refusal while a turn is streaming (FR-081). */
export const WAIT_FOR_HELPER = "Wait for CATalyst to finish.";

export interface WorkingLockProviderProps {
  working: boolean;
  children: ReactNode;
}

/** Marks the subtree beneath it read-only (or not) for as long as `working` says so. */
export function WorkingLockProvider({ working, children }: WorkingLockProviderProps) {
  return <WorkingLockContext.Provider value={working}>{children}</WorkingLockContext.Provider>;
}

/** True while the helper is mid-turn and every edit control beneath the provider is refused. */
export function useWorkingLock(): boolean {
  return useContext(WorkingLockContext);
}

/** The element id the read-only region's own root is given, so a lost focus (below) has
 * somewhere fixed to look for. */
export const HELPER_PANEL_ID = "helper-panel";

/**
 * When the lock engages with focus somewhere inside `region` (a block editor, a facts
 * field, the theme picker, …), that focus would otherwise land inside a control that
 * just went `disabled` — invisible to the keyboard and to a screen reader alike. Moves
 * it to the helper panel's own root instead (`HelperPanel.tsx` gives it `tabIndex={-1}`
 * for exactly this), which stays reachable throughout — its composer is disabled for the
 * same turn, but a pending card never is. Shared by the full builder and phone mode, the
 * two trees that each have their own read-only region and their own helper panel.
 */
export function useLockFocus(working: boolean, region: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!working) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || region.current === null) return;
    if (!region.current.contains(active)) return;
    document.getElementById(HELPER_PANEL_ID)?.focus();
  }, [working, region]);
}
