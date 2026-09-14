/**
 * The one ok/error union every core operation answers with (plan.md → `src/core/result.ts`).
 * A caller switches on `ok`; there is no third shape and no exception path for expected
 * failures. `T` is what a success carries, `E` the typed error a failure carries.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** A successful {@link Result} carrying `value`. */
export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** A failed {@link Result} carrying `error`. */
export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}
