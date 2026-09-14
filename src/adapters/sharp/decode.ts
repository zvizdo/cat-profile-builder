import "server-only";
import { UnsupportedError } from "@/core/errors";
import { UNSUPPORTED_MESSAGE } from "@/core/media/validation";

// What the three sharp adapters share: one way to report bytes that will not decode. A
// file whose magic bytes passed the sniff can still be truncated or corrupt; sharp then
// throws a plain `Error`, which here becomes the app's `unsupported` refusal with the
// decoder's text kept as `cause` for the log and never sent to a browser.

/** Runs one sharp operation; a decode failure is rethrown as an {@link UnsupportedError}. */
export async function decode<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new UnsupportedError(UNSUPPORTED_MESSAGE, { cause: error });
  }
}
