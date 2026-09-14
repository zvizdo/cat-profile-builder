"use client";
import type { EditOperation } from "@/core/profile/operations";
import { capitalize, pronouns } from "@/core/profile/pronouns";
import { FIELD_LIMITS, type ProfileDocument } from "@/core/profile/schema";
import { inputClasses, LABEL_CLASSES } from "@/ui/shared/Field";
import { DraftField } from "./blocks/DraftField";
import { AGE_FIELD_ID, NAME_FIELD_ID, SEX_FIELD_ID } from "./readiness-scroll";
import { useWorkingLock } from "./working-lock";

// The facts (FR-014, FR-015; CONTENT.md → Rail `Facts`): the cat's name, age, sex and the
// one-line tagline the hero and the carousel show under the name. Each is one `set_field` on
// the profile; the name is what the topbar's heading mirrors. Name, age and sex are all
// needed to publish (F1, Checkpoint 2); the tagline never blocks it. F41: the name and
// tagline placeholders name the cat by pronoun, read from the sex already on `facts` — not
// set is `their`, the same fallback every other pronoun in the app falls back to.

/** The four profile fields, as the document holds them. */
export type Facts = Pick<ProfileDocument, "name" | "age" | "sex" | "tagline">;

export interface FactsFieldsProps {
  facts: Facts;
  onApply: (op: EditOperation, label?: string) => void;
}

type Sex = NonNullable<Facts["sex"]>;

const SEXES: ReadonlyArray<Sex> = ["female", "male", "unknown"];

// F10: "not set" is selectable at any time, not only while the field already is unset —
// choosing it clears `sex` (a `set_field` with `value: null`; see operations.ts), so a
// volunteer can back out of a recorded sex the same way they set one.
function SexSelect({
  value,
  onChange,
}: {
  value: Facts["sex"];
  onChange: (sex: Sex | null) => void;
}) {
  const working = useWorkingLock();
  return (
    <div className="flex flex-col gap-8">
      <label htmlFor={SEX_FIELD_ID} className={LABEL_CLASSES}>
        Sex
      </label>
      <select
        id={SEX_FIELD_ID}
        name="sex"
        value={value ?? ""}
        disabled={working}
        className={inputClasses(false)}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "" ? null : (next as Sex));
        }}
      >
        <option value="">not set</option>
        {SEXES.map((sex) => (
          <option key={sex} value={sex}>
            {sex}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Name, age, sex and tagline with their caps; the tagline counts to 80. */
export function FactsFields({ facts, onApply }: FactsFieldsProps) {
  const p = pronouns(facts.sex);
  const set = (path: "name" | "age" | "tagline", value: string) =>
    onApply({ op: "set_field", target: { kind: "profile" }, path, value });
  const setSex = (sex: Sex | null) =>
    onApply({ op: "set_field", target: { kind: "profile" }, path: "sex", value: sex });
  return (
    <div className="grid gap-12 md:grid-cols-[2fr_1fr_1fr]">
      <DraftField
        id={NAME_FIELD_ID}
        label="Name"
        value={facts.name}
        maxLength={FIELD_LIMITS.name}
        placeholder={`${capitalize(p.possessive)} name`}
        onCommit={(value) => set("name", value)}
      />
      <DraftField
        id={AGE_FIELD_ID}
        label="Age"
        value={facts.age ?? ""}
        maxLength={FIELD_LIMITS.age}
        placeholder="3 years"
        onCommit={(value) => set("age", value)}
      />
      <SexSelect value={facts.sex} onChange={setSex} />
      <div className="md:col-span-3">
        <DraftField
          label="Tagline"
          value={facts.tagline ?? ""}
          maxLength={FIELD_LIMITS.tagline}
          counter
          placeholder={`One line under ${p.possessive} name — or the bio's first sentence stands in`}
          onCommit={(value) => set("tagline", value)}
        />
      </div>
    </div>
  );
}
