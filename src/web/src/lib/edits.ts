// Editor changes on top of the generated layout. Pure.
//
// A page is keyed by its event and its page number within the event (`eventId:k`; the cover by
// `omslagN-front:0` / `omslagN-back:0`), an element by its slot: the photo the layout put there, a
// fixed name for cover parts ("letter3", "shard0", "background", "label"), "month" for the month
// title and "cap0", "cap1"… for captions. So edits survive a re-layout as long as the event keeps
// its pages. Stored per page as JSON strings in the `edits` state map.
import { CAPTION_SIZE, captionFrame, PAGE, type Book, type Border, type Box, type CaptionElement, type Element, type FillElement, type FontId, type Page, type PhotoElement } from "./layout";
import { bboxOf, cellPolygons, type Mesh, type Pt } from "./mesh";
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
  /** Photos, filled text: the photo turned inside its frame (degrees). */
  irot?: number;
  hidden?: boolean;
  z?: number;
  border?: Border | null;
  /** Background photos: opacity of a white veil over the photo. */
  veil?: number;
  /** Captions and month titles. */
  text?: string;
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  font?: FontId;
  /** An element added in the editor (not from the layout). "word": text filled with a photo, like
   * the month titles; "twin": the facing page's half of a photo across the spine (`of`). */
  add?: "caption" | "fill" | "photo" | "frame" | "word" | "twin";
  /** A twin's photo element: `pageKey|slot` on the facing page. */
  of?: string;
  /** Slot "layout": the page is a free arrangement (its smart-layout buttons give other ones). */
  layout?: "collage";
  /** Fills: their corner points (mm). */
  pts?: Pt[];
  /** Slot "mesh": the page laid out as a mesh of photo cells, and the photo per cell. */
  mesh?: Mesh;
  cells?: string[];
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

const GEOMETRY = ["x", "y", "w", "h", "zoom", "rot", "irot"] as const;

/** Every page of a book, the cover included. */
export const allPages = (book: Book): Page[] => [book.covers.back, book.covers.front, ...book.pages];

const B = PAGE.bleed;
/** The whole page; points on its edge are drawn on into the bleed (see pageBody). */
export const FULL_PAGE: Pt[] = [[0, 0], [PAGE.w, 0], [PAGE.w, PAGE.h], [0, PAGE.h]];
// the page's own colour keeps its points on the page (older edits had them in the bleed)
const onPage = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [Math.min(PAGE.w, Math.max(0, x)), Math.min(PAGE.h, Math.max(0, y))]);

function fill(slot: string, color: string, pts: Pt[], z: number): FillElement {
  return { type: "fill", slot, color, pts, z, ...bboxOf(pts) };
}

/** The page's elements before edits: the page colour as a fill at the very bottom, the layout's
 * elements (or, with a mesh, its cells instead of the plain photos), then what the editor added. */
function baseElements(page: Page, pe: PageEdits | undefined): Element[] {
  let caps = 0;
  const out: Element[] = [
    fill("pagefill", page.background ?? "#fff", FULL_PAGE, -1),
    ...page.elements.map((e, i): Element => ({ ...e, z: e.z ?? i, slot: e.slot ?? (e.type === "photo" ? e.id : e.type === "month" ? "month" : `cap${caps++}`) })),
  ];
  const meshEdit = pe?.mesh;
  let base = out;
  if (meshEdit?.mesh) {
    base = out.filter((e) => !(e.type === "photo" && !e.bg && !e.shape));
    cellPolygons(meshEdit.mesh).forEach((poly, i) => {
      const box = bboxOf(poly);
      const cell: PhotoElement = {
        type: "photo", id: meshEdit.cells?.[i] ?? "", slot: `cell${i}`, cell: i, z: 0.5 + i / 1000, ...box,
        shape: { kind: "poly", pts: poly.map(([x, y]): Pt => [(x - box.x) / box.w, (y - box.y) / box.h]) },
      };
      base.push(cell);
    });
  }
  for (const [slot, ed] of Object.entries(pe ?? {})) {
    if (ed.add === "caption") {
      const text = ed.text ?? "Tekst";
      base.push({ type: "caption", slot, z: 1000, text, ...captionFrame(text, 20, 20 + 1.7 * CAPTION_SIZE) });
    } else if (ed.add === "photo") {
      // a background photo chosen in the page menu: above the page colour, below everything else
      base.push({ type: "photo", id: ed.photo ?? "", slot, bg: true, x: -B, y: -B, w: PAGE.w + 2 * B, h: PAGE.h + 2 * B, z: -0.5 });
    } else if (ed.add === "frame") {
      const w = ed.w ?? 80, h = ed.h ?? 55;
      base.push({ type: "photo", id: ed.photo ?? "", slot, x: ed.x ?? (PAGE.w - w) / 2, y: ed.y ?? (PAGE.h - h) / 2, w, h, z: 100 + base.length });
    } else if (ed.add === "fill") {
      base.push(fill(slot, "#f2c94c", [[60, 80], [150, 80], [150, 200], [60, 200]], 0.25));
    } else if (ed.add === "word") {
      const w = 150, h = 42;
      base.push({ type: "month", name: ed.text ?? "Tekst", photo: null, slot, x: (PAGE.w - w) / 2, y: (PAGE.h - h) / 2, w, h, z: 900 });
    } else if (ed.add === "twin") {
      // drawn from its source once every page has its edits (resolveTwins)
      base.push({ type: "photo", id: "", slot, twin: true, x: 0, y: 0, w: 1, h: 1, z: 0 });
    }
  }
  return base;
}

function applyPage(page: Page, pe: PageEdits | undefined): void {
  const out: Element[] = [];
  for (const e of baseElements(page, pe)) {
    const slot = e.slot!;
    const ed = pe?.[slot];
    // the page's own colour is never removed, only made transparent: the page stays selectable
    if (ed?.hidden && slot === "pagefill") {
      out.push({ ...(e as FillElement), color: "transparent", z: -1 });
      continue;
    }
    if (ed?.hidden) continue;
    const z = ed?.z ?? e.z;
    if (e.type === "photo") {
      const o = { ...e, z };
      if (ed?.photo !== undefined) o.id = ed.photo;
      // a mesh cell keeps its shape: only zoom (and focus, photo) apply
      const keys = e.cell === undefined ? GEOMETRY : (["zoom", "irot"] as const);
      for (const k of keys) if (ed?.[k] !== undefined) o[k] = ed[k];
      if (ed?.focus) o.focus = ed.focus;
      if (ed?.border !== undefined) o.border = ed.border;
      if (ed?.veil !== undefined) o.veil = ed.veil;
      // its own outline: the frame becomes a polygon, its box the outline's bounding box
      if (ed?.pts && ed.pts.length >= 3 && e.cell === undefined && e.shape?.kind !== "letter") {
        const box = bboxOf(ed.pts);
        const tint = e.shape?.kind === "poly" ? e.shape.tint : undefined;
        Object.assign(o, box, { shape: { kind: "poly", tint, pts: ed.pts.map(([x, y]): Pt => [(x - box.x) / box.w, (y - box.y) / box.h]) } });
      }
      out.push(o);
    } else if (e.type === "month") {
      const o = { ...e, z };
      if (ed?.photo !== undefined) o.photo = ed.photo;
      if (ed?.text !== undefined) o.name = ed.text;
      for (const k of ["x", "y", "w", "h", "zoom", "rot", "irot"] as const) if (ed?.[k] !== undefined) o[k] = ed[k];
      if (ed?.focus) o.focus = ed.focus;
      if (ed && "font" in ed) o.font = ed.font;
      if (ed && "color" in ed) o.color = ed.color || undefined;
      out.push(o);
    } else if (e.type === "fill") {
      const o = { ...e, z };
      if (ed?.color) o.color = ed.color;
      if (ed?.pts && ed.pts.length >= 3) {
        const pts = slot === "pagefill" ? onPage(ed.pts) : ed.pts;
        Object.assign(o, { pts }, bboxOf(pts));
      }
      out.push(o);
    } else {
      out.push(captionWith({ ...e, z }, ed));
    }
  }
  page.background = undefined;
  page.elements = out.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
}

function captionWith(o: CaptionElement, ed: ElementEdit | undefined): CaptionElement {
  if (!ed) return o;
  if (ed.text !== undefined) o.text = ed.text;
  if (ed.size !== undefined) o.size = ed.size;
  if (ed.color !== undefined) o.color = ed.color;
  if (ed.align !== undefined) o.align = ed.align;
  if (ed.valign !== undefined) o.valign = ed.valign;
  if (ed.rot !== undefined) o.rot = ed.rot;
  if ("font" in ed) o.font = ed.font;
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
  for (const book of books) {
    for (const page of allPages(book)) applyPage(page, edits[pageKey(page)]);
    resolveTwins(book, edits);
  }
  return books;
}

/** A photo across the spine lives on one page, its box running past the page's edge; the facing
 * page draws the same photo shifted by a page width, so the halves meet at the fold. */
function resolveTwins(book: Book, edits: Edits): void {
  const pages = new Map(book.pages.map((p, i) => [pageKey(p), { page: p, i }]));
  for (const [i, page] of book.pages.entries()) {
    if (!page.elements.some((e) => e.type === "photo" && e.twin)) continue;
    page.elements = page.elements.flatMap((e): Element[] => {
      if (e.type !== "photo" || !e.twin) return [e];
      const [key, slot] = (edits[pageKey(page)]?.[e.slot ?? ""]?.of ?? "").split("|");
      const src = pages.get(key);
      const el = src?.page.elements.find((x) => x.slot === slot);
      if (!src || el?.type !== "photo" || el.twin) return [];
      const dx = src.i < i ? -PAGE.w : PAGE.w;
      return [{ ...el, x: el.x + dx, slot: e.slot, twin: true, big: false }];
    }).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  }
}

/** Where a photo currently is in the book's pages (not the cover, not as a background). */
export function findPhoto(books: Book[], photoId: string): { page: Page; slot: string } | null {
  for (const book of books) {
    for (const page of book.pages) {
      for (const e of page.elements) {
        if (e.type === "photo" && !e.bg && !e.twin && e.id === photoId) return { page, slot: e.slot ?? e.id };
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
    if (prev?.add) page[slot] = { add: prev.add, of: prev.of, text: prev.text, x: prev.x, y: prev.y, w: prev.w, h: prev.h, box: prev.box };
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

/* ---------- a page's arrangement: copy it to another page, or clear it ---------- */

/** A photo frame of the page's own arrangement (not a background, mesh cell, twin or cover part). */
const arranged = (page: Page) => (e: Element): e is PhotoElement =>
  e.type === "photo" && !e.bg && !e.twin && e.cell === undefined && (!e.shape || (e.shape.kind === "poly" && !page.cover));
/** Top to bottom in bands of 20 mm, then left to right. */
const reading = (a: Box, b: Box) => Math.round(a.y / 20) - Math.round(b.y / 20) || a.x - b.x;

export interface CopiedLayout {
  /** The page it came from (`pageKey`). */
  from: string;
  mesh?: Mesh;
  /** The photo frames in reading order. */
  frames: ElementEdit[];
  month?: ElementEdit;
  collage?: boolean;
}

export function copyLayout(page: Page, pe: PageEdits | undefined): CopiedLayout {
  const frames = page.elements.filter(arranged(page)).sort(reading).map((e): ElementEdit => {
    const pts = e.shape?.kind === "poly" ? e.shape.pts.map(([u, v]): Pt => [e.x + u * e.w, e.y + v * e.h]) : undefined;
    return { x: e.x, y: e.y, w: e.w, h: e.h, rot: e.rot ?? 0, border: e.border, pts, z: e.z };
  });
  const m = page.elements.find((e) => e.type === "month");
  return {
    from: pageKey(page),
    mesh: pe?.mesh?.mesh,
    frames,
    month: m ? { x: m.x, y: m.y, w: m.w, h: m.h, rot: m.type === "month" ? m.rot : undefined } : undefined,
    collage: pe?.layout?.layout === "collage",
  };
}

const ARRANGEMENT = ["x", "y", "w", "h", "rot", "pts", "border", "z"] as const;

/** A page's edits without its arrangement: no mesh or collage, no twin, the layout's own photos
 * and month title back in their places (photo swaps, zoom and what was added stay). */
export function clearedLayout(pe: PageEdits | undefined): PageEdits {
  const out: PageEdits = {};
  for (const [slot, ed] of Object.entries(pe ?? {})) {
    if (slot === "mesh" || slot === "layout" || slot.startsWith("cell") || ed.add === "twin") continue;
    if (ed.add) {
      out[slot] = ed;
      continue;
    }
    const rest = { ...ed };
    for (const k of ARRANGEMENT) delete rest[k];
    if (Object.keys(rest).length) out[slot] = rest;
  }
  return out;
}

/** Another page's arrangement on this page: its mesh with this page's photos, or its frames given
 * to this page's photos in reading order (as many as both have). */
export function pasteLayout(edits: Edits, page: Page, c: CopiedLayout): Edits {
  const key = pageKey(page);
  const before = edits[key];
  const pe = clearedLayout(before);
  // this page's photos: the cells of its mesh, else its own frames in reading order
  const meshIds = before?.mesh?.cells?.filter(Boolean) ?? [];
  const slots = meshIds.length ? meshIds : page.elements.filter(arranged(page)).sort(reading).map((e) => e.slot ?? e.id);
  if (c.mesh) {
    pe.mesh = { mesh: c.mesh, cells: c.mesh.cells.map((_, i) => slots[i] ?? "") };
  } else {
    c.frames.slice(0, slots.length).forEach((f, i) => (pe[slots[i]] = { ...pe[slots[i]], ...f }));
    if (c.collage) pe.layout = { layout: "collage" };
  }
  const month = page.elements.find((e) => e.type === "month");
  if (c.month && month?.slot) pe[month.slot] = { ...pe[month.slot], ...c.month };
  return { ...edits, [key]: pe };
}
