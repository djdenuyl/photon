// Page layouts as a mesh: points shared by the photo cells around them. Moving a point reshapes
// every cell that uses it, and each cell is drawn inset by half the gap, so the white gaps stay
// equally wide however the points move. Three templates: rows (Raster), rows with shaken points
// (Schuin, the "shattered" spreads of 2022) and hexagons (Honingraat, 2022 page 3). Pure.
import type { Box } from "./layout";

export type Pt = [number, number];

export interface Mesh {
  template: "raster" | "schuin" | "honingraat";
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
function rowSplit(n: number, box: Box): number[] {
  const rows = Math.max(1, Math.round(Math.sqrt((n * box.h) / box.w / 0.75)));
  const out: number[] = [];
  for (let r = 0; r < rows; r++) out.push(Math.floor((n * (r + 1)) / rows) - Math.floor((n * r) / rows));
  return out.filter((k) => k > 0);
}

/** Rows of cells; where rows meet, every split point of both rows is on the line (so a cell's
 * edge includes its neighbours' corners and stays shared when they move). */
function rows(n: number, box: Box): { verts: Pt[]; cells: number[][] } {
  const counts = rowSplit(n, box);
  const v = new Verts();
  const ys = counts.map((_, r) => box.y + (box.h * r) / counts.length).concat(box.y + box.h);
  // stagger the splits so rows don't line up into a plain grid
  const splits = counts.map((k, r) =>
    Array.from({ length: k + 1 }, (_, i) => {
      if (i === 0 || i === k) return i === 0 ? box.x : box.x + box.w;
      return box.x + (box.w * (i + (r % 2 ? 0.18 : -0.12))) / k;
    }),
  );
  const line = (l: number) => [...new Set([...(splits[l - 1] ?? []), ...(splits[l] ?? [])].map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b);
  const cells: number[][] = [];
  counts.forEach((k, r) => {
    const top = line(r), bottom = line(r + 1);
    for (let i = 0; i < k; i++) {
      const a = splits[r][i], b = splits[r][i + 1];
      const inside = (xs: number[]) => xs.filter((x) => x >= a - 0.01 && x <= b + 0.01);
      cells.push([
        ...inside(top).map((x) => v.at(x, ys[r])),
        ...inside(bottom).reverse().map((x) => v.at(x, ys[r + 1])),
      ]);
    }
  });
  return { verts: v.list, cells };
}

/** A small deterministic random (the same page gets the same shapes). */
function random(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Flat-topped hexagons over the page, sized so about n of them show. */
function hexagons(n: number, box: Box): { verts: Pt[]; cells: number[][] } {
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
      const cx = c * dx, cy = row * dy + (c % 2 ? dy / 2 : 0);
      if (!(cx > -r / 2 && cx < W + r / 2 && cy > -dy / 3 && cy < H + dy / 3)) continue;
      cells.push(Array.from({ length: 6 }, (_, k) => v.at(cx + r * Math.cos((Math.PI / 3) * k), cy + r * Math.sin((Math.PI / 3) * k))));
    }
  void box;
  return { verts: v.list, cells };
}

export function makeMesh(template: Mesh["template"], n: number, seed: string, opts?: { gap?: number; bleed?: boolean }): Mesh {
  const gap = opts?.gap ?? (template === "raster" ? 5 : 3);
  // within the margins unless asked (a full-bleed shattered page loses its outer photos' edges
  // at the cut); the honeycomb is meant to run off the page
  const bleed = opts?.bleed ?? template === "honingraat";
  const box = domain(gap, bleed);
  // a honeycomb needs small cells to read as one (2022 had 17 on a page): extra cells get more photos
  if (template === "honingraat") return { template, gap, bleed, ...hexagons(Math.max(n, 14), box) };
  const m = rows(n, box);
  if (template === "schuin") {
    const rnd = random(seed);
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
