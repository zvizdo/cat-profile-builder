import type { Page } from "@playwright/test";

// What the fundraiser display's end-to-end spec measures with (spec 002, T014): the boxes the
// browser really laid out, read in one pass, and the comparisons made on them in Node.

/** A box in viewport pixels. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a piece of text sits in the display: the thermometer, the Full screen control, or the left group. */
export type Group = "left" | "meter" | "controls";

/** One line box of text, with the size it is set in. */
export interface TextBox {
  text: string;
  group: Group;
  box: Box;
  fontSize: number;
  /** Visually hidden (the icon-only button's label on a phone), so its text has no place on the stage. */
  hidden: boolean;
}

/** Everything the shape check needs, read from the page in one pass. */
export interface Measured {
  viewport: { width: number; height: number };
  /** The page's scroll extents: any excess over the viewport is a scrollbar. */
  page: { scrollWidth: number; scrollHeight: number };
  /** The stage's own extents: `overflow: hidden` hides clipped content here, so excess means clipping. */
  stage: {
    box: Box;
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
  };
  texts: TextBox[];
  logo: Box | null;
  /** The thermometer's drawn parts: tube, bulb, every paw and the tag. */
  meterParts: Box[];
  button: Box | null;
  goalLine: Box | null;
  goalFigure: Box | null;
  /** The four paws' boxes from the bottom up, and the height of one paw icon. */
  paws: Box[];
  pawIcon: number;
}

/**
 * Reads the display's geometry in the browser. Text is read line by line from a Range over
 * each text node, so a wrapped headline gives one box per line and the boxes are the glyph
 * lines, not the (larger) elements around them.
 */
export async function measure(page: Page): Promise<Measured> {
  return page.evaluate((): Measured => {
    const toBox = (r: DOMRect): Box => ({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
    });
    const boxOf = (el: Element): Box => toBox(el.getBoundingClientRect());
    const rectOf = (el: Element | null | undefined): Box | null => (el ? boxOf(el) : null);
    const main = document.querySelector("main");
    const meter = document.querySelector('[role="meter"]');
    const button = document.querySelector("button");
    if (!main || !meter || !button)
      throw new Error("the display is missing its main, meter or button");
    const controls = button.parentElement;
    const scale = meter.firstElementChild;
    const bulb = meter.lastElementChild;
    const tag = document.querySelector("[data-tag-track]")?.firstElementChild;
    const paws = Array.from(document.querySelectorAll("[data-paw]"));
    if (!controls || !scale || !bulb || !tag) throw new Error("the thermometer is missing a part");

    const groupOf = (el: Element): Group =>
      meter.contains(el) ? "meter" : controls.contains(el) ? "controls" : "left";
    // The icon-only button keeps its words in a 1px clipped span; its text is not on the stage.
    const isHidden = (from: Element): boolean => {
      for (let el: Element | null = from; el && el !== main; el = el.parentElement) {
        const r = el.getBoundingClientRect();
        if (r.width <= 2 && r.height <= 2) return true;
      }
      return false;
    };
    const linesOf = (node: Node): DOMRect[] => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
    };
    const readTexts = (): TextBox[] => {
      const out: TextBox[] = [];
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim() ?? "";
        const parent = node.parentElement;
        if (text === "" || !parent) continue;
        const info = {
          text,
          group: groupOf(parent),
          fontSize: Number.parseFloat(getComputedStyle(parent).fontSize),
          hidden: isHidden(parent),
        };
        for (const rect of linesOf(node)) out.push({ ...info, box: toBox(rect) });
      }
      return out;
    };

    const pawIcon = document.querySelector("[data-paw] > span:last-child");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      page: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
      stage: {
        box: boxOf(main),
        scrollWidth: main.scrollWidth,
        scrollHeight: main.scrollHeight,
        clientWidth: main.clientWidth,
        clientHeight: main.clientHeight,
      },
      texts: readTexts(),
      logo: rectOf(main.querySelector("img")),
      meterParts: [scale, bulb, tag, ...paws].map(boxOf),
      button: rectOf(button),
      goalLine: rectOf(document.querySelector("[data-goal-line]")),
      goalFigure: rectOf(document.querySelector("[data-goal-line] b")),
      paws: paws.map(boxOf).sort((x, y) => y.bottom - x.bottom),
      pawIcon: pawIcon ? pawIcon.getBoundingClientRect().height : 0,
    };
  });
}

/** Half a pixel of slack for sub-pixel layout; anything beyond it is a real excess. */
export const EPS = 0.5;

/** `box` lies within `outer`, give or take the sub-pixel slack. */
export function inside(box: Box, outer: Box): boolean {
  return (
    box.left >= outer.left - EPS &&
    box.top >= outer.top - EPS &&
    box.right <= outer.right + EPS &&
    box.bottom <= outer.bottom + EPS
  );
}

/** The two boxes share more than the slack in both directions. */
export function overlaps(a: Box, b: Box): boolean {
  return (
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > EPS &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > EPS
  );
}

/** A box as `[left,top to right,bottom]` for a failure message. */
export function describe(box: Box): string {
  return `[${box.left.toFixed(1)},${box.top.toFixed(1)} to ${box.right.toFixed(1)},${box.bottom.toFixed(1)}]`;
}

/** Names every text line that sits outside `stage`; empty when all are inside. */
export function outsideStage(texts: TextBox[], stage: Box): string[] {
  return texts
    .filter((t) => !t.hidden && !inside(t.box, stage))
    .map((t) => `"${t.text.slice(0, 20)}" (${t.group}) ${describe(t.box)}`);
}

/** Names every pair that overlaps among the left group, the thermometer and the controls. */
export function overlapsFound(m: Measured): string[] {
  const left = m.texts
    .filter((t) => t.group === "left" && !t.hidden)
    .map((t) => ({ name: t.text.slice(0, 20), box: t.box }));
  if (m.logo) left.push({ name: "logo", box: m.logo });
  const controls = m.texts
    .filter((t) => t.group === "controls" && !t.hidden)
    .map((t) => ({ name: `note "${t.text.slice(0, 20)}"`, box: t.box }));
  if (m.button) controls.push({ name: "Full screen button", box: m.button });
  const meter = m.meterParts.map((box, i) => ({ name: `thermometer part ${i}`, box }));
  const found: string[] = [];
  const pairs: [string, typeof left, typeof left][] = [
    ["left group x thermometer", left, meter],
    ["left group x controls", left, controls],
    ["thermometer x controls", meter, controls],
  ];
  for (const [label, as, bs] of pairs) {
    for (const a of as) {
      for (const b of bs) {
        if (overlaps(a.box, b.box))
          found.push(`${label}: ${a.name} ${describe(a.box)} / ${b.name} ${describe(b.box)}`);
      }
    }
  }
  return found;
}

/** Waits for the fonts and for any running transition, so geometry is read at rest. */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((a) => a.finished));
  });
}

/**
 * The share of the tube that is actually painted blue, found in a screenshot rather than from
 * any box: the tube (the fill's clip) is photographed, its centre column is read pixel by
 * pixel, and the fill's top edge is the first row, going down from the tube's tip, whose blue
 * channel is far above the empty tube's near-black ground. The fill is always blue (the
 * gradient runs from blue to blue-light) and the empty tube is the night ground with a 6% white
 * veil, so the two are far apart at every level. Returns the filled height over the tube's.
 */
export async function paintedFillShare(page: Page): Promise<number> {
  const clip = page.locator("[data-fill]").locator("..");
  const png = await clip.screenshot();
  return page.evaluate(async (base64: string): Promise<number> => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d canvas to read the screenshot with");
    context.drawImage(image, 0, 0);
    const x = Math.floor(image.width / 2);
    const column = context.getImageData(x, 0, 1, image.height).data;
    const BLUE_FROM = 100;
    // The tube's pale outline crosses the first rows of the centre column; the scan starts under it.
    const OUTLINE = 6;
    for (let y = OUTLINE; y < image.height; y += 1) {
      if ((column[y * 4 + 2] ?? 0) >= BLUE_FROM) {
        return (image.height - (y === OUTLINE ? 0 : y)) / image.height;
      }
    }
    return 0;
  }, png.toString("base64"));
}
