// How the helper panel is laid out (design 2026-09-13 §4): the docked column beside the
// canvas (`docked` — from 768px, a 52px tab that opens as an overlay below 1180px and
// docks open from it, F46), or the content of the phone's sheet (`sheet` — never hidden,
// no collapse, the composer at the bottom). Independent of the protocol's `surface`,
// which stays the model's hint about the window (`use-helper.ts`, `prompt.ts`).

export type HelperLayout = "docked" | "sheet";
