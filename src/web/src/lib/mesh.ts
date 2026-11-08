// Page layouts as a mesh: points shared by the photo cells around them. Moving a point reshapes
// every cell that uses it, and each cell is drawn inset by half the gap, so the white gaps stay
// equally wide however the points move. Templates: rows (Raster), rows with shaken points (Schuin,
// the "shattered" spreads of 2022), hexagons (Honingraat, 2022 page 3), parallel slanted stripes
// (Banen) and one large block with smaller ones around it (Mozaïek, the 2020–2021 pages). Pure.
import type { Box } from "./layout";

export type Pt = [number, number];

export interface Mesh {
  template: "raster" | "schuin" | "honingraat" | "banen" | "mozaiek";
  verts: Pt[];
  /** Each cell: its points (indices into verts), in order around it. */
  cells: number[][];
  /** Gap between cells (mm). */
  gap: number;
  /** Cells run on into the bleed (no page margin). */
  bleed: boolean;
}

const W = 210, H = 280, MARGIN = 10, BLEED = 4.5;

/** The area the cells fill, grown by half a gap so the inset cells end exactly on the margin
 * (or well past the page edge for a full-bleed layout). */
function domain(gap: number, bleed: boolean): Box {
  const out = bleed ? BLEED + gap : gap / 2 - MARGIN;
  return { x: -out, y: -out, w: W + 2 * out, h: H + 2 * out };
}

/** Points shared by key, so cells meeting at a point use the same index. */
class Verts {
  list: Pt[] = [];
  private index = new Map<string, number>();
  at(x: number, y: number): number {
    const key = `${Math.round(x * 100)},${Math.round(y * 100)}`;
    let i = this.index.get(key);
    if (i === undefined) {
      i = this.list.length;
      this.list.push([x, y]);
      this.index.set(key, i);
    }
    return i;
  }
}

/** Photos per row for n photos in a box: rows of about the page's proportions. */
function rowSplit(n: number, box: Box, variant = 0): number[] {
  const base = Math.round(Math.sqrt((n * box.h) / box.w / 0.75));
  const rows = Math.min(n, Math.max(1, base + [0, 1, -1][variant % 3]));
  const out: number[] = [];
  for (let r = 0; r < rows; r++) out.push(Math.floor((n * (r + 1)) / rows) - Math.floor((n * r) / rows));
  return out.filter((k) => k > 0);
}

/** Rows of cells whose splits may lean (`xAt` gives a split's x on the row's top and bottom line).
 * Where rows meet, every split point of both rows is on the line, so a cell's edge includes its
 * neighbours' corners and stays shared when they move. */
function stripes(counts: number[], box: Box, xAt: (r: number, i: number, top: boolean) => number): { verts: Pt[]; cells: number[][] } {
  const v = new Verts();
  const ys = counts.map((_, r) => box.y + (box.h * r) / counts.length).concat(box.y + box.h);
  const splits = (top: boolean) => counts.map((k, r) => Array.from({ length: k + 1 }, (_, i) => (i === 0 ? box.x : i === k ? box.x + box.w : xAt(r, i, top))));
  const tops = splits(true), bottoms = splits(false);
  const line = (l: number) => [...new Set([...(bottoms[l - 1] ?? []), ...(tops[l] ?? [])].map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b);
  const within = (xs: number[], a: number, b: number) => xs.filter((x) => x >= a - 0.01 && x <= b + 0.01);
  const cells: number[][] = [];
  counts.forEach((k, r) => {
    const top = line(r), bottom = line(r + 1);
    for (let i = 0; i < k; i++) {
      cells.push([
        ...within(top, tops[r][i], tops[r][i + 1]).map((x) => v.at(x, ys[r])),
        ...within(bottom, bottoms[r][i], bottoms[r][i + 1]).reverse().map((x) => v.at(x, ys[r + 1])),
      ]);
    }
  });
  return { verts: v.list, cells };
}

/** Rows with their splits staggered, so they don't line up into a plain grid. */
function rows(n: number, box: Box, variant = 0): { verts: Pt[]; cells: number[][] } {
  const counts = rowSplit(n, box, variant);
  const lean = [[-0.12, 0.18], [0.2, -0.15], [0, 0.25], [-0.22, 0.05]][variant % 4];
  return stripes(counts, box, (r, i) => box.x + (box.w * (i + lean[r % 2])) / counts[r]);
}

/** Parallel slanted stripes: one row up to four photos, then two or three rows. */
function bands(n: number, box: Box, variant = 0): { verts: Pt[]; cells: number[][] } {
  const nrows = n <= 4 ? 1 : n <= 8 ? 2 : 3;
  const counts = Array.from({ length: nrows }, (_, r) => Math.floor((n * (r + 1)) / nrows) - Math.floor((n * r) / nrows)).filter((k) => k > 0);
  const slope = [0.22, -0.22, 0.38, -0.38][variant % 4];
  const rowH = box.h / counts.length;
  return stripes(counts, box, (r, i, top) => box.x + (box.w * i) / counts[r] + ((top ? 1 : -1) * slope * rowH) / 2);
}

/** One large block (55–65% of the page) and the rest split into smaller ones, each time the
 * largest along its long side. Corners of neighbours on a block's side become points of it. */
function mosaic(n: number, box: Box, variant = 0): { verts: Pt[]; cells: number[][] } {
  const rnd = random(`mozaiek#${variant}`);
  const rects: Box[] = [];
  if (n <= 1) rects.push(box);
  else {
    const t = 0.55 + rnd() * 0.1;
    const side = variant % 4; // the large block on the left, top, right or bottom
    const vertical = side % 2 === 0;
    const first = side < 2;
    const bigW = vertical ? box.w * t : box.w, bigH = vertical ? box.h : box.h * t;
    const big: Box = { x: vertical && !first ? box.x + box.w - bigW : box.x, y: !vertical && !first ? box.y + box.h - bigH : box.y, w: bigW, h: bigH };
    const rest: Box = vertical
      ? { x: first ? box.x + bigW : box.x, y: box.y, w: box.w - bigW, h: box.h }
      : { x: box.x, y: first ? box.y + bigH : box.y, w: box.w, h: box.h - bigH };
    rects.push(big, rest);
    while (rects.length < n) {
      let k = 1;
      for (let i = 2; i < rects.length; i++) if (rects[i].w * rects[i].h > rects[k].w * rects[k].h) k = i;
      const r = rects[k], f = 0.4 + rnd() * 0.2;
      const across = r.w / r.h > 1.1 || (r.w / r.h > 0.8 && rnd() < 0.5);
      const parts: [Box, Box] = across
        ? [{ ...r, w: r.w * f }, { ...r, x: r.x + r.w * f, w: r.w * (1 - f) }]
        : [{ ...r, h: r.h * f }, { ...r, y: r.y + r.h * f, h: r.h * (1 - f) }];
      rects.splice(k, 1, ...parts);
    }
  }
  const corners = rects.flatMap((r): Pt[] => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const v = new Verts();
  const cells = rects.map((r) => {
    const x1 = r.x + r.w, y1 = r.y + r.h;
    const on = (f: (p: Pt) => boolean, key: (p: Pt) => number) =>
      [...new Map(corners.filter(f).map((p): [string, Pt] => [`${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`, p])).values()].sort((a, b) => key(a) - key(b));
    const top = on((p) => near(p[1], r.y) && p[0] >= r.x - 0.01 && p[0] <= x1 + 0.01, (p) => p[0]);
    const right = on((p) => near(p[0], x1) && p[1] > r.y + 0.01 && p[1] <= y1 + 0.01, (p) => p[1]);
    const bottom = on((p) => near(p[1], y1) && p[0] >= r.x - 0.01 && p[0] < x1 - 0.01, (p) => -p[0]);
    const left = on((p) => near(p[0], r.x) && p[1] > r.y + 0.01 && p[1] < y1 - 0.01, (p) => -p[1]);
    return [...top, ...right, ...bottom, ...left].map((p) => v.at(p[0], p[1]));
  });
  return { verts: v.list, cells };
}

/** A small deterministic random (the same page gets the same shapes). */
export function random(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Flat-topped hexagons over the page, sized so about n of them show. */
function hexagons(n: number, box: Box, variant = 0): { verts: Pt[]; cells: number[][] } {
  const visible = (r: number) => {
    let count = 0;
    const dx = 1.5 * r, dy = Math.sqrt(3) * r;
    for (let c = -1; c * dx < W + r; c++)
      for (let row = -1; row * dy < H + dy; row++) {
        const cx = c * dx, cy = row * dy + (c % 2 ? dy / 2 : 0);
        if (cx > -r / 2 && cx < W + r / 2 && cy > -dy / 3 && cy < H + dy / 3) count++;
      }
    return count;
  };
  let r = 80;
  while (r > 8 && visible(r) < n) r *= 0.96;
  const v = new Verts();
  const cells: number[][] = [];
  const dx = 1.5 * r, dy = Math.sqrt(3) * r;
  for (let c = -1; c * dx < W + r; c++)
    for (let row = -1; row * dy < H + dy; row++) {
      const cx = c * dx + ((variant % 3) * dx) / 3, cy = row * dy + (c % 2 ? dy / 2 : 0) + ((variant % 2) * dy) / 2;
      if (!(cx > -r / 2 && cx < W + r / 2 && cy > -dy / 3 && cy < H + dy / 3)) continue;
      cells.push(Array.from({ length: 6 }, (_, k) => v.at(cx + r * Math.cos((Math.PI / 3) * k), cy + r * Math.sin((Math.PI / 3) * k))));
    }
  void box;
  return { verts: v.list, cells };
}

/** A layout for n photos. `variant` gives another one of the same kind (other rows, other shakes,
 * a shifted honeycomb): the smart-layout buttons step through them. */
export function makeMesh(template: Mesh["template"], n: number, seed: string, opts?: { gap?: number; bleed?: boolean; variant?: number }): Mesh {
  const variant = opts?.variant ?? 0;
  const gap = opts?.gap ?? (template === "raster" || template === "mozaiek" ? 5 : 3);
  // within the margins unless asked (a full-bleed shattered page loses its outer photos' edges
  // at the cut); the honeycomb is meant to run off the page
  const bleed = opts?.bleed ?? template === "honingraat";
  const box = domain(gap, bleed);
  // a honeycomb needs small cells to read as one (2022 had 17 on a page): extra cells get more photos
  if (template === "honingraat") return { template, gap, bleed, ...hexagons(Math.max(n, 14), box, variant) };
  if (template === "banen") return { template, gap, bleed, ...bands(n, box, variant) };
  if (template === "mozaiek") return { template, gap, bleed, ...mosaic(n, box, variant) };
  const m = rows(n, box, variant);
  if (template === "schuin") {
    const rnd = random(`${seed}#${variant}`);
    const cell = Math.sqrt((box.w * box.h) / Math.max(1, n));
    const edge = (p: Pt) => Math.abs(p[0] - box.x) < 0.01 || Math.abs(p[0] - box.x - box.w) < 0.01 || Math.abs(p[1] - box.y) < 0.01 || Math.abs(p[1] - box.y - box.h) < 0.01;
    m.verts = m.verts.map((p) => (edge(p) ? p : [p[0] + (rnd() - 0.5) * cell * 0.45, p[1] + (rnd() - 0.5) * cell * 0.35]));
  }
  return { template, gap, bleed, ...m };
}

const area2 = (pts: Pt[]) => pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0);

/** A polygon moved inward by d on every edge (mitres clamped for sharp corners). */
export function inset(pts: Pt[], d: number): Pt[] {
  // drop repeated points, orient clockwise in screen coordinates (y down) so "inward" is consistent
  let p = pts.filter((q, i) => {
    const r = pts[(i + 1) % pts.length];
    return Math.hypot(q[0] - r[0], q[1] - r[1]) > 1e-6;
  });
  if (p.length < 3) return p;
  if (area2(p) < 0) p = [...p].reverse();
  const n = p.length;
  const normal = (a: Pt, b: Pt): Pt => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  };
  return p.map((q, i) => {
    const prev = p[(i - 1 + n) % n], next = p[(i + 1) % n];
    const n1 = normal(prev, q), n2 = normal(q, next);
    const m: Pt = [n1[0] + n2[0], n1[1] + n2[1]];
    const dot = m[0] * n1[0] + m[1] * n1[1];
    if (Math.hypot(m[0], m[1]) < 1e-6 || Math.abs(dot) < 1e-6) return [q[0] + n1[0] * d, q[1] + n1[1] * d];
    const k = Math.min(d / dot, 4 * d / Math.hypot(m[0], m[1]));
    return [q[0] + m[0] * k, q[1] + m[1] * k];
  });
}

/** Each cell as drawn: its points inset by half the gap. */
export function cellPolygons(mesh: Mesh): Pt[][] {
  return mesh.cells.map((c) => inset(c.map((i) => mesh.verts[i]), mesh.gap / 2));
}

export function bboxOf(pts: Pt[]): Box {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x || 1, h: Math.max(...ys) - y || 1 };
}

export function pointInPolygon(x: number, y: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Every side between two points, once (as index pairs). */
export function meshEdges(mesh: Mesh): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const c of mesh.cells)
    c.forEach((a, i) => {
      const b = c[(i + 1) % c.length];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push([a, b]);
      }
    });
  return out;
}

/** A new point halfway a side, in every cell that has that side. */
export function splitEdge(mesh: Mesh, a: number, b: number): Mesh {
  const [p, q] = [mesh.verts[a], mesh.verts[b]];
  const v = mesh.verts.length;
  const cells = mesh.cells.map((c) => {
    const out: number[] = [];
    c.forEach((x, i) => {
      out.push(x);
      const y = c[(i + 1) % c.length];
      if ((x === a && y === b) || (x === b && y === a)) out.push(v);
    });
    return out;
  });
  return { ...mesh, verts: [...mesh.verts, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]], cells };
}

/** A point taken out of every cell (a cell keeps at least three points). */
export function removeVert(mesh: Mesh, v: number): Mesh {
  if (mesh.cells.some((c) => c.includes(v) && c.length <= 3)) return mesh;
  return { ...mesh, cells: mesh.cells.map((c) => c.filter((x) => x !== v)) };
}
