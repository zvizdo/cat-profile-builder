// The public page's section words (CONTENT.md → Public profile): `Who she is`, `A day in
// her life`, `What she needs in a home`, and the nav's `Her day`. They are Charlotte's
// strings; the same sentences follow a male or unrecorded cat with its own pronoun. F41:
// moved to `src/core/profile/pronouns.ts` so the public page, the builder's own copy and
// the publish sentences (`src/ui/builder/publish-strings.ts`) share one pronoun table —
// re-exported here so every existing import of this module keeps working.
export { sectionStrings, type SectionStrings } from "@/core/profile/pronouns";
