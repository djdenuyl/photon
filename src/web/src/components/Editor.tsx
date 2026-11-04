// The editor on top of a rendered spread: select (click, shift-click, drag a box; double-click the
// background), move (several at once, snapping to guides), resize with the corner handles, move a
// photo inside its frame with the see-through centre handle, and a toolbar that floats next to the
// selection. Changes are previewed live and committed on release.
import { useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { updateElement, type ElementEdit, type Edits } from "@/lib/edits";
import { PAGE, placement, type Box, type Element, type Page } from "@/lib/layout";
import type { SaveStatus } from "@/lib/saver";
import type { Photos } from "@/lib/types";

/** photo: a framed photo; bg: a page background (locked in place); shape: a cover letter or shard. */
export type Kind = "photo" | "bg" | "shape" | "month" | "caption";

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

/** The area a caption's text takes up (an estimate: the text is not measured). */
function captionBox(c: Extract<Element, { type: "caption" }>): Box {
  const size = c.size ?? 3.53;
  const w = Math.max(6, c.text.length * size * (c.font ? 0.78 : 0.56));
  return { x: c.anchor === "end" ? c.x - w : c.x, y: c.y + 0.75 * size, w, h: 1.4 * size };
}

export function itemsFor(pages: { page: Page | null; dx: number }[]): Item[] {
  return pages.flatMap(({ page, dx }) =>
    (page?.elements ?? []).map((el): Item => {
      const key = pageKey(page!);
      const slot = el.slot ?? "";
      const kind: Kind = el.type === "photo" ? (el.bg ? "bg" : el.shape ? "shape" : "photo") : el.type;
      const box = el.type === "caption" ? captionBox(el) : { x: el.x, y: el.y, w: el.w, h: el.h };
      return { sel: `${key}|${slot}`, key, slot, el, kind, box, dx, page: page! };
    }),
  );
}

/** The photo shown in an item (photos, cover parts, month titles). */
export function photoOf(i: Item): string | null {
  return i.el.type === "photo" ? i.el.id || null : i.el.type === "month" ? i.el.photo : null;
}

const rotOf = (i: Item) => (i.el.type === "photo" ? (i.el.rot ?? 0) : 0);

/** The edit for a new box (resize). Captions scale their text with the height. */
function boxEdit(i: Item, b: Box): ElementEdit {
  const el = i.el;
  if (el.type === "caption") {
    const size = (el.size ?? 3.53) * (b.h / i.box.h);
    return { size, x: el.anchor === "end" ? b.x + b.w : b.x, y: b.y - 0.75 * size };
  }
  return { x: b.x, y: b.y, w: b.w, h: b.h };
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

  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = root.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * PAGE.h };
  };
  const byId = new Map(items.map((i) => [i.sel, i]));

  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const p = toMm(e);
    const t = e.target as HTMLElement;
    const handle = t.closest<HTMLElement>("[data-handle]");
    const hit = t.closest<HTMLElement>("[data-sel]");
    const target = hit ? byId.get(hit.dataset.sel!) : undefined;
    root.current!.setPointerCapture(e.pointerId);
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
      const group = selection.has(sel) ? items.filter((i) => selection.has(i.sel) && i.kind !== "bg") : [target];
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
      next = d.targets.reduce((acc, t) => updateElement(acc, t.key, t.slot, { x: t.el.x + dx, y: t.el.y + dy }), d.base);
    } else if (d.mode === "pan") {
      const { el } = d.target;
      const id = photoOf(d.target);
      const photo = id ? photos.get(id) : undefined;
      if (!photo || el.type === "caption") return;
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
        take(snap1([off + (c.includes("e") ? box.x + box.w : box.x) + dx], lines.current.x), "x");
        take(snap1([(c.includes("s") ? box.y + box.h : box.y) + dy], lines.current.y), "y");
      }
      let { x, y, w, h } = box;
      if (c.includes("e")) w = Math.max(8, box.w + dx);
      if (c.includes("s")) h = Math.max(d.target.kind === "caption" ? 2 : 8, box.h + dy);
      if (c.includes("w")) w = Math.max(8, box.w - dx);
      if (c.includes("n")) h = Math.max(d.target.kind === "caption" ? 2 : 8, box.h - dy);
      if (d.target.kind === "caption") w = box.w * (h / box.h); // text keeps its proportions
      if (c.includes("w")) x = box.x + box.w - w;
      if (c.includes("n")) y = box.y + box.h - h;
      next = updateElement(d.base, d.target.key, d.target.slot, boxEdit(d.target, { x, y, w, h }));
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
        const hits = items.filter((i) => i.kind !== "bg" && i.dx + i.box.x < x1 && i.dx + i.box.x + i.box.w > x0 && i.box.y < y1 && i.box.y + i.box.h > y0);
        onSelect(new Set([...(d.additive ? selection : []), ...hits.map((i) => i.sel)]));
      }
      setBand(null);
      return;
    }
    // a plain click on one element of a group selects just that one
    if (d.mode === "move" && !d.moved && selection.size > 1) onSelect(new Set([d.sel]));
    if (d.moved && preview.current) onCommit(preview.current);
    preview.current = null;
    onPreview(null);
  };

  // double-click on a page's background (where no photo is) selects the background
  const dbl = (e: React.MouseEvent) => {
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-sel]");
    if (hit && byId.get(hit.dataset.sel!)?.kind !== "bg") return;
    const p = toMm(e);
    const bg = items.filter((i) => i.kind === "bg" && p.x >= i.dx && p.x < i.dx + PAGE.w).pop();
    if (bg) onSelect(new Set([bg.sel]));
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const chosen = items.filter((i) => selection.has(i.sel));
  const single = chosen.length === 1;
  let barStyle: CSSProperties | null = null;
  if (chosen.length && !busy && !band) {
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
        const bg = i.kind === "bg";
        if (bg && !on) return null;
        const rot = rotOf(i);
        return (
          <div
            key={i.sel}
            data-sel={i.sel}
            className={`absolute ${bg ? "pointer-events-none" : "cursor-move"} ${on ? "outline-2 outline-accent" : `outline-1 hover:outline-white/80 ${i.kind === "caption" ? "outline-dashed outline-white/40" : "outline-white/0"}`}`}
            style={{
              left: pct(i.dx + i.box.x, width),
              top: pct(i.box.y, PAGE.h),
              width: pct(i.box.w, width),
              height: pct(i.box.h, PAGE.h),
              transform: rot ? `rotate(${rot}deg)` : undefined,
              boxShadow: on ? "0 0 0 1px rgb(255 255 255 / 0.8)" : undefined,
            }}
          >
            {on && single && !bg &&
              ["nw", "ne", "sw", "se"].map((c) => (
                <span
                  key={c}
                  data-handle={c}
                  className="absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-accent shadow"
                  style={{
                    left: c.includes("w") ? -7 : undefined,
                    right: c.includes("e") ? -7 : undefined,
                    top: c.includes("n") ? -7 : undefined,
                    bottom: c.includes("s") ? -7 : undefined,
                    cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize",
                  }}
                />
              ))}
            {on && single && photoOf(i) && (
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
        <div className="absolute z-10 w-max max-w-[min(34rem,calc(100vw-2rem))]" style={barStyle}
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
  hide: <path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  magnet: <path d="m6 15-4-4 6.8-6.8a7.8 7.8 0 0 1 11 11L13 22l-4-4 6.4-6.4a2.1 2.1 0 0 0-3-3L6 15M5 8l4 4M12 15l4 4" />,
  text: <path d="M4 7V4h16v3M9 20h6M12 4v16" />,
  addText: <path d="M3 6V4h12v2M7 16h4M9 4v12M17 14v6M14 17h6" />,
  smaller: <path d="M3 18 8 6l5 12M4.7 14h6.6M16 12h6" />,
  bigger: <path d="M3 18 8 6l5 12M4.7 14h6.6M16 12h6M19 9v6" />,
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
export function IconBtn({ icon, label, onClick, active, disabled }: { icon: keyof typeof ICONS; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}
      className={`group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-35 ${active ? "bg-ink text-page" : "hover:bg-page"}`}>
      <Icon name={icon} />
      <span className="pointer-events-none absolute top-full left-1/2 z-30 mt-1.5 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-page opacity-0 shadow transition-opacity delay-200 group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:hidden">
        {label}
      </span>
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-6 w-px shrink-0 bg-hair" />;

/** A text field that commits on Enter or when it loses focus (one undo step per change). */
function TextField({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  const commit = () => draft !== value && onCommit(draft);
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
}

/** Floats next to the selection; what it offers depends on what is selected. */
export function SelectionBar({ selected, a }: { selected: Item[]; a: BarActions }) {
  const [borders, setBorders] = useState(false);
  const one = selected.length === 1 ? selected[0] : null;
  const kinds = new Set(selected.map((i) => i.kind));
  const zoom = (d: number) => a.apply((i) => (i.el.type === "caption" ? {} : { zoom: clamp((i.el.zoom ?? 1) + d, 1, 4) }));
  const rot = (d: number) => a.apply((i) => (i.el.type === "photo" ? { rot: Math.round(((i.el.rot ?? 0) + d) * 10) / 10 } : {}));
  const B = PAGE.bleed;
  const isFull = (i: Item) => i.box.x <= -B + 0.1 && i.box.y <= -B + 0.1 && i.box.w >= PAGE.w + 2 * B - 0.1 && i.box.h >= PAGE.h + 2 * B - 0.1;
  const caption = one?.el.type === "caption" ? one.el : null;
  const month = one?.el.type === "month" ? one.el : null;
  const photoish = [...kinds].every((k) => k === "photo" || k === "shape" || k === "bg" || k === "month");
  const framed = [...kinds].every((k) => k === "photo");
  return (
    <div className="relative flex flex-wrap items-center justify-center gap-0.5 rounded-xl border border-hair bg-surface p-1 text-ink shadow-lg">
      {!one && <span className="px-1.5 text-xs text-muted">{selected.length} geselecteerd</span>}
      {one && photoOf(one) && <span className="px-1.5 font-mono text-xs text-muted select-all" title="Fotonummer">{photoOf(one)}</span>}
      {caption && (
        <>
          <TextField key={one!.sel + caption.text} value={caption.text} label="Tekst" onCommit={(text) => a.apply(() => ({ text }))} />
          <IconBtn icon="smaller" label="Kleinere tekst" onClick={() => a.apply(() => ({ size: Math.max(2, (caption.size ?? 3.53) / 1.15) }))} />
          <IconBtn icon="bigger" label="Grotere tekst" onClick={() => a.apply(() => ({ size: Math.min(40, (caption.size ?? 3.53) * 1.15) }))} />
          <IconBtn icon="color" label={caption.color === "#000" ? "Witte tekst" : "Zwarte tekst"} onClick={() => a.apply(() => ({ color: caption.color === "#000" ? "#fff" : "#000" }))} />
          <Sep />
        </>
      )}
      {month && (
        <>
          <TextField key={one!.sel + month.name} value={month.name} label="Maand" onCommit={(text) => a.apply(() => ({ text }))} />
          <Sep />
        </>
      )}
      {one && one.kind !== "caption" && <IconBtn icon="swap" label="Andere foto kiezen" onClick={a.onSwap} />}
      {photoish && (
        <>
          <IconBtn icon="zoomOut" label="Uitzoomen" onClick={() => zoom(-0.15)} />
          <IconBtn icon="zoomIn" label="Inzoomen" onClick={() => zoom(0.15)} />
        </>
      )}
      {(kinds.has("photo") || kinds.has("shape")) && (
        <>
          <IconBtn icon="rotL" label="Draai linksom" onClick={() => rot(-3)} />
          <IconBtn icon="rotR" label="Draai rechtsom" onClick={() => rot(3)} />
        </>
      )}
      {one?.kind === "photo" && !one.page.cover && <IconBtn icon="star" label="Grote foto van deze gebeurtenis" active={a.pickedHere} onClick={a.onPick} />}
      {framed && (
        <>
          <IconBtn icon="full" label={selected.every(isFull) ? "Terug naar het kader" : "Volledige pagina (tot in de afloop)"} active={selected.every(isFull)}
            onClick={() => {
              const back = selected.every(isFull);
              a.apply(() => (back ? { x: undefined, y: undefined, w: undefined, h: undefined } : { x: -B, y: -B, w: PAGE.w + 2 * B, h: PAGE.h + 2 * B, rot: 0 }));
            }} />
          <IconBtn icon="border" label="Rand" active={borders} onClick={() => setBorders(!borders)} />
        </>
      )}
      {!kinds.has("bg") && (
        <>
          <IconBtn icon="front" label="Naar voren" onClick={a.onFront} />
          <IconBtn icon="back" label="Naar achteren" onClick={a.onBack} />
        </>
      )}
      <Sep />
      <IconBtn icon="reset" label="Terug naar het voorstel" onClick={() => a.apply(() => null)} />
      {![...kinds].every((k) => k === "shape") && <IconBtn icon="hide" label="Van de pagina halen (Delete)" onClick={() => a.apply(() => ({ hidden: true }))} />}
      {borders && framed && (
        <div className="absolute top-full right-0 z-20 mt-1.5 w-40 rounded-xl border border-hair bg-surface p-1 shadow-lg">
          {BORDERS.map((b) => (
            <button key={b.label} type="button" onClick={() => { a.apply(() => ({ border: b.border })); setBorders(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-page">
              <span className="h-4 w-4 rounded-sm bg-muted/40" style={{ outline: b.border ? `${Math.max(1, b.border.w)}px solid ${b.border.color}` : "1px dashed var(--color-hair)", outlineOffset: 0 }} />
              {b.label}
            </button>
          ))}
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
  saving,
  onResetPages,
}: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  snap: boolean;
  onSnap: (on: boolean) => void;
  onAddText: () => void;
  saving: SaveStatus;
  onResetPages: () => void;
}) {
  return (
    <div data-keep-selection className="sticky bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-20 mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-2xl border border-hair bg-surface p-1.5 shadow-lg md:bottom-4">
      <IconBtn icon="undo" label="Ongedaan maken (ctrl+Z)" onClick={onUndo} disabled={!canUndo} />
      <IconBtn icon="redo" label="Opnieuw (ctrl+Y)" onClick={onRedo} disabled={!canRedo} />
      <Sep />
      <IconBtn icon="magnet" label={snap ? "Snappen staat aan (Alt = even uit)" : "Snappen staat uit"} active={snap} onClick={() => onSnap(!snap)} />
      <IconBtn icon="addText" label="Tekst toevoegen" onClick={onAddText} />
      <IconBtn icon="resetPage" label="Alle wijzigingen op deze pagina's terugdraaien" onClick={onResetPages} />
      <Sep />
      <span className={`px-2 text-xs ${saving === "error" ? "text-orange" : "text-muted"}`} aria-live="polite">
        {saving === "saved" ? "Alles opgeslagen" : saving === "pending" ? "Opslaan…" : "Opslaan mislukt, opnieuw…"}
      </span>
    </div>
  );
}
