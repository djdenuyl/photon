// Editor changes on top of the generated layout. Pure.
//
// A page is keyed by its event and its page number within the event (`eventId:k`), a photo by
// the photo the layout put there (its "slot"), so edits survive a re-layout as long as the event
// keeps its pages. Stored per page as JSON strings in the `edits` state map.
import type { Book, Box, Element, Page, PhotoElement } from "./layout";
import type { StringMap } from "./types";

export interface ElementEdit {
  /** Swapped-in photo. */
  photo?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  zoom?: number;
  focus?: [number, number];
  rot?: number;
  hidden?: boolean;
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

/** The layout with the edits applied (photo elements only; month titles and captions follow). */
export function applyEdits(books: Book[], edits: Edits): Book[] {
  for (const book of books) {
    for (const page of book.pages) {
      const pe = edits[pageKey(page)];
      if (!pe) continue;
      page.elements = page.elements.flatMap((e): Element[] => {
        if (e.type !== "photo") return [e];
        const ed = pe[e.id];
        if (!ed) return [e];
        if (ed.hidden) return [];
        const out: PhotoElement = { ...e, slot: e.id };
        if (ed.photo) out.id = ed.photo;
        for (const k of ["x", "y", "w", "h", "zoom", "rot"] as const) if (ed[k] !== undefined) out[k] = ed[k];
        if (ed.focus) out.focus = ed.focus;
        return [out];
      });
    }
  }
  return books;
}

/** Where a photo currently is in the books (after edits). */
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
  if (change === null) delete page[slot];
  else page[slot] = { ...(page[slot] ?? {}), ...change };
  return { ...edits, [key]: page };
}

/**
 * Put `newPhoto` in a slot. When that photo is already somewhere in the book, the two trade
 * places (so nothing appears twice); otherwise the old photo simply leaves the book.
 */
export function swapPhoto(books: Book[], edits: Edits, key: string, slot: string, oldPhoto: string, newPhoto: string): Edits {
  let next = updateElement(edits, key, slot, { photo: newPhoto, zoom: undefined, focus: undefined });
  const where = findPhoto(books, newPhoto);
  if (where) next = updateElement(next, pageKey(where.page), where.slot, { photo: oldPhoto, zoom: undefined, focus: undefined });
  return next;
}

export const boxOf = (e: Box): Box => ({ x: e.x, y: e.y, w: e.w, h: e.h });
