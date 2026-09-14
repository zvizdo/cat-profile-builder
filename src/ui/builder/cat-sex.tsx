"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { ProfileDocument } from "@/core/profile/schema";

// F41: the cat's recorded sex, for the block editors that put a pronoun in their own copy
// (the bio's kicker, a needs card's placeholder, the quote's placeholder) — the same
// reasoning as `working-lock.tsx`'s own context: threading a `catSex` prop through
// `Canvas` → `CanvasStack` → `BlockFrame` the way `catName` already goes would touch three
// files this change does not own. `FullBuilder` mounts one provider from
// `state.doc.sex`; every editor beneath reads for itself. Outside a provider (every test
// that renders an editor directly, and phone mode, which has no block editors) the default
// is `undefined` — "not set" — which reads as "they", the same fallback the public page and
// the section picker already use.

const CatSexContext = createContext<ProfileDocument["sex"]>(undefined);

export interface CatSexProviderProps {
  sex: ProfileDocument["sex"];
  children: ReactNode;
}

/** Marks the subtree beneath it with the cat's recorded sex, for any copy with a pronoun in it. */
export function CatSexProvider({ sex, children }: CatSexProviderProps) {
  return <CatSexContext.Provider value={sex}>{children}</CatSexContext.Provider>;
}

/** The cat's recorded sex, or `undefined` — "not set" — outside a provider. */
export function useCatSex(): ProfileDocument["sex"] {
  return useContext(CatSexContext);
}
