import { act } from "@testing-library/react";

// What ProseMirror asks of a browser that jsdom does not have: layout rectangles for the
// caret and the element under a point. Every answer is "nothing there", which is enough
// for the editor to run; the tests drive it the way a browser does — by changing the DOM
// text and the selection and letting the observer read them back.

const EMPTY_RECTS = {
  length: 0,
  item: () => null,
  [Symbol.iterator]: [][Symbol.iterator],
} as unknown as DOMRectList;

const EMPTY_RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
} as DOMRect;

/** Installs the stubs once per test file. */
export function stubLayout(): void {
  Range.prototype.getClientRects = () => EMPTY_RECTS;
  Range.prototype.getBoundingClientRect = () => EMPTY_RECT;
  Element.prototype.getClientRects = () => EMPTY_RECTS;
  document.elementFromPoint = () => null;
}

/** The first text node of the first paragraph inside `box`, however it is marked up. */
function firstText(box: HTMLElement): Text {
  const paragraph = box.querySelector("p");
  const node =
    paragraph === null
      ? null
      : document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode();
  if (!(node instanceof Text)) throw new Error("the editor has no text yet");
  return node;
}

/** Types into the editor the way a browser does: the DOM text changes and the observer reads it. */
export async function typeInto(box: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    const paragraph = box.querySelector("p");
    if (paragraph === null) throw new Error("the editor has no paragraph");
    const node = paragraph.firstChild;
    if (node instanceof Text) node.data += text;
    else paragraph.appendChild(document.createTextNode(text));
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

/** Selects the first `length` characters of the first paragraph, as a drag or Shift+Arrow would. */
export async function selectFirst(box: HTMLElement, length: number): Promise<void> {
  await act(async () => {
    const node = firstText(box);
    window.getSelection()?.setBaseAndExtent(node, 0, node, length);
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

/** Pastes `data` (by MIME type) into the editor. */
export async function pasteInto(box: HTMLElement, data: Record<string, string>): Promise<void> {
  await act(async () => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    const clipboardData = {
      getData: (type: string) => data[type] ?? "",
      types: Object.keys(data),
      files: [],
      items: [],
    };
    Object.defineProperty(event, "clipboardData", { value: clipboardData });
    box.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

/**
 * Lets the editor take focus back: Tiptap's `focus` command lands on the next animation
 * frame, so a toolbar press is not over until that frame has run.
 */
export async function nextFrame(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}
