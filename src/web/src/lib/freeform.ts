// Layouts that place frames freely instead of as a mesh, returned as element edits. Pure.
//
// Collage: the page's photos scattered over a loose grid, a little bigger than their cells so they
// overlap, each turned a few degrees, in a thick white border (the overlap collages of the style
// guide). Over de rug: one photo as a band across the spread's spine, drawn on both pages (the
// facing page gets a "twin"), the other photos of each page arranged under it.
import type { ElementEdit, PageEdits } from "./edits";
import { PAGE, type Box } from "./layout";
import { random } from "./mesh";
import { arrangements, type Cell } from "./smart";

const COLLAGE_BORDER = { w: 2.5, color: "#fff" };

/** A collage of these frames; `variant` gives another one (other scatter, other turns). */
export function collage(cells: Cell[], seed: string, variant = 0): PageEdits {
  const out: PageEdits = {};
  const n = cells.length;
  if (!n) return out;
  const rnd = random(`${seed}#collage${variant}`);
  const area: Box = { x: 16, y: 16, w: PAGE.w - 32, h: PAGE.h - 32 };
  const cols = Math.max(1, Math.round(Math.sqrt((n * area.w) / area.h)));
  const rows = Math.ceil(n / cols);
  const cw = area.w / cols, ch = area.h / rows;
  const turn = [6, 9, 4][variant % 3];
  // every photo about 1.15 cells big, at its own proportions (a little cropped, never stretched)
  const target = cw * ch * 1.15;
  cells.forEach((c, i) => {
    const r = Math.floor(i / cols), k = i % cols;
    const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
    const cx = area.x + ((cols - inRow) * cw) / 2 + cw * (k + 0.5) + (rnd() - 0.5) * cw * 0.2;
    const cy = area.y + ch * (r + 0.5) + (rnd() - 0.5) * ch * 0.2;
    const aspect = Math.min(1.6, Math.max(0.65, c.aspect));
    let w = Math.sqrt(target * aspect), h = w / aspect;
    const fit = Math.min(1, (cw * 1.4) / w, (ch * 1.4) / h);
    w *= fit;
    h *= fit;
    const x = Math.min(PAGE.w - 8 - w, Math.max(8, cx - w / 2));
    const y = Math.min(PAGE.h - 8 - h, Math.max(8, cy - h / 2));
    const rot = Math.round((rnd() - 0.5) * 2 * turn * 10) / 10;
    out[c.slot] = { x, y, w, h, rot, border: COLLAGE_BORDER, z: 10 + Math.floor(rnd() * 50) };
  });
  return out;
}

export interface SpinePage {
  key: string;
  /** The page's photos (and month title) that take part, in order. */
  cells: Cell[];
}

/** The photo across the spine and the arrangement of both pages. `spine` is the slot (on `from`,
 * the left or right page) of the photo that crosses; it becomes a band over both pages' top half. */
export function overDeRug(left: SpinePage, right: SpinePage, from: "left" | "right", spine: string): Record<string, PageEdits> {
  const m = PAGE.margin, gap = PAGE.gap;
  const bandH = Math.round(PAGE.h * 0.48);
  const src = from === "left" ? left : right, other = from === "left" ? right : left;
  const band: ElementEdit = { x: from === "left" ? m : m - PAGE.w, y: m, w: 2 * PAGE.w - 2 * m, h: bandH, rot: 0 };
  const below: Box = { x: m, y: m + bandH + gap, w: PAGE.w - 2 * m, h: PAGE.h - 2 * m - bandH - gap };
  const arrange = (cells: Cell[]): PageEdits => {
    const best = arrangements(cells, below)[0] ?? {};
    return Object.fromEntries(Object.entries(best).map(([slot, b]) => [slot, { ...b, rot: 0 }]));
  };
  return {
    [src.key]: { ...arrange(src.cells.filter((c) => c.slot !== spine)), [spine]: band },
    [other.key]: { ...arrange(other.cells), [`twin${spine}`]: { add: "twin", of: `${src.key}|${spine}` } },
  };
}
