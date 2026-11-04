// The editor on top of a rendered spread: select (click, shift-click, drag a box), move frames
// (several at once), resize with the corner handles, move the photo inside its frame, zoom,
// rotate, swap, hide, reset. Changes are previewed live and committed on release.
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { thumbUrl } from "@/lib/data";
import { updateElement, type Edits } from "@/lib/edits";
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

export type EditMode = "move" | "pan";

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

type Drag =
  | { mode: "move"; x: number; y: number; targets: Item[]; base: Edits; moved: boolean }
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
  mode,
  onPreview,
  onCommit,
}: {
  items: Item[];
  width: number;
  photos: Photos;
  edits: Edits;
  selection: Set<string>;
  onSelect: (s: Set<string>) => void;
  mode: EditMode;
  onPreview: (e: Edits | null) => void;
  onCommit: (e: Edits) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const preview = useRef<Edits | null>(null);
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const toMm = (e: { clientX: number; clientY: number }) => {
    const r = root.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * PAGE.h };
  };
  const byId = new Map(items.map((i) => [i.sel, i]));

  const down = (e: ReactPointerEvent) => {
    const p = toMm(e);
    const handle = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-sel]");
    root.current!.setPointerCapture(e.pointerId);
    if (handle && hit) {
      const target = byId.get(hit.dataset.sel!)!;
      drag.current = { mode: "resize", ...p, target, corner: handle.dataset.handle!, base: edits, moved: false };
      return;
    }
    if (hit) {
      const sel = hit.dataset.sel!;
      if (e.shiftKey) {
        const next = new Set(selection);
        if (next.has(sel)) next.delete(sel);
        else next.add(sel);
        onSelect(next);
        return;
      }
      const group = selection.has(sel) ? items.filter((i) => selection.has(i.sel)) : [byId.get(sel)!];
      if (!selection.has(sel)) onSelect(new Set([sel]));
      drag.current = mode === "pan" && group.length === 1
        ? { mode: "pan", ...p, target: group[0], base: edits, moved: false }
        : { mode: "move", ...p, targets: group, base: edits, moved: false };
      return;
    }
    drag.current = { mode: "band", ...p, moved: false, additive: e.shiftKey };
    if (!e.shiftKey) onSelect(new Set());
  };

  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toMm(e);
    const dx = p.x - d.x, dy = p.y - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.6) d.moved = true;
    if (!d.moved) return;
    let next: Edits | null = null;
    if (d.mode === "move") {
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
      const { el } = d.target;
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
    if (next) {
      preview.current = next;
      onPreview(next);
    }
  };

  const up = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    root.current?.releasePointerCapture(e.pointerId);
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
    if (d.moved && preview.current) onCommit(preview.current);
    preview.current = null;
    onPreview(null);
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const single = selection.size === 1;
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
            className={`absolute ${on ? "outline-2 outline-accent" : "outline-1 outline-white/0 hover:outline-white/70"} ${mode === "pan" && on ? "cursor-grab" : "cursor-move"}`}
            style={{
              left: pct(i.dx + i.el.x, width),
              top: pct(i.el.y, PAGE.h),
              width: pct(i.el.w, width),
              height: pct(i.el.h, PAGE.h),
              transform: i.el.rot ? `rotate(${i.el.rot}deg)` : undefined,
              boxShadow: on ? "0 0 0 1px rgb(255 255 255 / 0.8)" : undefined,
            }}
          >
            {on && single &&
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
          </div>
        );
      })}
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
    </div>
  );
}

function Btn({ onClick, children, active, disabled, title }: { onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className={`min-h-9 rounded-lg px-2.5 text-sm font-medium disabled:opacity-35 ${active ? "bg-ink text-page" : "hover:bg-page"}`}>
      {children}
    </button>
  );
}

export function EditorToolbar({
  selected,
  mode,
  onMode,
  apply,
  onSwap,
  onPick,
  pickedHere,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onResetPages,
  onDone,
}: {
  selected: Item[];
  mode: EditMode;
  onMode: (m: EditMode) => void;
  apply: (f: (i: Item) => Parameters<typeof updateElement>[3]) => void;
  onSwap: () => void;
  onPick: () => void;
  pickedHere: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onResetPages: () => void;
  onDone: () => void;
}) {
  const n = selected.length;
  const zoom = (d: number) => apply((i) => ({ zoom: clamp((i.el.zoom ?? 1) + d, 1, 4) }));
  const rot = (d: number) => apply((i) => ({ rot: Math.round(((i.el.rot ?? 0) + d) * 10) / 10 }));
  return (
    <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-20 mx-auto mt-3 flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-hair bg-surface p-1.5 shadow-lg md:bottom-4">
      <Btn onClick={onUndo} disabled={!canUndo} title="Ongedaan maken (ctrl+Z)">↶</Btn>
      <Btn onClick={onRedo} disabled={!canRedo} title="Opnieuw (ctrl+Y)">↷</Btn>
      <span className="mx-1 h-6 w-px bg-hair" />
      {n === 0 ? (
        <span className="px-2 text-sm text-muted">Klik een foto, shift-klik of sleep een vak om er meer te kiezen.</span>
      ) : (
        <>
          <span className="px-1 text-xs text-muted">{n} geselecteerd</span>
          <Btn onClick={() => onMode("move")} active={mode === "move"} title="Kader verplaatsen (pijltjes, shift = 5 mm)">✥ Kader</Btn>
          <Btn onClick={() => onMode("pan")} active={mode === "pan"} disabled={n !== 1} title="Foto binnen het kader verschuiven">✋ Foto</Btn>
          <Btn onClick={() => zoom(-0.15)} title="Uitzoomen">−</Btn>
          <Btn onClick={() => zoom(0.15)} title="Inzoomen">＋</Btn>
          <Btn onClick={() => rot(-3)} title="Draai linksom">↺</Btn>
          <Btn onClick={() => rot(3)} title="Draai rechtsom">↻</Btn>
          <Btn onClick={onSwap} disabled={n !== 1} title="Wissel de foto">⇄ Wissel</Btn>
          <Btn onClick={onPick} disabled={n !== 1} active={pickedHere} title="Grote foto van deze gebeurtenis">★</Btn>
          <Btn onClick={() => apply(() => ({ hidden: true }))} title="Van de pagina halen (Delete)">Verberg</Btn>
          <Btn onClick={() => apply(() => null)} title="Terug naar het voorstel">Herstel</Btn>
        </>
      )}
      <span className="mx-1 h-6 w-px bg-hair" />
      <Btn onClick={onResetPages} title="Alle wijzigingen op deze pagina's terugdraaien">Herstel pagina</Btn>
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
