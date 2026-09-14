"use client";
import Image from "next/image";
import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { AssetView } from "@/adapters/pipeline/asset-view";
import { pronouns } from "@/core/profile/pronouns";
import type { ProfileDocument } from "@/core/profile/schema";
import { Button } from "@/ui/shared/Button";
import { Modal } from "@/ui/shared/Modal";
import { MonoLabel } from "@/ui/shared/MonoLabel";
import { useCatSex } from "./cat-sex";
import { CENTRE, focalFromPoint, nudgeFocal, readout, type Focal } from "./focal-math";
import { useSurface } from "./use-surface";

// The focal point sheet (hi-fi 7a; CONTENT.md → Focal point): the whole photo at its own
// proportions, a ring on the point, a click or the arrow keys move it, and beside it the
// four crops the site derives from that one point, redrawn live — the hero's with the
// cat's name on it, since that is what is being positioned. The arithmetic is in
// `focal-math`; the sentences are CONTENT.md's; the point is saved once, as whole
// percentages. F39: the photo decides the sheet, as the clip decides the trim editor —
// no 16:9 box, so a portrait photo stands full height instead of between two pillars.
// F41: the body names the cat by pronoun (`her` / `his` / `their`, read from `useCatSex()`).

/** Every sentence on the sheet but `body`, from CONTENT.md → Focal point and Modals. */
const COPY = {
  title: "Where should the crop hold on?",
  hint: "Arrow keys nudge by 1%, shift by 10%",
  reset: "Reset to centre",
  save: "Save focal point",
  cancel: "Cancel",
  crops: "Derived crops · live",
} as const;

/**
 * `Click her face.` / `Click his face.` / `Click their face.`, then the rest of CONTENT.md's
 * sentence — `Tap`, not `Click`, under the tablet floor, where there is no pointer to click
 * with (CONTENT.md → Rail, F39).
 */
function bodyFor(sex: ProfileDocument["sex"], touch: boolean): string {
  const p = pronouns(sex);
  const verb = touch ? "Tap" : "Click";
  return `${verb} ${p.possessive} face. Every crop on the site, the phone and the carousel is derived from this one point.`;
}

export interface FocalPickerProps {
  /** A ready photo; `cleanUrl` is what the sheet shows. */
  asset: AssetView;
  /** The cat's display name, written over the hero crop as the hero itself writes it. */
  catName: string;
  /** Sends the point; answers whether it landed. The sheet closes only when it did. */
  onSave: (focal: Focal) => Promise<boolean>;
  onClose: () => void;
}

/** The photo box: this tall, its own proportions wide, never past the column (the trim editor's rule). */
const PHOTO_HEIGHT = "60vh";

/** The box's width, from the record — data, so it is inline; the button carries the ratio. */
function boxWidth(asset: AssetView): string {
  return `min(100%, calc(${PHOTO_HEIGHT} * ${asset.width / asset.height}))`;
}

/**
 * The photo decides the panel, as the clip decides the trim editor's: the box's width
 * beside the crops column (the helper's width), plus the panel's padding and the gap —
 * never narrower than half the profile width, so the title still reads in two lines
 * over a portrait photo. The window binds it from above.
 */
function panelWidth(asset: AssetView): string {
  const ratio = asset.width / asset.height;
  const box = `${PHOTO_HEIGHT} * ${ratio} + var(--container-helper) + 2 * var(--spacing-28) + var(--spacing-16)`;
  return `max(calc(var(--container-profile-max) / 2), calc(${box}))`;
}

// The four places a crop is derived (hi-fi 7a): each box is `cover` on the same point.
// As in the comp the boxes are windows of a set height, not the surfaces' true
// proportions — the comp's 112 / 150 / 104 px are all the scale's 120 here — so the four
// stack without a gap and the sheet fits a laptop window.
const CROPS = {
  hero: { label: "profile hero · 1440×840", scrim: "hero" },
  phone: { label: "phone · 390×560", scrim: null },
  list: { label: "list card · 4:3", scrim: null },
  carousel: { label: "carousel · 1920×1080", scrim: "carousel" },
} as const;

type CropSpec = (typeof CROPS)[keyof typeof CROPS];

const SCRIM = {
  hero: "bg-linear-to-b from-night/20 via-transparent via-45% to-night/70",
  carousel: "bg-linear-to-r from-night/90 via-night/50 via-40% to-night/10",
} as const;

interface CropProps {
  src: string;
  focal: Focal;
  crop: CropSpec;
  /** The hero crop carries the cat's name in the display face, white on the scrim, as the hero does. */
  name?: string;
}

// One derived crop: the photo covering its box on the point, under the scrim that surface
// paints (the carousel also starts its drift a touch zoomed in).
function Crop({ src, focal, crop, name }: CropProps) {
  return (
    <div className="flex flex-col gap-4">
      <MonoLabel className="text-meta">{crop.label}</MonoLabel>
      <div className="relative h-120 w-full overflow-hidden bg-night">
        <Image
          src={src}
          alt=""
          fill
          unoptimized
          className={crop.scrim === "carousel" ? "scale-105 object-cover" : "object-cover"}
          style={{ objectPosition: `${focal.x}% ${focal.y}%` }}
        />
        {crop.scrim === null ? null : <div className={`absolute inset-0 ${SCRIM[crop.scrim]}`} />}
        {name === undefined ? null : (
          <p className="absolute bottom-8 left-12 font-display text-fact-value text-card">{name}</p>
        )}
      </div>
    </div>
  );
}

// The white ring with a blue edge and the two hairlines through the point (hi-fi 7a),
// over the comp's light wash so they read on a pale photo too.
function Crosshair({ focal }: { focal: Focal }) {
  const left = `${focal.x}%`;
  const top = `${focal.y}%`;
  return (
    <>
      <span aria-hidden="true" className="absolute inset-0 bg-night/20" />
      <span aria-hidden="true" className="absolute inset-x-0 h-px bg-card/45" style={{ top }} />
      <span aria-hidden="true" className="absolute inset-y-0 w-px bg-card/45" style={{ left }} />
      <span
        aria-hidden="true"
        className="absolute grid size-56 -translate-1/2 place-items-center rounded-pill border-2 border-card shadow-lifted outline-2 outline-blue"
        style={{ left, top }}
      >
        <span className="size-8 rounded-pill bg-card" />
      </span>
    </>
  );
}

interface PickerProps {
  asset: AssetView;
  focal: Focal;
  onChange: (focal: Focal) => void;
}

// The photo itself, whole, as one focusable button: a click lands the point where the
// pointer is; arrows nudge it; Enter and Space do nothing, so a keyboard never fires a
// click at the corner. The button is the photo's own box, so a percent of the button is
// a percent of the photo. The readout sits over the photo's bottom-left corner from the
// tablet floor and under it on a phone, where a face is a thumb's target.
function Picker({ asset, focal, onChange }: PickerProps) {
  const readoutId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      return;
    }
    const next = nudgeFocal(focal, event.key, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    onChange(next);
  };
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    onChange(
      focalFromPoint(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY),
    );
  };
  return (
    <div className="relative" style={{ width: boxWidth(asset) }}>
      <button
        type="button"
        aria-label="Focal point"
        aria-describedby={readoutId}
        onKeyDown={onKeyDown}
        onClick={onClick}
        className="relative block w-full cursor-crosshair overflow-hidden rounded-control bg-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
        style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
      >
        <Image src={asset.cleanUrl ?? ""} alt="" fill unoptimized className="object-cover" />
        <Crosshair focal={focal} />
      </button>
      <MonoLabel
        variant="reading"
        className="mt-8 inline-block rounded-control px-8 py-4 text-meta md:absolute md:bottom-12 md:left-12 md:mt-0 md:bg-night/70 md:text-card"
      >
        <span aria-hidden="true">focal </span>
        <span id={readoutId} aria-live="polite">
          {readout(focal)}
        </span>
      </MonoLabel>
    </div>
  );
}

/**
 * The sheet: `Where should the crop hold on?` over the whole photo with the ring on the
 * point, `Reset to centre` and the keyboard hint beneath, the four derived crops beside
 * as the comp stacks them — hero (with the name), then phone and list card side by side,
 * then the carousel; two by two on a phone — and `Cancel` / `Save focal point`. Saves
 * once, as whole percentages, and closes when the save lands; Escape and Cancel close
 * without saving. On a phone the opening says `Tap`, the arrow-key hint is left out, and
 * the modal's footer stays in reach (F39).
 */
export function FocalPicker({ asset, catName, onSave, onClose }: FocalPickerProps) {
  const [focal, setFocal] = useState<Focal>(() => ({ ...asset.focal }));
  const phone = useSurface() === "phone";
  const src = asset.cleanUrl ?? "";
  const body = bodyFor(useCatSex(), phone);
  const save = async () => {
    if (await onSave(focal)) onClose();
  };
  return (
    <Modal
      open
      size="sheet"
      width={panelWidth(asset)}
      title={COPY.title}
      body={body}
      safeAction={{ label: COPY.cancel, onClick: onClose }}
      dangerAction={{ label: COPY.save, onClick: () => void save() }}
    >
      <div className="flex flex-col gap-16 md:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-12">
          <Picker asset={asset} focal={focal} onChange={setFocal} />
          <div className="flex flex-wrap items-center gap-12">
            <Button variant="secondary" onClick={() => setFocal({ ...CENTRE })}>
              {COPY.reset}
            </Button>
            {/* A hint is a sentence, not a label: the reading voice, beside Reset. */}
            {phone ? null : (
              <MonoLabel variant="reading" className="text-meta">
                {COPY.hint}
              </MonoLabel>
            )}
          </div>
        </div>
        <DerivedCrops src={src} focal={focal} name={catName} />
      </div>
    </Modal>
  );
}

// The crops column, the helper's width from the tablet floor: two by two on a phone;
// from the tablet floor the comp's stack — hero, phone beside list card, carousel.
function DerivedCrops({ src, focal, name }: { src: string; focal: Focal; name: string }) {
  return (
    <div
      role="group"
      aria-label={COPY.crops}
      className="flex flex-col gap-16 rounded-panel bg-paper p-16 md:w-helper md:shrink-0"
    >
      <MonoLabel as="p" className="text-meta">
        {COPY.crops}
      </MonoLabel>
      <div className="grid grid-cols-2 gap-12 md:gap-16">
        <div className="md:col-span-2">
          <Crop src={src} focal={focal} crop={CROPS.hero} name={name} />
        </div>
        <Crop src={src} focal={focal} crop={CROPS.phone} />
        <Crop src={src} focal={focal} crop={CROPS.list} />
        <div className="md:col-span-2">
          <Crop src={src} focal={focal} crop={CROPS.carousel} />
        </div>
      </div>
    </div>
  );
}
