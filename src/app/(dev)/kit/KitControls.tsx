import { Badge, type BadgeStatus } from "@/ui/shared/Badge";
import { Button } from "@/ui/shared/Button";
import { Field } from "@/ui/shared/Field";
import { IconButton } from "@/ui/shared/IconButton";
import { StripedPlaceholder } from "@/ui/shared/StripedPlaceholder";
import * as icons from "@/ui/shared/icons";
import { AddSection } from "./KitNotices";
import { Group, Panel, Specimen } from "./KitPanel";

// The stateless half of the kit: every control in every static state, with CONTENT.md's
// words. Focus states are seen by pressing Tab — nothing here fakes them.

const STATUSES: BadgeStatus[] = ["live", "draft", "archived", "unfinished", "enhanced"];

const ICONS = Object.entries(icons).filter(
  (entry): entry is [string, icons.Icon] => typeof entry[1] === "function",
);

/** Buttons and fields: the four button variants plus disabled, a field plain and wrong. */
export function ControlsGroup() {
  return (
    <Group title="Controls" note="Tab through them: focus changes the control, not only a ring.">
      <Panel caption="Buttons">
        <div className="flex flex-wrap items-center gap-12">
          <Button>Publish</Button>
          <Button variant="secondary">Preview</Button>
          <Button variant="ghost">Skip for now</Button>
          <Button variant="destructive">Remove section</Button>
        </div>
        <div className="flex flex-wrap items-center gap-12">
          <Button disabled>Publish</Button>
          <Button variant="secondary" disabled>
            Preview
          </Button>
          <Button variant="destructive" disabled>
            Remove section
          </Button>
        </div>
      </Panel>
      <Panel caption="Fields">
        <Field id="kit-name" name="name" label="Cat name" defaultValue="Charlotte" />
        <Field
          id="kit-fee"
          name="fee"
          label="Adoption fee"
          placeholder="$95"
          error="Every published profile shows a fee, even if it's $0."
        />
      </Panel>
    </Group>
  );
}

/** Status words, striped media slots, and the icon buttons that act on a block. */
export function StatusGroup() {
  return (
    <Group
      title="Status & media"
      note="One blue thing per screen. Empty media is striped and labelled."
    >
      <Panel caption="Badges">
        <div className="flex flex-wrap items-center gap-12">
          {STATUSES.map((status) => (
            <Badge key={status} status={status} />
          ))}
        </div>
      </Panel>
      <Panel caption="Empty slots">
        <div className="grid grid-cols-3 gap-8">
          <StripedPlaceholder label="drop a photo" aspect="square" />
          <StripedPlaceholder label="drop here" aspect="square" />
          <StripedPlaceholder label="processing" aspect="square" />
        </div>
        <AddSection />
      </Panel>
      <Panel caption="Icon buttons">
        <div className="flex flex-wrap items-center gap-4 text-ink">
          <IconButton icon={icons.Undo} aria-label="Undo" />
          <IconButton icon={icons.Redo} aria-label="Redo" disabled />
          <IconButton icon={icons.MoveUp} aria-label="Move up" />
          <IconButton icon={icons.MoveDown} aria-label="Move down" />
          <IconButton icon={icons.Duplicate} aria-label="Duplicate" />
          <IconButton icon={icons.Remove} aria-label="Remove section" variant="danger" />
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-control bg-ink p-8 text-card">
          <IconButton icon={icons.Prev} aria-label="Previous cat" />
          <IconButton icon={icons.Pause} aria-label="Pause" />
          <IconButton icon={icons.Next} aria-label="Next cat" />
        </div>
      </Panel>
      <Panel caption="Icons · 20px, 1.5px stroke, never filled">
        <div className="grid grid-cols-3 gap-20 text-ink sm:grid-cols-4 md:grid-cols-6">
          {ICONS.map(([name, Glyph]) => (
            <Specimen key={name} label={name}>
              <Glyph className="text-ink" />
            </Specimen>
          ))}
        </div>
      </Panel>
    </Group>
  );
}
