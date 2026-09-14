"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { OpenEditor } from "./use-media-library";

// F39: the library's editors — the focal point sheet, the trim modal — opened from a
// block on the canvas. The hero's `focal point` action is the first caller (the comp's
// 7b label row: you set the crop on the photo whose crop you are looking at). The shell
// owns the library and mounts the one sheet inside the rail; the editor only needs the
// way to ask for it. A context rather than one more prop threaded through the canvas,
// the stack and the frame to reach one editor (the same ruling as `working-lock`): every
// block editor already carries seven props, and the frame has no use for this one.
// Outside a provider — every test and surface that never mounts the builder — the hook
// answers `null`, and the action that would need it is simply not offered.

/** Opens the library's editor `kind` over the record `mediaId`. */
export type OpenLibraryEditor = (kind: OpenEditor["kind"], mediaId: string) => void;

const OpenEditorContext = createContext<OpenLibraryEditor | null>(null);

export interface OpenEditorProviderProps {
  open: OpenLibraryEditor;
  children: ReactNode;
}

/** Lets the block editors beneath it open the library's editors. */
export function OpenEditorProvider({ open, children }: OpenEditorProviderProps) {
  return <OpenEditorContext.Provider value={open}>{children}</OpenEditorContext.Provider>;
}

/** The library's `openEditor`, or `null` where no builder shell provides one. */
export function useOpenEditor(): OpenLibraryEditor | null {
  return useContext(OpenEditorContext);
}
