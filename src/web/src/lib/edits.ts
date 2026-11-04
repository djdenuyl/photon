// Editor changes on top of the generated layout. Pure.
//
// A page is keyed by its event and its page number within the event (`eventId:k`; the cover by
// `omslagN-front:0` / `omslagN-back:0`), an element by its slot: the photo the layout put there, a
// fixed name for cover parts ("letter3", "shard0", "background", "label"), "month" for the month
// title and "cap0", "cap1"… for captions. So edits survive a re-layout as long as the event keeps
// its pages. Stored per page as JSON strings in the `edits` state map.
import { CAPTION_SIZE, captionFrame, type Book, type Border, type Box, type CaptionElement, type Element, type Page } from "./layout";
import type { StringMap } from "./types";

export interface ElementEdit {
  /** Swapped-in photo (photos, cover parts, month titles). */
  photo?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  zoom?: number;
  focus?: [number, number];
  rot?: number;
  hidden?: boolean;
  z?: number;
  border?: Border | null;
  /** Captions and month titles. */
  text?: string;
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  /** A caption added in the editor (not from the layout). */
  add?: "caption";
  /** Caption geometry is a text frame (x/y/w/h). Caption edits from before text frames lack it:
   * their x/y were the text's left (right for the cover label) and baseline − 1.7 × size. */
  box?: true;
}

export type PageEdits = Record<string, ElementEdit>;
export type Edits = Record<string, PageEdits>;

export const pageKey = (p: Page): string => `${p.event.id}:${p.k}`;

export function parseEdits(raw: StringMap | undefined): Edits {
  const out: Edits = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    try {
      out[key] = JSON.parse(value) as PageEdits;
    } catch {
      /* ignore a broken entry */
    }
  }
  return out;
}

export function serializeEdits(edits: Edits): StringMap {
  const out: StringMap = {};
  for (const [key, page] of Object.entries(edits)) {
    const clean = Object.fromEntries(Object.entries(page).filter(([, e]) => Object.keys(e).length));
    if (Object.keys(clean).length) out[key] = JSON.stringify(clean);
  }
  return out;
}

const GEOMETRY = ["x", "y", "w", "h", "zoom", "rot"] as const;

/** Every page of a book, the cover included. */
export const allPages = (book: Book): Page[] => [book.covers.back, book.covers.front, ...book.pages];

function applyPage(page: Page, pe: PageEdits | undefined): void {
  let caps = 0;
  const out: Element[] = [];
  page.elements.forEach((e, i) => {
    const slot = e.slot ?? (e.type === "photo" ? e.id : e.type === "month" ? "month" : `cap${caps++}`);
    const ed = pe?.[slot];
    if (ed?.hidden) return;
    const z = ed?.z ?? i;
    if (e.type === "photo") {
      const o = { ...e, slot, z };
      if (ed?.photo !== undefined) o.id = ed.photo;
      for (const k of GEOMETRY) if (ed?.[k] !== undefined) o[k] = ed[k];
      if (ed?.focus) o.focus = ed.focus;
      if (ed?.border !== undefined) o.border = ed.border;
      out.push(o);
    } else if (e.type === "month") {
      const o = { ...e, slot, z };
      if (ed?.photo !== undefined) o.photo = ed.photo;
      if (ed?.text !== undefined) o.name = ed.text;
      for (const k of ["x", "y", "w", "h", "zoom"] as const) if (ed?.[k] !== undefined) o[k] = ed[k];
      if (ed?.focus) o.focus = ed.focus;
      out.push(o);
    } else {
      out.push(captionWith({ ...e, slot, z }, ed));
    }
  });
  for (const [slot, ed] of Object.entries(pe ?? {})) {
    if (ed.add !== "caption" || ed.hidden) continue;
    const text = ed.text ?? "Tekst";
    const base: CaptionElement = { type: "caption", slot, z: ed.z ?? 1000, text, ...captionFrame(text, 20, 20 + 1.7 * CAPTION_SIZE) };
    out.push(captionWith(base, ed));
  }
  page.elements = out.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
}

function captionWith(o: CaptionElement, ed: ElementEdit | undefined): CaptionElement {
  if (!ed) return o;
  if (ed.text !== undefined) o.text = ed.text;
  if (ed.size !== undefined) o.size = ed.size;
  if (ed.color !== undefined) o.color = ed.color;
  if (ed.align !== undefined) o.align = ed.align;
  if (ed.box) {
    for (const k of ["x", "y", "w", "h"] as const) if (ed[k] !== undefined) o[k] = ed[k];
  } else if (ed.x !== undefined || ed.y !== undefined || ed.size !== undefined || ed.text !== undefined) {
    // an edit from before text frames: the frame follows the (one-line) text
    const size = o.size ?? CAPTION_SIZE, end = o.align === "right";
    const x = ed.x ?? (end ? o.x + o.w : o.x);
    const baseline = ed.y !== undefined ? ed.y + 1.7 * size : o.y + 0.95 * size;
    Object.assign(o, captionFrame(o.text, x, baseline, size, o.font, end));
  }
  return o;
}

/** The layout with the edits applied (mutates and returns the books). */
export function applyEdits(books: Book[], edits: Edits): Book[] {
  for (const book of books) for (const page of allPages(book)) applyPage(page, edits[pageKey(page)]);
  return books;
}

/** Where a photo currently is in the book's pages (not the cover, not as a background). */
export function findPhoto(books: Book[], photoId: string): { page: Page; slot: string } | null {
  for (const book of books) {
    for (const page of book.pages) {
      for (const e of page.elements) {
        if (e.type === "photo" && !e.bg && e.id === photoId) return { page, slot: e.slot ?? e.id };
      }
    }
  }
  return null;
}

export function updateElement(edits: Edits, key: string, slot: string, change: ElementEdit | null): Edits {
  const page = { ...(edits[key] ?? {}) };
  const prev = page[slot];
  // resetting an added caption keeps it (with its text and place); only its other changes go
  if (change === null) {
    if (prev?.add) page[slot] = { add: prev.add, text: prev.text, x: prev.x, y: prev.y, w: prev.w, h: prev.h, box: prev.box };
    else delete page[slot];
  } else page[slot] = { ...(prev ?? {}), ...change };
  return { ...edits, [key]: page };
}

/**
 * Put `newPhoto` in a slot. When that photo is already on a page of the book (and the slot is
 * on a page too, not the cover), the two trade places so nothing appears twice.
 */
export function swapPhoto(books: Book[], edits: Edits, key: string, slot: string, oldPhoto: string, newPhoto: string): Edits {
  let next = updateElement(edits, key, slot, { photo: newPhoto, zoom: undefined, focus: undefined });
  const where = key.startsWith("omslag") ? null : findPhoto(books, newPhoto);
  if (where) next = updateElement(next, pageKey(where.page), where.slot, { photo: oldPhoto, zoom: undefined, focus: undefined });
  return next;
}

export const boxOf = (e: Box): Box => ({ x: e.x, y: e.y, w: e.w, h: e.h });
