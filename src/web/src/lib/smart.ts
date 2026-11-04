// "Slimme indeling": other arrangements of the photos already on a page, as Albelli offers them.
// Candidates are justified rows (every way of breaking the photos into rows), justified columns,
// and one large photo beside a column of the rest. Each is scored by how much the photos must be
// cropped to fit their cells, with a heavy penalty when a landscape photo would become portrait
// (or the other way round), so clicking through gives sensible, different pages. Pure.
import type { Box } from "./layout";

export interface Cell {
  slot: string;
  /** Width / height of the photo (or the month title). */
  aspect: number;
}

export type Arrangement = Record<string, Box>;

/** Every way to split n items into consecutive groups (at most `maxGroups`). */
function compositions(n: number, maxGroups: number): number[][] {
  const out: number[][] = [];
  const rec = (left: number, acc: number[]) => {
    if (left === 0) return out.push(acc);
    if (acc.length >= maxGroups) return;
    for (let k = 1; k <= left; k++) rec(left - k, [...acc, k]);
  };
  rec(n, []);
  return out;
}

/** Rows of photos at their own proportions, each row the full width, then stretched or squeezed
 * vertically to fill the box (the photos are cropped to absorb that). */
function rows(cells: Cell[], groups: number[], box: Box, gap: number): Arrangement {
  const out: Arrangement = {};
  let i = 0;
  const heights = groups.map((k) => {
    const row = cells.slice(i, (i += k));
    return (box.w - gap * (k - 1)) / row.reduce((s, c) => s + c.aspect, 0);
  });
  const f = (box.h - gap * (groups.length - 1)) / heights.reduce((a, b) => a + b, 0);
  i = 0;
  let y = box.y;
  groups.forEach((k, r) => {
    const row = cells.slice(i, (i += k));
    const h = heights[r] * f;
    let x = box.x;
    const sum = row.reduce((s, c) => s + c.aspect, 0);
    for (const c of row) {
      const w = ((box.w - gap * (k - 1)) * c.aspect) / sum;
      out[c.slot] = { x, y, w, h };
      x += w + gap;
    }
    y += h + gap;
  });
  return out;
}

/** The same with columns: transpose, lay out rows, transpose back. */
function columns(cells: Cell[], groups: number[], box: Box, gap: number): Arrangement {
  const t = rows(cells.map((c) => ({ ...c, aspect: 1 / c.aspect })), groups, { x: box.y, y: box.x, w: box.h, h: box.w }, gap);
  return Object.fromEntries(Object.entries(t).map(([k, b]) => [k, { x: b.y, y: b.x, w: b.h, h: b.w }]));
}

/** One photo large on the left (as wide as its proportions allow, at most 62%), the rest in a column. */
function hero(cells: Cell[], h: number, box: Box, gap: number): Arrangement | null {
  if (cells.length < 2) return null;
  const big = cells[h];
  const rest = cells.filter((_, i) => i !== h);
  const w = Math.min(box.w * 0.62, Math.max(box.w * 0.4, box.h * big.aspect));
  return {
    [big.slot]: { x: box.x, y: box.y, w, h: box.h },
    ...columns(rest, [rest.length], { x: box.x + w + gap, y: box.y, w: box.w - w - gap, h: box.h }, gap),
  };
}

/** How badly an arrangement fits: the mean crop (log of cell vs photo proportions), plus 1 for
 * every photo whose orientation flips. */
export function score(cells: Cell[], a: Arrangement): number {
  let s = 0;
  for (const c of cells) {
    const b = a[c.slot];
    const cell = b.w / b.h;
    s += Math.abs(Math.log(cell / c.aspect));
    if ((c.aspect > 1.1 && cell < 0.9) || (c.aspect < 0.9 && cell > 1.1)) s += 1;
    if (b.w < 25 || b.h < 25) s += 2; // too small to see
  }
  return s / cells.length;
}

const sig = (a: Arrangement) => Object.entries(a).map(([k, b]) => `${k}:${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`).sort().join("|");

/** The best different arrangements of these photos in the box, best first. */
export function arrangements(cells: Cell[], box: Box, gap = 5, max = 12): Arrangement[] {
  if (!cells.length) return [];
  const n = cells.length;
  const cand: Arrangement[] = [];
  for (const g of compositions(n, 5)) {
    cand.push(rows(cells, g, box, gap));
    cand.push(columns(cells, g, box, gap));
  }
  cells.forEach((_, i) => {
    const a = hero(cells, i, box, gap);
    if (a) cand.push(a);
  });
  const seen = new Set<string>();
  return cand
    .map((a) => ({ a, s: score(cells, a) }))
    .sort((x, y) => x.s - y.s)
    .filter(({ a }) => {
      const k = sig(a);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max)
    .map(({ a }) => a);
}
