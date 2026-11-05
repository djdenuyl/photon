// The editor on top of a rendered spread: select (click, shift-click, drag a box; a click on an
// empty spot selects the page, a double-click its background photo), move (several at once,
// snapping to guides), resize with the corner handles, move a photo inside its frame with the
// see-through centre handle, drag the points and sides of colour areas, drag the points of a mesh
// layout, and a toolbar that floats next to the selection. Changes are previewed live and
// committed on release.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { updateElement, type ElementEdit, type Edits } from "@/lib/edits";
import { BG_VEIL, PAGE, placement, type Box, type Element, type Page } from "@/lib/layout";
import { meshEdges, pointInPolygon, removeVert, splitEdge, type Mesh, type Pt } from "@/lib/mesh";
import type { SaveStatus } from "@/lib/saver";
import type { Photos } from "@/lib/types";

/** photo: a framed photo; bg: a page background photo (locked in place); shape: a cover letter or
 * shard; cell: a photo in a mesh layout; fill: a colour area; page: the page's own colour area. */
export type Kind = "photo" | "bg" | "shape" | "cell" | "month" | "caption" | "fill" | "page";

export interface Item {
  sel: string;
  key: string;
  slot: string;
  el: Element;
  kind: Kind;
  /** Where it sits on its page (mm). */
  box: Box;
  dx: number;
  page: Page;
}

const pageKey = (p: Page) => `${p.event.id}:${p.k}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Caption edits always carry their frame and `box`, so older (one-line) caption edits are
 * converted on the first change (see edits.ts). */
export function withFrame(i: Item, change: ElementEdit | null): ElementEdit | null {
  if (!change || i.el.type !== "caption") return change;
  const { x, y, w, h } = i.el;
  return { x, y, w, h, ...change, box: true };
}

export function itemsFor(pages: { page: Page | null; dx: number }[]): Item[] {
  return pages.flatMap(({ page, dx }) =>
    (page?.elements ?? []).map((el): Item => {
      const key = pageKey(page!);
      const slot = el.slot ?? "";
      const kind: Kind =
        el.type === "photo" ? (el.bg ? "bg" : el.cell !== undefined ? "cell" : el.shape ? "shape" : "photo")
        : el.type === "fill" ? (el.slot === "pagefill" ? "page" : "fill")
        : el.type;
      const box = { x: el.x, y: el.y, w: el.w, h: el.h };
      return { sel: `${key}|${slot}`, key, slot, el, kind, box, dx, page: page! };
    }),
  );
}

/** The edit that moves an item (null: it doesn't move on its own). */
export function moveBy(i: Item, dx: number, dy: number): ElementEdit | null {
  const el = i.el;
  if (i.kind === "bg" || i.kind === "cell" || i.kind === "page") return null;
  const pts = editablePts(i);
  if (pts) return { pts: pts.map(([x, y]): Pt => [x + dx, y + dy]) };
  return withFrame(i, { x: el.x + dx, y: el.y + dy });
}

/** An item's outline on its page, when it isn't a plain rectangle. */
function polygonOf(i: Item): Pt[] | null {
  const el = i.el;
  if (el.type === "fill") return el.pts;
  if (el.type === "photo" && el.shape?.kind === "poly") return el.shape.pts.map(([u, v]): Pt => [el.x + u * el.w, el.y + v * el.h]);
  return null;
}

/** Items that show a photo and can trade it with another. */
const tradeable = (i: Item) => i.kind === "photo" || i.kind === "cell" || i.kind === "shape" || i.kind === "month";

/** The points that can be dragged: colour areas and polygon photos (not mesh cells, they follow the mesh). */
function editablePts(i: Item): Pt[] | null {
  if (i.el.type === "fill") return i.el.pts;
  if (i.el.type === "photo" && i.el.shape?.kind === "poly" && i.el.cell === undefined) return polygonOf(i);
  return null;
}

/** Items picked by their outline rather than their box (they would overlap): mesh cells and colour areas. */
const byOutline = (i: Item) => i.kind === "cell" || i.kind === "fill";

/** The photo shown in an item (photos, cover parts, month titles). */
export function photoOf(i: Item): string | null {
  return i.el.type === "photo" ? i.el.id || null : i.el.type === "month" ? i.el.photo : null;
}

const rotOf = (i: Item) => (i.el.type === "photo" ? (i.el.rot ?? 0) : 0);

/**
 * Does a text frame's text not fit? Counted in lines × line height, in screen pixels: the
 * element's own scroll sizes are whole numbers of page units (a millimetre each, far too coarse)
 * and include the font's ascent and descent, which for HAPPY DONUTS are much taller than its
 * letters (so "DEEL 2" looked too big for a frame it fits in).
 */
function textOverflows(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const scale = box.width / (parseFloat(style.width) || 1);
  const line = parseFloat(style.lineHeight) * scale;
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0);
  if (!rects.length || !line) return false;
  const tops: number[] = [];
  for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) < line / 2)) tops.push(r.top);
  const tooTall = tops.length * line > box.height + 0.5;
  // a space where a line wraps hangs past the edge: only real text (wider than half a line) counts
  const tooWide = rects.some((r) => r.width > line / 2 && r.right > box.right + 1);
  return tooTall || tooWide;
}

// Snapping: within 2 mm of a page's margins, centre lines and edges, or of another element's edges,
// centre, or edge plus the 5 mm gap. Hold Alt to place freely.
const SNAP = 2;
interface Lines {
  x: number[];
  y: number[];
}

function snapLines(items: Item[], moving: Set<string>, width: number): Lines {
  const x: number[] = [];
  const y: number[] = [0, PAGE.margin, PAGE.h / 2, PAGE.h - PAGE.margin, PAGE.h];
  for (let off = 0; off < width; off += PAGE.w) x.push(off, off + PAGE.margin, off + PAGE.w / 2, off + PAGE.w - PAGE.margin, off + PAGE.w);
  for (const i of items) {
    if (moving.has(i.sel) || i.kind === "bg") continue;
    const l = i.dx + i.box.x, r = l + i.box.w, t = i.box.y, b = t + i.box.h;
    x.push(l, r, (l + r) / 2, l - PAGE.gap, r + PAGE.gap);
    y.push(t, b, (t + b) / 2, t - PAGE.gap, b + PAGE.gap);
  }
  return { x, y };
}

/** The smallest shift that puts one of `values` on one of `lines`, and that line. */
function snap1(values: number[], lines: number[]): { d: number; at: number } | null {
  let best: { d: number; at: number } | null = null;
  for (const v of values)
    for (const l of lines) if (Math.abs(l - v) <= SNAP && (!best || Math.abs(l - v) < Math.abs(best.d))) best = { d: l - v, at: l };
  return best;
}

type Drag =
  | { mode: "move"; x: number; y: number; targets: Item[]; sel: string; base: Edits; moved: boolean }
  | { mode: "vert" | "edge"; x: number; y: number; target: Item; index: number; base: Edits; moved: boolean }
  | { mode: "mesh"; x: number; y: number; key: string; mesh: Mesh; index: number; base: Edits; moved: boolean }
  | { mode: "pan"; x: number; y: number; target: Item; base: Edits; moved: boolean }
  | { mode: "resize"; x: number; y: number; target: Item; corner: string; base: Edits; moved: boolean }
  | { mode: "band"; x: number; y: number; moved: boolean; additive: boolean };

export function EditorOverlay({
  items,
  width,
  photos,
  edits,
  selection,
  onSelect,
  snap,
  bar,
  meshes,
  meshActive,
  noted,
  onNotes,
  swapFrom,
  onSwapWith,
  onEmpty,
  onPreview,
  onCommit,
}: {
  items: Item[];
  width: number;
  photos: Photos;
  edits: Edits;
  selection: Set<string>;
  onSelect: (s: Set<string>) => void;
  snap: boolean;
  /** The toolbar for the selection, shown above (or below) it. */
  bar: ReactNode;
  /** The mesh layouts on the visible pages (their points can always be dragged). */
  meshes: { key: string; dx: number; mesh: Mesh }[];
  /** The mesh whose sides get "+" handles (its page or one of its cells is selected). */
  meshActive: string | null;
  /** What has open notes: element selections (`key|slot`) and page keys. */
  noted: Set<string>;
  onNotes: () => void;
  /** While choosing another photo for this item, the spread's other photos trade places with it on a click. */
  swapFrom: Item | null;
  onSwapWith: (other: Item) => void;
  /** A click on a frame without a photo. */
  onEmpty: (item: Item) => void;
  onPreview: (e: Edits | null) => void;
  onCommit: (e: Edits) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const preview = useRef<Edits | null>(null);
  const lines = useRef<Lines>({ x: [], y: [] });
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [guides, setGuides] = useState<Lines>({ x: [], y: [] });
  const [busy, setBusy] = useState(false);
  // text frames whose text doesn't fit (measured on the rendered page, like Albelli's red warning)
  const [overflow, setOverflow] = useState<string[]>([]);
  useLayoutEffect(() => {
    const stage = root.current?.parentElement;
    if (!stage) return;
    const over = items
      .filter((i) => i.kind === "caption")
      .filter((i) => {
        const el = stage.querySelector<HTMLElement>(`[data-cap="${CSS.escape(i.sel)}"]`);
        return !!el && textOverflows(el);
      })
      .map((i) => i.sel);
    if (over.join() !== overflow.join()) setOverflow(over);
  }, [items, overflow]);

  // a point of a colour area, picked to delete it (Delete / Backspace)
  const [vertex, setVertex] = useState<{ sel: string; index: number } | null>(null);
  // a point of a mesh layout, picked to delete it
  const [meshNode, setMeshNode] = useState<{ key: string; index: number } | null>(null);
  useEffect(() => {
    if (!vertex) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      const i = items.find((it) => it.sel === vertex.sel);
      e.preventDefault();
      e.stopImmediatePropagation();
      const pts = i ? editablePts(i) : null;
      if (i && pts && pts.length > 3) onCommit(updateElement(edits, i.key, i.slot, { pts: pts.filter((_, k) => k !== vertex.index) }));
      setVertex(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [vertex, items, edits, onCommit]);

  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = root.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * PAGE.h };
  };
  const byId = new Map(items.map((i) => [i.sel, i]));
  const chosen = items.filter((i) => selection.has(i.sel));

  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const p = toMm(e);
    const t = e.target as HTMLElement;
    const handle = t.closest<HTMLElement>("[data-handle]");
    const hit = t.closest<HTMLElement>("[data-sel]");
    root.current!.setPointerCapture(e.pointerId);
    const vert = t.closest<HTMLElement>("[data-vert], [data-edge]");
    if (vert && chosen.length === 1) {
      const isVert = vert.dataset.vert !== undefined;
      drag.current = { mode: isVert ? "vert" : "edge", ...p, target: chosen[0], index: Number(isVert ? vert.dataset.vert : vert.dataset.edge), base: edits, moved: false };
      return;
    }
    const mv = t.closest<HTMLElement>("[data-mvert]");
    const [mkey, mi] = (mv?.dataset.mvert ?? "").split("|");
    const m = meshes.find((x) => x.key === mkey);
    if (mv && m) {
      drag.current = { mode: "mesh", ...p, key: m.key, mesh: m.mesh, index: Number(mi), base: edits, moved: false };
      return;
    }
    setMeshNode(null);
    setVertex(null);
    // boxes first; mesh cells and colour areas by their outline, the topmost one
    const target = (hit ? byId.get(hit.dataset.sel!) : undefined)
      ?? [...items].reverse().find((i) => byOutline(i) && pointInPolygon(p.x - i.dx, p.y, polygonOf(i) ?? []));
    if (swapFrom && target && target.sel !== swapFrom.sel && tradeable(target)) {
      onSwapWith(target);
      return;
    }
    if (target && tradeable(target) && !photoOf(target) && !e.shiftKey) {
      onSelect(new Set([target.sel]));
      onEmpty(target);
      return;
    }
    if (target?.kind === "cell" && !e.shiftKey) {
      onSelect(new Set([target.sel]));
      drag.current = { mode: "pan", ...p, target, base: edits, moved: false };
      return;
    }
    if (target) {
      lines.current = snapLines(items, selection.has(target.sel) ? selection : new Set([target.sel]), width);
      if (handle?.dataset.handle === "pan") {
        drag.current = { mode: "pan", ...p, target, base: edits, moved: false };
        return;
      }
      if (handle) {
        drag.current = { mode: "resize", ...p, target, corner: handle.dataset.handle!, base: edits, moved: false };
        return;
      }
      const sel = target.sel;
      if (e.shiftKey) {
        const next = new Set(selection);
        if (next.has(sel)) next.delete(sel);
        else next.add(sel);
        onSelect(next);
        return;
      }
      const group = (selection.has(sel) ? items.filter((i) => selection.has(i.sel)) : [target]).filter((i) => moveBy(i, 0, 0));
      if (!selection.has(sel)) onSelect(new Set([sel]));
      drag.current = { mode: "move", ...p, targets: group, sel, base: edits, moved: false };
      return;
    }
    drag.current = { mode: "band", ...p, moved: false, additive: e.shiftKey };
    if (!e.shiftKey) onSelect(new Set());
  };

  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toMm(e);
    let dx = p.x - d.x;
    let dy = p.y - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 0.6) {
      d.moved = true;
      setBusy(true);
    }
    if (!d.moved) return;
    const snapping = snap && !e.altKey;
    const shown: Lines = { x: [], y: [] };
    const take = (s: { d: number; at: number } | null, axis: "x" | "y") => {
      if (!s) return;
      if (axis === "x") dx += s.d;
      else dy += s.d;
      shown[axis].push(s.at);
    };
    let next: Edits | null = null;
    if (d.mode === "move") {
      if (!d.targets.length) return;
      if (snapping) {
        const x0 = Math.min(...d.targets.map((t) => t.dx + t.box.x)) + dx;
        const x1 = Math.max(...d.targets.map((t) => t.dx + t.box.x + t.box.w)) + dx;
        const y0 = Math.min(...d.targets.map((t) => t.box.y)) + dy;
        const y1 = Math.max(...d.targets.map((t) => t.box.y + t.box.h)) + dy;
        take(snap1([x0, x1, (x0 + x1) / 2], lines.current.x), "x");
        take(snap1([y0, y1, (y0 + y1) / 2], lines.current.y), "y");
      }
      next = d.targets.reduce((acc, t) => updateElement(acc, t.key, t.slot, moveBy(t, dx, dy) ?? {}), d.base);
    } else if (d.mode === "vert" || d.mode === "edge") {
      const own = editablePts(d.target);
      if (!own) return;
      const pts = own.map((q): Pt => [q[0], q[1]]);
      if (d.mode === "vert") {
        pts[d.index] = [pts[d.index][0] + dx, pts[d.index][1] + dy];
      } else {
        // a side moves straight out or in, both its points along its normal
        const a = pts[d.index], b = pts[(d.index + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const n: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
        const k = dx * n[0] + dy * n[1];
        for (const j of [d.index, (d.index + 1) % pts.length]) pts[j] = [pts[j][0] + n[0] * k, pts[j][1] + n[1] * k];
      }
      next = updateElement(d.base, d.target.key, d.target.slot, { pts });
    } else if (d.mode === "mesh") {
      const verts = d.mesh.verts.map((q, k): Pt => (k === d.index ? [q[0] + dx, q[1] + dy] : q));
      next = updateElement(d.base, d.key, "mesh", { mesh: { ...d.mesh, verts } });
    } else if (d.mode === "pan") {
      const { el } = d.target;
      const id = photoOf(d.target);
      const photo = id ? photos.get(id) : undefined;
      if (!photo || (el.type !== "photo" && el.type !== "month")) return;
      const img = placement(photo, el, el.zoom ?? 1, el.focus);
      // the focus point that puts the current view in the middle, moved against the drag
      const fx0 = (el.x + el.w / 2 - img.x) / img.w, fy0 = (el.y + el.h / 2 - img.y) / img.h;
      const hx = el.w / 2 / img.w, hy = el.h / 2 / img.h;
      const focus: [number, number] = [clamp(fx0 - dx / img.w, hx, 1 - hx), clamp(fy0 - dy / img.h, hy, 1 - hy)];
      next = updateElement(d.base, d.target.key, d.target.slot, { focus });
    } else if (d.mode === "resize") {
      const { box, dx: off } = d.target;
      const c = d.corner;
      if (snapping) {
        // only the sides being dragged snap
        if (/[ew]/.test(c)) take(snap1([off + (c.includes("e") ? box.x + box.w : box.x) + dx], lines.current.x), "x");
        if (/[ns]/.test(c)) take(snap1([(c.includes("s") ? box.y + box.h : box.y) + dy], lines.current.y), "y");
      }
      let { x, y, w, h } = box;
      const min = d.target.kind === "caption" ? 3 : 8;
      if (c.includes("e")) w = Math.max(min, box.w + dx);
      if (c.includes("s")) h = Math.max(min, box.h + dy);
      if (c.includes("w")) w = Math.max(min, box.w - dx);
      if (c.includes("n")) h = Math.max(min, box.h - dy);
      if (c.includes("w")) x = box.x + box.w - w;
      if (c.includes("n")) y = box.y + box.h - h;
      next = updateElement(d.base, d.target.key, d.target.slot, withFrame(d.target, { x, y, w, h }));
    } else {
      setBand({ x0: d.x, y0: d.y, x1: p.x, y1: p.y });
    }
    setGuides(shown);
    if (next) {
      preview.current = next;
      onPreview(next);
    }
  };

  const up = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    root.current?.releasePointerCapture(e.pointerId);
    setBusy(false);
    setGuides({ x: [], y: [] });
    if (!d) return;
    if (d.mode === "band") {
      if (band) {
        const [x0, x1] = [Math.min(band.x0, band.x1), Math.max(band.x0, band.x1)];
        const [y0, y1] = [Math.min(band.y0, band.y1), Math.max(band.y0, band.y1)];
        const hits = items.filter((i) => i.kind !== "bg" && i.kind !== "page" && i.dx + i.box.x < x1 && i.dx + i.box.x + i.box.w > x0 && i.box.y < y1 && i.box.y + i.box.h > y0);
        onSelect(new Set([...(d.additive ? selection : []), ...hits.map((i) => i.sel)]));
      }
      else if (!d.moved) {
        // a click on an empty spot selects the page itself
        const page = items.find((i) => i.kind === "page" && d.x >= i.dx && d.x < i.dx + PAGE.w);
        if (page) onSelect(new Set([page.sel]));
      }
      setBand(null);
      return;
    }
    if (d.mode === "vert" && !d.moved) setVertex({ sel: d.target.sel, index: d.index });
    if (d.mode === "mesh" && !d.moved) setMeshNode({ key: d.key, index: d.index });
    const sidePts = d.mode === "edge" ? editablePts(d.target) : null;
    if (d.mode === "edge" && !d.moved && sidePts) {
      // a click (not a drag) on a side's middle: a new point there
      const pts = sidePts, k = d.index, a = pts[k], b = pts[(k + 1) % pts.length];
      onCommit(updateElement(edits, d.target.key, d.target.slot, { pts: [...pts.slice(0, k + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ...pts.slice(k + 1)] }));
      setVertex({ sel: d.target.sel, index: k + 1 });
    }
    // a plain click on one element of a group selects just that one
    if (d.mode === "move" && !d.moved && selection.size > 1) onSelect(new Set([d.sel]));
    if (d.moved && preview.current) onCommit(preview.current);
    preview.current = null;
    onPreview(null);
  };

  // double-click on a page's background (where no photo is) selects the background photo
  const dbl = (e: React.MouseEvent) => {
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-sel]");
    if (hit && byId.get(hit.dataset.sel!)?.kind !== "bg") return;
    const p = toMm(e);
    const bg = items.filter((i) => i.kind === "bg" && p.x >= i.dx && p.x < i.dx + PAGE.w).pop();
    if (bg) onSelect(new Set([bg.sel]));
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const single = chosen.length === 1;
  // a page with a mesh shows the mesh's points, not its colour area's
  const poly = single && editablePts(chosen[0]) && !(chosen[0].kind === "page" && meshes.some((m) => m.key === chosen[0].key)) ? chosen[0] : null;
  const polyPts = poly ? editablePts(poly)! : [];
  let barStyle: CSSProperties | null = null;
  if (chosen.length && bar && !busy && !band) {
    const x0 = Math.max(0, Math.min(...chosen.map((i) => i.dx + i.box.x)));
    const x1 = Math.min(width, Math.max(...chosen.map((i) => i.dx + i.box.x + i.box.w)));
    const y0 = Math.max(0, Math.min(...chosen.map((i) => i.box.y)));
    const y1 = Math.min(PAGE.h, Math.max(...chosen.map((i) => i.box.y + i.box.h)));
    const full = y0 < 30 && y1 > PAGE.h - 30;
    const above = y0 > 30;
    barStyle = {
      left: pct(clamp((x0 + x1) / 2, width * 0.18, width * 0.82), width),
      // a selection filling the page height gets its bar inside, at the top
      top: pct(full ? 12 : above ? y0 : y1, PAGE.h),
      transform: `translate(-50%, ${full ? "0" : above ? "calc(-100% - 12px)" : "12px"})`,
    };
  }
  return (
    <div
      ref={root}
      data-editing
      className="absolute inset-0 touch-none select-none"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={dbl}
    >
      {items.map((i) => {
        const on = selection.has(i.sel);
        // backgrounds, the page, cells and colour areas take no pointer events (picked by outline or click)
        const bg = i.kind === "bg" || i.kind === "page" || byOutline(i);
        const tooMuch = overflow.includes(i.sel);
        if ((i.kind === "bg" || i.kind === "page" || i.kind === "fill") && !on) return null;
        const rot = rotOf(i);
        return (
          <div
            key={i.sel}
            data-sel={i.sel}
            className={`absolute ${bg ? "pointer-events-none" : "cursor-move"} ${polygonOf(i) ? "" : tooMuch ? "outline-2 outline-dashed outline-[#e5322d]" : on ? "outline-2 outline-accent" : `outline-1 hover:outline-white/80 ${i.kind === "caption" ? "outline-dashed outline-white/40" : "outline-white/0"}`}`}
            style={{
              left: pct(i.dx + i.box.x, width),
              top: pct(i.box.y, PAGE.h),
              width: pct(i.box.w, width),
              height: pct(i.box.h, PAGE.h),
              transform: rot ? `rotate(${rot}deg)` : undefined,
              boxShadow: on && !polygonOf(i) ? "0 0 0 1px rgb(255 255 255 / 0.8)" : undefined,
            }}
          >
            {tooMuch && (
              <span
                title="De tekst past niet in het kader: maak het kader groter of de tekst korter"
                className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#e5322d] text-xs font-bold text-white shadow"
              >
                !
              </span>
            )}
          </div>
        );
      })}
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${width} ${PAGE.h}`} preserveAspectRatio="none" aria-hidden="true">
        {chosen.map((i) => {
          const pts = polygonOf(i);
          return pts ? (
            <polygon key={i.sel} points={pts.map(([x, y]) => `${x + i.dx},${y}`).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          ) : null;
        })}
        {swapFrom && items.filter((i) => i.sel !== swapFrom.sel && tradeable(i)).map((i) => {
          const pts = polygonOf(i) ?? [[i.box.x, i.box.y], [i.box.x + i.box.w, i.box.y], [i.box.x + i.box.w, i.box.y + i.box.h], [i.box.x, i.box.y + i.box.h]];
          return (
            <polygon key={`sw${i.sel}`} points={pts.map(([x, y]) => `${x + i.dx},${y}`).join(" ")} fill="var(--color-accent)" fillOpacity=".12"
              stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          );
        })}
        {meshes.filter((m) => m.key === meshActive).flatMap((m) => m.mesh.cells.map((c, k) => (
          <polygon key={`${m.key}${k}`} points={c.map((v) => `${m.mesh.verts[v][0] + m.dx},${m.mesh.verts[v][1]}`).join(" ")} fill="none" stroke="#fff" strokeOpacity=".8" strokeDasharray="4 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )))}
      </svg>
      {poly && (
        <>
          {polyPts.map((q, k) => {
            const r = polyPts[(k + 1) % polyPts.length];
            return (
              <span key={`e${k}`} data-edge={k} title="Klik voor een extra punt, sleep om deze zijde te verschuiven"
                className="absolute z-[7] flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-sm border-2 border-white bg-accent/70 text-[11px] leading-none font-bold text-white shadow"
                style={{ left: pct(poly.dx + (q[0] + r[0]) / 2, width), top: pct((q[1] + r[1]) / 2, PAGE.h) }}>+</span>
            );
          })}
          {polyPts.map((q, k) => (
            <span key={`v${k}`} data-vert={k} title="Sleep dit punt; klik en Delete om het te verwijderen"
              className={`absolute z-[7] h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow ${vertex?.index === k && vertex.sel === poly.sel ? "border-accent bg-white" : "border-white bg-accent"}`}
              style={{ left: pct(poly.dx + q[0], width), top: pct(q[1], PAGE.h) }} />
          ))}
        </>
      )}
      {poly && vertex?.sel === poly.sel && polyPts.length > 3 && polyPts[vertex.index] && (() => {
        const q = polyPts[vertex.index];
        return (
          <button type="button" aria-label="Punt verwijderen" title="Punt verwijderen"
            onPointerDown={(e) => {
              e.stopPropagation();
              onCommit(updateElement(edits, poly.key, poly.slot, { pts: polyPts.filter((_, k) => k !== vertex.index) }));
              setVertex(null);
            }}
            className="absolute z-[8] flex h-5 w-5 items-center justify-center rounded-full bg-[#d92d20] text-xs font-bold text-white shadow"
            style={{ left: `calc(${pct(poly.dx + q[0], width)} + 10px)`, top: `calc(${pct(q[1], PAGE.h)} - 22px)` }}>
            ×
          </button>
        );
      })()}
      {meshes.map((m) => {
        // the mesh's points, where the gaps meet; the active mesh also gets "+" on every side
        const shown = (q: Pt) => q[0] > -8 && q[0] < PAGE.w + 8 && q[1] > -8 && q[1] < PAGE.h + 8;
        const at = (q: Pt) => ({ left: pct(m.dx + Math.min(Math.max(q[0], -2), PAGE.w + 2), width), top: pct(Math.min(Math.max(q[1], -2), PAGE.h + 2), PAGE.h) });
        const used = new Set(m.mesh.cells.flat());
        const active = m.key === meshActive;
        return (
          <div key={`mesh${m.key}`} className="contents">
            {active && meshEdges(m.mesh).map(([a, b]) => {
              const mid: Pt = [(m.mesh.verts[a][0] + m.mesh.verts[b][0]) / 2, (m.mesh.verts[a][1] + m.mesh.verts[b][1]) / 2];
              return shown(mid) ? (
                <span key={`me${a}-${b}`} title="Een extra knooppunt" role="button" aria-label="Knooppunt toevoegen"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onCommit(updateElement(edits, m.key, "mesh", { mesh: splitEdge(m.mesh, a, b) }));
                    setMeshNode({ key: m.key, index: m.mesh.verts.length });
                  }}
                  className="absolute z-[7] flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border-2 border-white bg-accent/70 text-[11px] leading-none font-bold text-white shadow"
                  style={at(mid)}>+</span>
              ) : null;
            })}
            {m.mesh.verts.map((q, k) =>
              used.has(k) && shown(q) ? (
                <span key={`m${k}`} data-mvert={`${m.key}|${k}`} title="Sleep om de indeling te veranderen; klik om het te kunnen verwijderen"
                  className={`absolute z-[7] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 shadow ${active ? "h-4 w-4" : "h-3 w-3"} ${meshNode?.key === m.key && meshNode.index === k ? "border-accent bg-accent" : "border-accent bg-white"}`}
                  style={at(q)} />
              ) : null,
            )}
            {meshNode?.key === m.key && m.mesh.verts[meshNode.index] && (
              <button type="button" aria-label="Knooppunt verwijderen" title="Knooppunt verwijderen"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onCommit(updateElement(edits, m.key, "mesh", { mesh: removeVert(m.mesh, meshNode.index) }));
                  setMeshNode(null);
                }}
                className="absolute z-[8] flex h-5 w-5 items-center justify-center rounded-full bg-[#d92d20] text-xs font-bold text-white shadow"
                style={{ left: `calc(${at(m.mesh.verts[meshNode.index]).left} + 10px)`, top: `calc(${at(m.mesh.verts[meshNode.index]).top} - 22px)` }}>
                ×
              </button>
            )}
          </div>
        );
      })}
      {single && (() => {
        // the selection's handles, on top of everything (a photo drawn later must not catch them)
        const i = chosen[0];
        const locked = i.kind === "bg" || i.kind === "page" || byOutline(i);
        const rot = rotOf(i);
        return (
          <div data-sel={i.sel} className="pointer-events-none absolute z-[6]"
            style={{ left: pct(i.dx + i.box.x, width), top: pct(i.box.y, PAGE.h), width: pct(i.box.w, width), height: pct(i.box.h, PAGE.h), transform: rot ? `rotate(${rot}deg)` : undefined }}>
            {!locked && i.kind !== "shape" &&
              ["nw", "ne", "sw", "se", "n", "s", "e", "w"].map((c) => (
                <span
                  key={c}
                  data-handle={c}
                  className={`pointer-events-auto absolute border-2 border-white bg-accent shadow ${c.length === 2 ? "h-3.5 w-3.5 rounded-full" : c === "n" || c === "s" ? "h-2.5 w-6 rounded-full" : "h-6 w-2.5 rounded-full"}`}
                  style={{
                    left: c.includes("w") ? (c.length === 2 ? -7 : -5) : c === "n" || c === "s" ? "calc(50% - 12px)" : undefined,
                    right: c.includes("e") ? (c.length === 2 ? -7 : -5) : undefined,
                    top: c.includes("n") ? (c.length === 2 ? -7 : -5) : c === "e" || c === "w" ? "calc(50% - 12px)" : undefined,
                    bottom: c.includes("s") ? (c.length === 2 ? -7 : -5) : undefined,
                    cursor: { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" }[c],
                  }}
                />
              ))}
            {photoOf(i) && (
              <span
                data-handle="pan"
                title="Sleep om de foto binnen het kader te verschuiven"
                className="pointer-events-auto absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white/90 bg-white/25 text-white shadow-md backdrop-blur-[2px] active:cursor-grabbing"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
                </svg>
              </span>
            )}
          </div>
        );
      })()}
      {items.filter((i) => noted.has(i.sel) || (i.kind === "page" && noted.has(i.key))).map((i) => {
        const page = i.kind === "page";
        return (
          <button key={`n${i.sel}`} type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onNotes}
            title={page ? "Notitie bij deze pagina" : "Notitie bij dit element"} aria-label="Notitie"
            className="absolute z-[5] flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#f2c94c] text-[10px] font-bold text-[#161513] shadow"
            style={{ left: pct(page ? i.dx + PAGE.w - 6 : i.dx + Math.max(0, i.box.x) + 2, width), top: pct(page ? 6 : Math.max(0, i.box.y) + 2, PAGE.h) }}>
            ✎
          </button>
        );
      })}
      {guides.x.map((x) => (
        <div key={`x${x}`} className="pointer-events-none absolute inset-y-0 w-px bg-[#ff2e88]" style={{ left: pct(x, width) }} />
      ))}
      {guides.y.map((y) => (
        <div key={`y${y}`} className="pointer-events-none absolute inset-x-0 h-px bg-[#ff2e88]" style={{ top: pct(y, PAGE.h) }} />
      ))}
      {band && (
        <div
          className="pointer-events-none absolute border border-accent bg-accent/15"
          style={{
            left: pct(Math.min(band.x0, band.x1), width),
            top: pct(Math.min(band.y0, band.y1), PAGE.h),
            width: pct(Math.abs(band.x1 - band.x0), width),
            height: pct(Math.abs(band.y1 - band.y0), PAGE.h),
          }}
        />
      )}
      {barStyle && (
        <div className="absolute z-10 w-max max-w-[calc(100vw-1rem)]" style={barStyle}
          onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {bar}
        </div>
      )}
    </div>
  );
}

/* ---------- toolbars ---------- */

const ICONS: Record<string, ReactNode> = {
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="m21 21-5-5M8 11h6" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="m21 21-5-5M8 11h6M11 8v6" /></>,
  rotL: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /></>,
  rotR: <><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></>,
  swap: <path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />,
  star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2 1.2-6.8-5-4.9 6.9-1z" />,
  full: <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />,
  border: <><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7.5" y="7.5" width="9" height="9" rx="1" /></>,
  front: <><rect x="3" y="3" width="12" height="12" rx="1.5" /><rect x="9" y="9" width="12" height="12" rx="1.5" fill="currentColor" /></>,
  back: <><rect x="9" y="9" width="12" height="12" rx="1.5" /><rect x="3" y="3" width="12" height="12" rx="1.5" fill="currentColor" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  shape: <path d="M5 4l13 3 3 11-12 3-6-9z" />,
  page: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M4 15l5-5 4 4 2-2 5 5" /></>,
  note: <><path d="M5 3h10l4 4v14H5z" /><path d="M14 3v5h5M8.5 12h7M8.5 16h5" /></>,
  trash: <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  magnet: <path d="m6 15-4-4 6.8-6.8a7.8 7.8 0 0 1 11 11L13 22l-4-4 6.4-6.4a2.1 2.1 0 0 0-3-3L6 15M5 8l4 4M12 15l4 4" />,
  text: <path d="M4 7V4h16v3M9 20h6M12 4v16" />,
  addText: <path d="M3 6V4h12v2M7 16h4M9 4v12M17 14v6M14 17h6" />,
  smaller: <path d="M3 18 8 6l5 12M4.7 14h6.6M16 12h6" />,
  bigger: <path d="M3 18 8 6l5 12M4.7 14h6.6M16 12h6M19 9v6" />,
  alignleft: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  aligncenter: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  alignright: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  color: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></>,
  resetPage: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M9 14a3 3 0 1 0 1-2.2L9 13M9 10v3h3" /></>,
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** An icon button; its label shows on hover (and is its accessible name). */
export function IconBtn({ icon, label, onClick, active, disabled, danger }: { icon: keyof typeof ICONS; label: string; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}
      className={`group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-35 ${active ? "bg-ink text-page" : danger ? "text-[#d92d20] hover:bg-[#d92d20]/10" : "hover:bg-page"}`}>
      <Icon name={icon} />
      <span className="pointer-events-none absolute top-full left-1/2 z-30 mt-1.5 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-page opacity-0 shadow transition-opacity delay-200 group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:hidden">
        {label}
      </span>
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-6 w-px shrink-0 bg-hair" />;

/** Caption text: saved on Enter (shift+Enter for a new line), when it loses focus, and when the
 * selection goes away (the bar unmounts before a blur would fire). Escape undoes the typing. */
function TextArea({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const latest = useRef({ draft, value, onCommit });
  useEffect(() => {
    latest.current = { draft, value, onCommit };
  });
  useEffect(
    () => () => {
      const { draft: d, value: v, onCommit: save } = latest.current;
      if (d !== v) save(d);
    },
    [],
  );
  const commit = () => {
    if (draft === value) return;
    latest.current.value = draft; // don't save it again on unmount
    onCommit(draft);
  };
  return (
    <textarea value={draft} aria-label="Tekst" placeholder="Tekst" rows={Math.min(4, Math.max(1, draft.split("\n").length))}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") setDraft(value);
      }}
      className="min-h-9 w-40 min-w-0 resize-y rounded-lg border border-hair bg-page px-2 py-1.5 text-sm leading-snug" />
  );
}

/** A text field that commits on Enter or when it loses focus (one undo step per change). */
function TextField({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  const latest = useRef({ draft, value, onCommit });
  useEffect(() => {
    latest.current = { draft, value, onCommit };
  });
  useEffect(
    () => () => {
      const { draft: d, value: v, onCommit: save } = latest.current;
      if (d !== v) save(d);
    },
    [],
  );
  const commit = () => {
    if (draft === value) return;
    latest.current.value = draft;
    onCommit(draft);
  };
  return (
    <input value={draft} aria-label={label} placeholder={label} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(value);
      }}
      className="h-9 w-48 min-w-0 rounded-lg border border-hair bg-page px-2 text-sm" />
  );
}

const BORDERS: { label: string; border: ElementEdit["border"] }[] = [
  { label: "Geen rand", border: null },
  { label: "Wit, dun", border: { w: 1.5, color: "#fff" } },
  { label: "Wit, dik", border: { w: 3, color: "#fff" } },
  { label: "Zwart, dun", border: { w: 0.8, color: "#161513" } },
  { label: "Zwart, dik", border: { w: 2, color: "#161513" } },
];

export interface BarActions {
  apply: (f: (i: Item) => ElementEdit | null) => void;
  onSwap: () => void;
  onPick: () => void;
  pickedHere: boolean;
  onFront: () => void;
  onBack: () => void;
  /** Colours that suit the page (from its photos). */
  tones: string[];
  onNote: () => void;
}

const SWATCHES = ["#ffffff", "#161513", "#f6f4ef", "#e9e2d0", "#f2c94c", "#f4a6a6", "#a8d5ba", "#9cc3e6", "#c3aed6", "#e07a5f"];

/** Swatches, the page's own tones, any colour, and (for text) "automatisch contrast". */
export function ColorChoice({ value, onChange, tones, auto }: { value: string; onChange: (c: string) => void; tones: string[]; auto?: boolean }) {
  const sw = (c: string) => (
    <button key={c} type="button" aria-label={c} title={c} onClick={() => onChange(c)}
      className={`h-7 w-7 rounded-full border shadow-sm ${value.toLowerCase() === c.toLowerCase() ? "ring-2 ring-accent ring-offset-1" : "border-hair"}`}
      style={{ background: c }} />
  );
  return (
    <div className="space-y-2">
      {auto && (
        <button type="button" onClick={() => onChange("auto")}
          className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm ${value === "auto" ? "border-accent bg-accent/10" : "border-hair hover:bg-page"}`}>
          <span className="h-5 w-5 rounded-full border border-hair" style={{ background: "linear-gradient(90deg,#fff 50%,#161513 50%)" }} />
          Automatisch contrast
        </button>
      )}
      <div className="flex flex-wrap gap-1.5">{SWATCHES.map(sw)}</div>
      {tones.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] text-muted">Uit de foto's</div>
          <div className="flex flex-wrap gap-1.5">{tones.map(sw)}</div>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="color" value={value.startsWith("#") && value.length === 7 ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-hair bg-transparent" />
        Andere kleur
      </label>
    </div>
  );
}

/** The white veil over a background photo: drag, committed on release (one undo step). */
function VeilSlider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="flex items-center gap-1.5 px-1.5 text-xs text-ink-2" title="Lichte sluier over de achtergrondfoto">
      Sluier
      <input type="range" min={0} max={0.8} step={0.05} value={draft} className="w-24"
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => draft !== value && onCommit(draft)}
        onKeyUp={() => draft !== value && onCommit(draft)} />
      <span className="w-8 tabular-nums">{Math.round(draft * 100)}%</span>
    </label>
  );
}

/** Floats next to the selection; what it offers depends on what is selected. */
export function SelectionBar({ selected, a, dock = false }: { selected: Item[]; a: BarActions; dock?: boolean }) {
  const [menu, setMenu] = useState<"border" | "color" | null>(null);
  const one = selected.length === 1 ? selected[0] : null;
  const kinds = new Set(selected.map((i) => i.kind));
  const every = (...ks: Kind[]) => [...kinds].every((k) => ks.includes(k));
  const zoom = (d: number) => a.apply((i) => (i.el.type === "photo" || i.el.type === "month" ? { zoom: clamp((i.el.zoom ?? 1) + d, 1, 4) } : {}));
  const rot = (d: number) => a.apply((i) => (i.el.type === "photo" ? { rot: Math.round(((i.el.rot ?? 0) + d) * 10) / 10 } : {}));
  const B = PAGE.bleed;
  const isFull = (i: Item) => i.box.x <= -B + 0.1 && i.box.y <= -B + 0.1 && i.box.w >= PAGE.w + 2 * B - 0.1 && i.box.h >= PAGE.h + 2 * B - 0.1;
  const caption = one?.el.type === "caption" ? one.el : null;
  const month = one?.el.type === "month" ? one.el : null;
  const fillEl = one?.el.type === "fill" ? one.el : null;
  const framed = every("photo");
  // a photo frame given its own outline (not the cover's shards) keeps its border options
  const reshaped = (i: Item) => i.kind === "shape" && !i.page.cover && i.el.type === "photo" && i.el.shape?.kind === "poly";
  const bordered = framed || selected.every(reshaped);
  const colour = caption ? (caption.color ?? "#fff") : fillEl?.color;
  const pictured = every("photo", "shape", "bg", "month", "cell");
  return (
    <div className={dock ? "flex items-center gap-0.5" : "relative flex flex-nowrap items-center justify-center gap-0.5 rounded-xl border border-hair bg-surface p-1 text-ink shadow-lg"}>
      {!one && <span className="px-1.5 text-xs whitespace-nowrap text-muted">{selected.length} geselecteerd</span>}
      {one && photoOf(one) && <span className="px-1.5 font-mono text-xs text-muted select-all" title="Fotonummer">{photoOf(one)}</span>}
      {caption && (
        <>
          <TextArea key={one!.sel + caption.text} value={caption.text} onCommit={(text) => a.apply(() => ({ text }))} />
          <IconBtn icon="smaller" label="Kleinere tekst" onClick={() => a.apply(() => ({ size: Math.max(2, (caption.size ?? 3.53) / 1.15) }))} />
          <IconBtn icon="bigger" label="Grotere tekst" onClick={() => a.apply(() => ({ size: Math.min(40, (caption.size ?? 3.53) * 1.15) }))} />
          <IconBtn icon={`align${caption.align ?? "left"}`} label={{ left: "Links uitgelijnd", center: "Gecentreerd", right: "Rechts uitgelijnd" }[caption.align ?? "left"]}
            onClick={() => a.apply(() => ({ align: ({ left: "center", center: "right", right: "left" } as const)[caption.align ?? "left"] }))} />
        </>
      )}
      {colour !== undefined && (
        <button type="button" aria-label={caption ? "Tekstkleur" : "Kleur"} title={caption ? "Tekstkleur" : "Kleur"} onClick={() => setMenu(menu === "color" ? null : "color")}
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${menu === "color" ? "bg-page" : "hover:bg-page"}`}>
          <span className="h-5 w-5 rounded-full border border-hair shadow-sm"
            style={{ background: colour === "auto" ? "linear-gradient(90deg,#fff 50%,#161513 50%)" : colour }} />
        </button>
      )}
      {(caption || fillEl) && <Sep />}
      {month && (
        <>
          <TextField key={one!.sel + month.name} value={month.name} label="Maand" onCommit={(text) => a.apply(() => ({ text }))} />
          <Sep />
        </>
      )}
      {one?.kind === "bg" && one.el.type === "photo" && (
        <>
          <VeilSlider key={one.sel} value={one.el.veil ?? BG_VEIL} onCommit={(veil) => a.apply(() => ({ veil }))} />
          <Sep />
        </>
      )}
      {one && pictured && <IconBtn icon="swap" label="Andere foto kiezen" onClick={a.onSwap} />}
      {pictured && (
        <>
          <IconBtn icon="zoomOut" label="Uitzoomen" onClick={() => zoom(-0.15)} />
          <IconBtn icon="zoomIn" label="Inzoomen" onClick={() => zoom(0.15)} />
        </>
      )}
      {(kinds.has("photo") || kinds.has("shape")) && !kinds.has("cell") && (
        <>
          <IconBtn icon="rotL" label="Draai linksom" onClick={() => rot(-3)} />
          <IconBtn icon="rotR" label="Draai rechtsom" onClick={() => rot(3)} />
        </>
      )}
      {one && !one.page.cover && (one.kind === "photo" || (one.kind === "shape" && one.el.type === "photo" && one.el.shape?.kind === "poly")) && (
        <IconBtn icon="shape" label={one.kind === "shape" ? "Terug naar een rechthoek" : "Vorm: sleep de hoeken, + voor een extra punt"} active={one.kind === "shape"}
          onClick={() => a.apply((i) => (i.kind === "shape" ? { pts: undefined } : { pts: [[i.box.x, i.box.y], [i.box.x + i.box.w, i.box.y], [i.box.x + i.box.w, i.box.y + i.box.h], [i.box.x, i.box.y + i.box.h]], rot: 0 }))} />
      )}
      {one?.kind === "photo" && !one.page.cover && <IconBtn icon="star" label="Grote foto van deze gebeurtenis" active={a.pickedHere} onClick={a.onPick} />}
      {framed && (
        <>
          <IconBtn icon="full" label={selected.every(isFull) ? "Terug naar het kader" : "Volledige pagina (tot in de afloop)"} active={selected.every(isFull)}
            onClick={() => {
              const back = selected.every(isFull);
              a.apply(() => (back ? { x: undefined, y: undefined, w: undefined, h: undefined } : { x: -B, y: -B, w: PAGE.w + 2 * B, h: PAGE.h + 2 * B, rot: 0 }));
            }} />
        </>
      )}
      {bordered && <IconBtn icon="border" label="Rand" active={menu === "border"} onClick={() => setMenu(menu === "border" ? null : "border")} />}
      {!kinds.has("bg") && !kinds.has("cell") && !kinds.has("page") && (
        <>
          <IconBtn icon="front" label="Naar voren" onClick={a.onFront} />
          <IconBtn icon="back" label="Naar achteren" onClick={a.onBack} />
        </>
      )}
      <Sep />
      {one && <IconBtn icon="note" label="Notitie (voor jezelf of de agent)" onClick={a.onNote} />}
      <IconBtn icon="reset" label="Terug naar het voorstel" onClick={() => a.apply(() => null)} />
      {!every("shape", "cell") && <IconBtn icon="trash" danger label="Verwijderen (Delete)" onClick={() => a.apply(() => ({ hidden: true }))} />}
      {menu === "border" && bordered && (
        <div className={dock ? "fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] z-40 rounded-2xl border border-hair bg-surface p-3 shadow-xl" : "absolute top-full right-0 z-20 mt-1.5 w-40 rounded-xl border border-hair bg-surface p-1 shadow-lg"}>
          {BORDERS.map((b) => (
            <button key={b.label} type="button" onClick={() => { a.apply(() => ({ border: b.border })); setMenu(null); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-page">
              <span className="h-4 w-4 rounded-sm bg-muted/40" style={{ outline: b.border ? `${Math.max(1, b.border.w)}px solid ${b.border.color}` : "1px dashed var(--color-hair)", outlineOffset: 0 }} />
              {b.label}
            </button>
          ))}
        </div>
      )}
      {menu === "color" && colour !== undefined && (
        <div className={dock ? "fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] z-40 rounded-2xl border border-hair bg-surface p-3 shadow-xl" : "absolute top-full left-0 z-20 mt-1.5 w-64 rounded-xl border border-hair bg-surface p-3 shadow-lg"}>
          <ColorChoice value={colour} tones={a.tones} auto={!!caption} onChange={(color) => a.apply(() => ({ color }))} />
        </div>
      )}
    </div>
  );
}

/** Below the book: history, snapping, add text, reset, save status. */
export function EditBar({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  snap,
  onSnap,
  onAddText,
  onPage,
  saving,
  onResetPages,
  notes,
  onNotes,
}: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  snap: boolean;
  onSnap: (on: boolean) => void;
  onAddText: () => void;
  onPage: () => void;
  saving: SaveStatus;
  onResetPages: () => void;
  /** Open notes in this book. */
  notes: number;
  onNotes: () => void;
}) {
  return (
    <div data-keep-selection className="sticky bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-20 mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-2xl border border-hair bg-surface p-1.5 shadow-lg md:bottom-4">
      <IconBtn icon="undo" label="Ongedaan maken (ctrl+Z)" onClick={onUndo} disabled={!canUndo} />
      <IconBtn icon="redo" label="Opnieuw (ctrl+Y)" onClick={onRedo} disabled={!canRedo} />
      <Sep />
      <IconBtn icon="magnet" label={snap ? "Snappen staat aan (Alt = even uit)" : "Snappen staat uit"} active={snap} onClick={() => onSnap(!snap)} />
      <IconBtn icon="page" label="Pagina bewerken (achtergrond, vorm, indeling)" onClick={onPage} />
      <IconBtn icon="addText" label="Tekst toevoegen" onClick={onAddText} />
      <IconBtn icon="resetPage" label="Alle wijzigingen op deze pagina's terugdraaien" onClick={onResetPages} />
      <span className="relative">
        <IconBtn icon="note" label="Notities" onClick={onNotes} />
        {notes > 0 && (
          <span className="pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f2c94c] px-1 text-[10px] font-bold text-[#161513]">{notes}</span>
        )}
      </span>
      <Sep />
      <span role="status" aria-live="polite" title={saving === "saved" ? "Alles opgeslagen" : saving === "pending" ? "Opslaan…" : "Opslaan mislukt, wordt opnieuw geprobeerd"}
        className="flex h-9 w-9 shrink-0 items-center justify-center">
        <span className="sr-only">{saving === "saved" ? "Alles opgeslagen" : saving === "pending" ? "Opslaan" : "Opslaan mislukt"}</span>
        {saving === "pending" ? (
          <span className="flex gap-0.5" aria-hidden="true">
            {[0, 1, 2].map((k) => <span key={k} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${k * 120}ms` }} />)}
          </span>
        ) : saving === "saved" ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2f9e44" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#d92d20] text-xs font-bold text-white" aria-hidden="true">!</span>
        )}
      </span>
    </div>
  );
}
