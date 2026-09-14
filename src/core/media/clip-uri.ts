/**
 * The only video a model may see is the finished web clip (FR-079, ADR-006): a URI ending
 * in `profiles/{pid}/media/{mid}/web.{rev}.mp4` — `gs://bucket/…` from a bucket store, or
 * the `file:///…` form the filesystem store answers for the same object (STORE=fs, where
 * only the fake describer ever runs). Ids and rev use their fixed alphabets and no segment
 * of the path may be `..`, so an original, a poster, an HTTPS URL or a path that climbs
 * out of its folder never matches. Every `Describer` refuses a URI this rejects; the caller
 * checks it first.
 */
const WEB_CLIP_URI =
  /^(gs:\/\/[^/]+|file:\/\/\/[^?#]*)\/profiles\/[a-z2-7]{8}\/media\/[a-z2-7]{8}\/web\.[0-9a-f]{10}\.mp4$/;

export function isWebClipUri(uri: string): boolean {
  return WEB_CLIP_URI.test(uri) && !uri.split("/").includes("..");
}
