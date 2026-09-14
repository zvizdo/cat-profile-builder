// The carousel's fixed copy (CONTENT.md → Event carousel), in one place so the components
// and the tests read the same words.

/** The top-left label. */
export const HEADER = {
  label: "Adoptable now",
} as const;

/** The footer's left label. */
export const UP_NEXT = "Up next";

/** The QR card's three strings; the middle one takes the cat's name. */
export const QR = {
  label: "Scan",
  page: (name: string) => `${name}'s page`,
  sentence: "Photos and the full story",
  alt: (name: string) => `Scan — ${name}'s page`,
} as const;

/** The empty rotation (FR-067). */
export const EMPTY = {
  title: "Nothing in the rotation",
  line: "No cats are on the carousel right now.",
  detail:
    "Switch a cat back to IN and the loop rebuilds itself. Until then the screen stays dark rather than showing an empty frame.",
} as const;

/** The visible controls' names (FR-063). */
export const CONTROLS = {
  group: "Carousel controls",
  prev: "Previous cat",
  next: "Next cat",
  pause: "Pause",
  resume: "Resume",
  open: (name: string) => `Open ${name}'s page`,
} as const;

/** The kiosk's offline note (CONTENT.md → Event carousel → Offline): the sentence and the dated line. */
export const OFFLINE = {
  sentence: "The carousel keeps looping on yesterday's cats.",
  updated: (time: string) => `Last updated ${time}`,
} as const;
