import { Readable } from "node:stream";

// A web stream over a Node stream that is not opened until the first read (F23 review,
// finding 2). `Readable.toWeb` starts pulling the moment it is built, so a store that
// answered a stream the route then cancelled — a `HEAD`, a `304`, a size lookup — would
// have opened a file, or a billable object GET on GCS, for nothing. Here `open` runs on
// the first `pull`, and never at all if the stream is cancelled before that.

/** A `ReadableStream` that calls `open` on its first read and forwards the Node stream's chunks. */
export function lazyWeb(open: () => Readable): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        reader ??= (Readable.toWeb(open()) as ReadableStream<Uint8Array>).getReader();
        const next = await reader.read();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      async cancel(reason) {
        if (reader !== null) await reader.cancel(reason);
      },
    },
    // No read-ahead: with the default high-water mark the stream would pull once on
    // construction, which is exactly the eager open being avoided.
    { highWaterMark: 0 },
  );
}
