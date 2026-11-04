// Swap: pick a photo by people, close-up, scenery, event or month, or search.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { thumbUrl } from "@/lib/data";
import type { Photo, Photos, PlanEvent } from "@/lib/types";

const FAMILY = ["Anne", "David", "Lou", "Oos"];
type Company = "all" | "us" | "others";
type Scope = "event" | "month" | "book" | "year";

export function PhotoPicker({
  current,
  event,
  photos,
  events,
  bookEvents,
  initialScope,
  placed,
  onPick,
  onClose,
}: {
  current: Photo | undefined;
  event: PlanEvent;
  photos: Photos;
  events: PlanEvent[];
  /** The events of the book being edited (the "Dit boek" scope). */
  bookEvents: Set<string>;
  initialScope: Scope;
  placed: Set<string>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [people, setPeople] = useState<Set<string>>(new Set());
  const [company, setCompany] = useState<Company>("all");
  const [closeup, setCloseup] = useState(false);
  const [scenic, setScenic] = useState(false);
  const [scope, setScope] = useState<Scope>(initialScope);
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
      if (!ev || p.id === current?.id) return false;
      if (scope === "event" && ev.id !== event.id) return false;
      if (scope === "month" && ev.start.slice(0, 7) !== month) return false;
      if (scope === "book" && !bookEvents.has(ev.id)) return false;
      const l = p.label ?? {};
      for (const f of people) if (!(l.family ?? []).includes(f)) return false;
      if (company === "us" && (l.others ?? 0) > 0) return false;
      if (company === "others" && !(l.others ?? 0)) return false;
      if (closeup && !l.closeup) return false;
      if (scenic && !l.scenic) return false;
      if (q && !`${p.id} ${ev.title} ${ev.summary}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [photos, eventOf, current, event, bookEvents, people, company, closeup, scenic, scope, query]);

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? "border-ink bg-ink text-page" : "border-hair bg-page text-ink-2"}`;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-end md:items-stretch" role="dialog" aria-modal="true" aria-label="Wissel foto">
      <button type="button" aria-label="Sluiten" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="relative flex max-h-[85dvh] w-full flex-col rounded-t-3xl bg-surface md:max-h-none md:w-[440px] md:rounded-none md:border-l md:border-hair">
        <div className="flex items-center gap-3 border-b border-hair p-4">
          {current && <img src={thumbUrl(current)} alt="" className="h-12 w-12 rounded object-cover" />}
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
            {(event.photoIds.length ? (["event", "month", "book", "year"] as const) : (["book", "year"] as const)).map((s) => (
              <button key={s} type="button" className={chip(scope === s)} onClick={() => setScope(s)}>
                {{ event: "Deze gebeurtenis", month: "Deze maand", book: "Dit boek", year: "Heel het jaar" }[s]}
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
