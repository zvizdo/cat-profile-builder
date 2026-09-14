// The helper's reply is model text, and model text is untrusted input (constitution,
// Principle VI). Everything about *rendering* the safe Markdown subset — escaping raw
// HTML, dropping images, styling headings — lives in `src/ui/helper/Markdown.tsx`, which
// depends on a rendering library the framework-free core must never import (Principle I).
// The one rule worth pulling out here, so it is provable at the core's 95%/95% coverage
// bar rather than only reachable through a rendered component, is which link schemes a
// reply's Markdown may point at (ADR-017).

/** The only URL schemes a helper reply's Markdown link may use. */
const ALLOWED_MARKDOWN_URL_SCHEMES: readonly string[] = ["http:", "https:", "mailto:"];

/**
 * Whether `url` is safe to render as a Markdown link's `href` — an absolute `http:`,
 * `https:` or `mailto:` URL. Anything else (`javascript:`, `data:`, a bare relative path,
 * a string that is not a URL at all) is rejected; the renderer drops the link's `href`
 * rather than guess at what was meant.
 */
export function isAllowedMarkdownUrl(url: string): boolean {
  try {
    return ALLOWED_MARKDOWN_URL_SCHEMES.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
