// The editor on top of a rendered spread: select (click, shift-click, drag a box), move frames
// (several at once, snapping to guides), resize with the corner handles, move the photo inside its
// frame with the see-through centre handle, and a toolbar that floats next to the selection.
// Changes are previewed live and committed on release.
import { useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { thumbUrl } from "@/lib/data";
import { updateElement, type Edits } from "@/lib/edits";
import type { SaveStatus } from "@/lib/saver";
import { PAGE, placement, type Page, type PhotoElement } from "@/lib/layout";
import type { Photo, Photos, PlanEvent } from "@/lib/types";

export interface Item {
  sel: string;
  key: string;
  slot: string;
  el: PhotoElement;
  dx: number;
  page: Page;
}

const pageKey = (p: Page) => `${p.event.id}:${p.k}`;

/** The editable photos on the visible pages (page backgrounds are left out). */
export function itemsFor(pages: { page: Page | null; dx: number }[]): Item[] {
  return pages.flatMap(({ page, dx }) =>
    page
      ? page.elements
          .filter((e): e is PhotoElement => e.type === "photo" && !e.bg)
          .map((el) => {
            const key = pageKey(page);
            const slot = el.slot ?? el.id;
            return { sel: `${key}|${slot}`, key, slot, el, dx, page };
          })
      : [],
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Snapping: within 2 mm of a page's margins, centre lines and edges, or of another photo's edges,
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
    if (moving.has(i.sel)) continue;
    const l = i.dx + i.el.x, r = l + i.el.w, t = i.el.y, b = t + i.el.h;
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
  /** The photo toolbar, shown above (or below) the selection. */
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
    root.current!.setPointerCapture(e.pointerId);
    if (hit) {
      const target = byId.get(hit.dataset.sel!)!;
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
      const group = selection.has(sel) ? items.filter((i) => selection.has(i.sel)) : [target];
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
      if (snapping) {
        const x0 = Math.min(...d.targets.map((t) => t.dx + t.el.x)) + dx;
        const x1 = Math.max(...d.targets.map((t) => t.dx + t.el.x + t.el.w)) + dx;
        const y0 = Math.min(...d.targets.map((t) => t.el.y)) + dy;
        const y1 = Math.max(...d.targets.map((t) => t.el.y + t.el.h)) + dy;
        take(snap1([x0, x1, (x0 + x1) / 2], lines.current.x), "x");
        take(snap1([y0, y1, (y0 + y1) / 2], lines.current.y), "y");
      }
      next = d.targets.reduce((acc, t) => updateElement(acc, t.key, t.slot, { x: t.el.x + dx, y: t.el.y + dy }), d.base);
    } else if (d.mode === "pan") {
      const { el } = d.target;
      const photo = photos.get(el.id);
      if (!photo) return;
      const img = placement(photo, el, el.zoom ?? 1, el.focus);
      // the focus point that puts the current view in the middle, moved against the drag
      const fx0 = (el.x + el.w / 2 - img.x) / img.w, fy0 = (el.y + el.h / 2 - img.y) / img.h;
      const hx = el.w / 2 / img.w, hy = el.h / 2 / img.h;
      const focus: [number, number] = [clamp(fx0 - dx / img.w, hx, 1 - hx), clamp(fy0 - dy / img.h, hy, 1 - hy)];
      next = updateElement(d.base, d.target.key, d.target.slot, { focus });
    } else if (d.mode === "resize") {
      const { el, dx: off } = d.target;
      if (snapping) {
        take(snap1([off + (d.corner.includes("e") ? el.x + el.w : el.x) + dx], lines.current.x), "x");
        take(snap1([(d.corner.includes("s") ? el.y + el.h : el.y) + dy], lines.current.y), "y");
      }
      let { x, y, w, h } = el;
      if (d.corner.includes("e")) w = Math.max(8, el.w + dx);
      if (d.corner.includes("s")) h = Math.max(8, el.h + dy);
      if (d.corner.includes("w")) {
        w = Math.max(8, el.w - dx);
        x = el.x + el.w - w;
      }
      if (d.corner.includes("n")) {
        h = Math.max(8, el.h - dy);
        y = el.y + el.h - h;
      }
      next = updateElement(d.base, d.target.key, d.target.slot, { x, y, w, h });
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
        const hits = items.filter((i) => i.dx + i.el.x < x1 && i.dx + i.el.x + i.el.w > x0 && i.el.y < y1 && i.el.y + i.el.h > y0);
        onSelect(new Set([...(d.additive ? selection : []), ...hits.map((i) => i.sel)]));
      }
      setBand(null);
      return;
    }
    // a plain click on one photo of a group selects just that photo
    if (d.mode === "move" && !d.moved && d.targets.length > 1) onSelect(new Set([d.sel]));
    if (d.moved && preview.current) onCommit(preview.current);
    preview.current = null;
    onPreview(null);
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const chosen = items.filter((i) => selection.has(i.sel));
  const single = chosen.length === 1;
  let barStyle: CSSProperties | null = null;
  if (chosen.length && !busy && !band) {
    const x0 = Math.min(...chosen.map((i) => i.dx + i.el.x)), x1 = Math.max(...chosen.map((i) => i.dx + i.el.x + i.el.w));
    const y0 = Math.min(...chosen.map((i) => i.el.y)), y1 = Math.max(...chosen.map((i) => i.el.y + i.el.h));
    const above = y0 > 30;
    barStyle = {
      left: pct(clamp((x0 + x1) / 2, width * 0.18, width * 0.82), width),
      top: pct(above ? y0 : Math.min(y1, PAGE.h - 4), PAGE.h),
      transform: `translate(-50%, ${above ? "calc(-100% - 12px)" : "12px"})`,
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
    >
      {items.map((i) => {
        const on = selection.has(i.sel);
        return (
          <div
            key={i.sel}
            data-sel={i.sel}
            className={`absolute cursor-move ${on ? "outline-2 outline-accent" : "outline-1 outline-white/0 hover:outline-white/70"}`}
            style={{
              left: pct(i.dx + i.el.x, width),
              top: pct(i.el.y, PAGE.h),
              width: pct(i.el.w, width),
              height: pct(i.el.h, PAGE.h),
              transform: i.el.rot ? `rotate(${i.el.rot}deg)` : undefined,
              boxShadow: on ? "0 0 0 1px rgb(255 255 255 / 0.8)" : undefined,
            }}
          >
            {on && single && (
              <>
                {["nw", "ne", "sw", "se"].map((c) => (
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
                <span
                  data-handle="pan"
                  title="Sleep om de foto binnen het kader te verschuiven"
                  className="absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white/90 bg-white/25 text-white shadow-md backdrop-blur-[2px] active:cursor-grabbing"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
                  </svg>
                </span>
              </>
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
        <div className="absolute z-10 w-max max-w-[min(30rem,calc(100vw-2rem))]" style={barStyle} onPointerDown={(e) => e.stopPropagation()}>
          {bar}
        </div>
      )}
    </div>
  );
}

function Btn({ onClick, children, active, disabled, title }: { onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className={`min-h-9 min-w-9 rounded-lg px-2 text-sm font-medium disabled:opacity-35 ${active ? "bg-ink text-page" : "hover:bg-page"}`}>
      {children}
    </button>
  );
}

/** Floats next to the selected photo(s). */
export function PhotoBar({
  selected,
  apply,
  onSwap,
  onPick,
  pickedHere,
}: {
  selected: Item[];
  apply: (f: (i: Item) => Parameters<typeof updateElement>[3]) => void;
  onSwap: () => void;
  onPick: () => void;
  pickedHere: boolean;
}) {
  const one = selected.length === 1;
  const zoom = (d: number) => apply((i) => ({ zoom: clamp((i.el.zoom ?? 1) + d, 1, 4) }));
  const rot = (d: number) => apply((i) => ({ rot: Math.round(((i.el.rot ?? 0) + d) * 10) / 10 }));
  return (
    <div className="flex flex-wrap items-center justify-center gap-0.5 rounded-xl border border-hair bg-surface p-1 text-ink shadow-lg">
      {!one && <span className="px-1.5 text-xs text-muted">{selected.length} foto's</span>}
      <Btn onClick={() => zoom(-0.15)} title="Uitzoomen">−</Btn>
      <Btn onClick={() => zoom(0.15)} title="Inzoomen">＋</Btn>
      <Btn onClick={() => rot(-3)} title="Draai linksom">↺</Btn>
      <Btn onClick={() => rot(3)} title="Draai rechtsom">↻</Btn>
      {one && <Btn onClick={onSwap} title="Wissel de foto">⇄ Wissel</Btn>}
      {one && <Btn onClick={onPick} active={pickedHere} title="Grote foto van deze gebeurtenis">★</Btn>}
      <Btn onClick={() => apply(() => null)} title="Terug naar het voorstel">Herstel</Btn>
      <Btn onClick={() => apply(() => ({ hidden: true }))} title="Van de pagina halen (Delete)">Verberg</Btn>
    </div>
  );
}

/** Below the book: history, snapping, save status, reset, done. */
export function EditBar({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  snap,
  onSnap,
  saving,
  onResetPages,
  onDone,
}: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  snap: boolean;
  onSnap: (on: boolean) => void;
  saving: SaveStatus;
  onResetPages: () => void;
  onDone: () => void;
}) {
  return (
    <div data-keep-selection className="sticky bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-20 mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-2xl border border-hair bg-surface p-1.5 shadow-lg md:bottom-4">
      <Btn onClick={onUndo} disabled={!canUndo} title="Ongedaan maken (ctrl+Z)">↶</Btn>
      <Btn onClick={onRedo} disabled={!canRedo} title="Opnieuw (ctrl+Y)">↷</Btn>
      <span className="mx-1 h-6 w-px bg-hair" />
      <Btn onClick={() => onSnap(!snap)} active={snap} title="Uitlijnen op hulplijnen en andere foto's (Alt ingedrukt = tijdelijk uit)">⌗ Snappen</Btn>
      <Btn onClick={onResetPages} title="Alle wijzigingen op deze pagina's terugdraaien">Herstel pagina</Btn>
      <span className={`px-2 text-xs ${saving === "error" ? "text-orange" : "text-muted"}`}>
        {saving === "saved" ? "Opgeslagen" : saving === "pending" ? "Opslaan…" : "Opslaan mislukt, opnieuw…"}
      </span>
      <Btn onClick={onDone} active>Klaar</Btn>
    </div>
  );
}

const FAMILY = ["Anne", "David", "Lou", "Oos"];
type Company = "all" | "us" | "others";
type Scope = "event" | "month" | "year";

/** Swap: choose a photo by people, close-up, scenery, event or month, or search. */
export function PhotoPicker({
  current,
  event,
  photos,
  events,
  placed,
  onPick,
  onClose,
}: {
  current: Photo;
  event: PlanEvent;
  photos: Photos;
  events: PlanEvent[];
  placed: Set<string>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<Set<string>>(new Set());
  const [company, setCompany] = useState<Company>("all");
  const [closeup, setCloseup] = useState(false);
  const [scenic, setScenic] = useState(false);
  const [scope, setScope] = useState<Scope>("event");
  const [query, setQuery] = useState("");
  const eventOf = useMemo(() => {
    const m = new Map<string, PlanEvent>();
    for (const e of events) for (const id of e.photoIds) m.set(id, e);
    return m;
  }, [events]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const month = event.start.slice(0, 7);
    return [...photos.values()].filter((p) => {
      const ev = eventOf.get(p.id);
      if (!ev || p.id === current.id) return false;
      if (scope === "event" && ev.id !== event.id) return false;
      if (scope === "month" && ev.start.slice(0, 7) !== month) return false;
      const l = p.label ?? {};
      for (const f of people) if (!(l.family ?? []).includes(f)) return false;
      if (company === "us" && (l.others ?? 0) > 0) return false;
      if (company === "others" && !(l.others ?? 0)) return false;
      if (closeup && !l.closeup) return false;
      if (scenic && !l.scenic) return false;
      if (q && !`${p.id} ${ev.title} ${ev.summary}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [photos, eventOf, current, event, people, company, closeup, scenic, scope, query]);

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? "border-ink bg-ink text-page" : "border-hair bg-page text-ink-2"}`;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-end md:items-stretch" role="dialog" aria-modal="true" aria-label="Wissel foto">
      <button type="button" aria-label="Sluiten" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="relative flex max-h-[85dvh] w-full flex-col rounded-t-3xl bg-surface md:max-h-none md:w-[440px] md:rounded-none md:border-l md:border-hair">
        <div className="flex items-center gap-3 border-b border-hair p-4">
          <img src={thumbUrl(current)} alt="" className="h-12 w-12 rounded object-cover" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Wissel foto</div>
            <div className="truncate text-xs text-muted">{event.title}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-hair px-3 py-1.5 text-sm">Sluiten</button>
        </div>
        <div className="space-y-2 border-b border-hair p-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek op gebeurtenis of foto-nummer…"
            className="w-full rounded-lg border border-hair bg-page px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-1.5">
            {(["event", "month", "year"] as const).map((s) => (
              <button key={s} type="button" className={chip(scope === s)} onClick={() => setScope(s)}>
                {s === "event" ? "Deze gebeurtenis" : s === "month" ? "Deze maand" : "Heel het jaar"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FAMILY.map((f) => (
              <button key={f} type="button" className={chip(people.has(f))}
                onClick={() => setPeople((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; })}>
                {f}
              </button>
            ))}
            <button type="button" className={chip(company === "us")} onClick={() => setCompany(company === "us" ? "all" : "us")}>alleen wij</button>
            <button type="button" className={chip(company === "others")} onClick={() => setCompany(company === "others" ? "all" : "others")}>met anderen</button>
            <button type="button" className={chip(closeup)} onClick={() => setCloseup(!closeup)}>close-up</button>
            <button type="button" className={chip(scenic)} onClick={() => setScenic(!scenic)}>sfeerbeeld</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-xs text-muted">{results.length} foto's · staat een foto al in het boek, dan ruilen ze van plek</p>
          <div className="grid grid-cols-3 gap-1.5 md:grid-cols-3">
            {results.map((p) => (
              <button key={p.id} type="button" onClick={() => onPick(p.id)} className="relative overflow-hidden rounded" title={`${p.id} · ${eventOf.get(p.id)?.title ?? ""}`}>
                <img src={thumbUrl(p)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                {placed.has(p.id) && <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">in boek</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
