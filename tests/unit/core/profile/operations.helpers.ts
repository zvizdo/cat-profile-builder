import { expect } from "vitest";
import {
  applyOperation,
  type ApplyContext,
  type EditOperation,
  type MediaRef,
} from "@/core/profile/operations";
import { type ProfileDocument } from "@/core/profile/schema";

// Shared fixtures for the edit-operation tests: the media a test cat owns and a context
// whose block ids are predictable.

export const PHOTO_A = "media2aa";
export const PHOTO_B = "media2ab";
export const PHOTO_C = "media2ac";
export const PHOTO_D = "media2ad";
export const VIDEO_A = "video2aa";
/** An enhanced copy of {@link PHOTO_A}. */
export const ENHANCED_A = "enhan2aa";
/** A well-formed id no asset carries. */
export const UNOWNED = "nope2aaa";

export const ASSETS: MediaRef[] = [
  { id: PHOTO_A, kind: "photo" },
  { id: PHOTO_B, kind: "photo" },
  { id: PHOTO_C, kind: "photo" },
  { id: PHOTO_D, kind: "photo" },
  { id: VIDEO_A, kind: "video" },
  { id: ENHANCED_A, kind: "photo", enhancement: { sourceMediaId: PHOTO_A, recipe: "auto-v1" } },
];

export const NEW_ID = "blocknewaaaa";

export function ctx(overrides: Partial<ApplyContext> = {}): ApplyContext {
  return { assets: ASSETS, newBlockId: () => NEW_ID, ...overrides };
}

/** Applies `op` and returns the new document, failing the test if it was not accepted. */
export function applied(doc: ProfileDocument, op: EditOperation): ProfileDocument {
  const result = applyOperation(doc, op, ctx());
  if (!result.ok) throw new Error(`expected the operation to apply: ${result.error.reason}`);
  return result.value;
}

/**
 * Applies `op` and returns the error, failing the test if it was accepted. Also proves the
 * rejection left `doc` exactly as it was (Principle VIII), so every rejection case in the
 * suite is a purity-on-failure test.
 */
export function rejected(doc: ProfileDocument, op: EditOperation, context = ctx()) {
  const snapshot = structuredClone(doc);
  const result = applyOperation(doc, op, context);
  if (result.ok) throw new Error("expected the operation to be rejected");
  expect(result.error.reason).toMatch(/^[A-Z"].*\.$/);
  expect(doc).toEqual(snapshot);
  return result.error;
}
