import "server-only";
import { fileTypeFromBuffer } from "file-type";

// Content sniffing (ADR-005 step 3): the real type of an upload is read from its magic
// bytes, so neither the file name nor the type the browser declared ever decides what a
// file is. `file-type` recognises HEIC/HEIF too, which `checkUpload` then refuses by name.

/**
 * How much of a file the sniff needs. Every accepted format announces itself in its first
 * bytes; MP4/MOV do so in an `ftyp` box that sits near, but not always at, the start.
 */
export const SNIFF_BYTES = 64 * 1024;

/**
 * The MIME type the bytes announce (`image/jpeg`, `video/quicktime`, `image/heic`…), or
 * `undefined` when they announce nothing this sniffer knows — the shape `checkUpload`
 * takes as `sniffedType`. Give it the first {@link SNIFF_BYTES} of the file.
 */
export async function sniffType(bytes: Uint8Array): Promise<string | undefined> {
  return (await fileTypeFromBuffer(bytes))?.mime;
}
