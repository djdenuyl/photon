// Print checks. Pure: book + photos -> what would print badly.
import { PAGE, photoBox, placement, type Element, type Page } from "./layout";
import type { Photo, Photos } from "./types";

/** Albelli prints at 300 dpi; below 150 a photo looks soft, so the editor and export flag it. */
export const PRINT_DPI = 300;
export const LOW_DPI = 150;
const MM_PER_INCH = 25.4;

/** The photo shown by a photo or month-title element ("" = an empty frame), else null. */
export function photoIdOf(el: Element): string | null {
  return el.type === "photo" ? el.id : el.type === "month" ? (el.photo ?? "") : null;
}

/** Pixels per inch a photo gets in print: its width in pixels over the width it is placed at,
 * zoom and crop included. */
export function printDpi(photo: Photo, el: Element): number | null {
  if (el.type !== "photo" && el.type !== "month") return null;
  const img = placement(photo, photoBox(el), el.zoom ?? 1, el.focus);
  return photo.w / (img.w / MM_PER_INCH);
}

export type IssueKind = "text" | "empty" | "resolution" | "twice" | "note";

export interface Issue {
  kind: IssueKind;
  page: Page;
  /** The element (its slot), for the ones about one element. */
  slot?: string;
  detail: string;
}

/** Empty frames, photos too small to print sharply and photos on more than one spread (`placed`:
 * spreads per photo). Text that doesn't fit needs the rendered page (see the export modal). */
export function printIssues(pages: Page[], photos: Photos, placed: Map<string, number>): Issue[] {
  const issues: Issue[] = [];
  const twice = new Set<string>();
  for (const page of pages) {
    for (const el of page.elements) {
      const id = photoIdOf(el);
      if (id === null) continue;
      const slot = el.slot;
      if (!id) {
        if (el.type === "photo" && el.bg) continue;
        issues.push({ kind: "empty", page, slot, detail: "Leeg fotokader" });
        continue;
      }
      const photo = photos.get(id);
      if (!photo) continue;
      const dpi = printDpi(photo, el);
      if (dpi !== null && dpi < LOW_DPI) {
        issues.push({ kind: "resolution", page, slot, detail: `${id} is te klein voor dit kader (${Math.round(dpi)} dpi)` });
      }
      const n = placed.get(id) ?? 0;
      if (n > 1 && !page.cover && !twice.has(id)) {
        twice.add(id);
        issues.push({ kind: "twice", page, slot, detail: `${id} staat op ${n} spreads` });
      }
    }
  }
  return issues;
}

/** One page, as a print file: 300 dpi with the bleed around it. */
export const PRINT_PX = {
  w: Math.round(((PAGE.w + 2 * PAGE.bleed) / MM_PER_INCH) * PRINT_DPI),
  h: Math.round(((PAGE.h + 2 * PAGE.bleed) / MM_PER_INCH) * PRINT_DPI),
};
