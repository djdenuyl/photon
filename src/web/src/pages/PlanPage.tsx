// The rough plan: events per month, themes, open questions (answered in place), WhatsApp duplicates.
import { useMemo, useRef, useState } from "react";
import { PhotoSheet } from "@/components/PhotoSheet";
import { thumbUrl, useSaveState, useStateMap, useYearData, type YearData } from "@/lib/data";
import { CATEGORY_LABELS, MONTHS, fmtDate, fmtRange, num } from "@/lib/format";
import type { Photo, PlanEvent } from "@/lib/types";

type Open = { photo: Photo; event: PlanEvent | null } | null;

function Thumb({ photo, big, picked, onOpen }: { photo: Photo; big?: boolean; picked?: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} title={`${photo.id} · ${fmtDate(photo.date)}${photo.time ? " " + photo.time : " · WhatsApp"}`}
      className={`shrink-0 overflow-hidden rounded ${picked ? "ring-3 ring-orange" : big ? "ring-3 ring-accent" : ""}`}>
      <img src={thumbUrl(photo)} alt="" loading="lazy" className={`${big || picked ? "h-24" : "h-16"} w-auto`} />
    </button>
  );
}

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="border-b border-hair py-8 last:border-0">
    <h2 className="mb-4 font-display text-2xl font-semibold md:text-3xl">{title}</h2>
    {children}
  </section>
);

export function PlanPage() {
  const year = useYearData();
  const [open, setOpen] = useState<Open>(null);
  if (year.isPending) return <p className="p-6 text-muted">Laden…</p>;
  if (!year.data) return <p className="p-6 text-muted">Geen gegevens gevonden.</p>;
  return (
    <div className="mx-auto max-w-[1100px] px-4 md:px-6">
      <nav className="sticky top-14 z-20 -mx-4 flex gap-4 overflow-x-auto border-b border-hair bg-page/90 px-4 py-2 text-sm backdrop-blur max-md:top-[52px] md:-mx-6 md:px-6">
        {[["overzicht", "Overzicht"], ["gebeurtenissen", "Gebeurtenissen"], ["themas", "Thema's"], ["vragen", "Vragen"], ["whatsapp", "WhatsApp"]].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="whitespace-nowrap text-ink-2">{l}</a>
        ))}
      </nav>
      <Overview data={year.data} />
      <Events data={year.data} onOpen={setOpen} />
      <Themes data={year.data} onOpen={setOpen} />
      <Questions data={year.data} onOpen={setOpen} />
      <Whatsapp data={year.data} />
      {open && <PhotoSheet photo={open.photo} event={open.event} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Overview({ data }: { data: YearData }) {
  const { plan, index } = data;
  const ev = plan.events;
  const sp = (e: PlanEvent) => Number(e.suggestedSpreads) || 0;
  const total = ev.reduce((n, e) => n + sp(e), 0);
  const half1 = ev.filter((e) => e.start.startsWith("2025") && e.start.slice(5, 7) <= "06").reduce((n, e) => n + sp(e), 0);
  const kept = index.filter((p) => !plan.excluded[p.id]);
  const months = MONTHS.map((m, i) => {
    const list = ev.filter((e) => e.start.startsWith("2025") && +e.start.slice(5, 7) === i + 1);
    return { m, spreads: list.reduce((n, e) => n + sp(e), 0), photos: list.reduce((n, e) => n + e.photoIds.length, 0) };
  });
  const max = Math.max(...months.map((m) => m.spreads), 1);
  const stats: [string, string][] = [
    [String(kept.length), "foto's"],
    [String(kept.filter((p) => p.whatsapp).length), "van WhatsApp"],
    [String(ev.length), "gebeurtenissen"],
    [num(total), "spreads voorgesteld"],
    [`${num(half1)} + ${num(total - half1)}`, "deel 1 + deel 2"],
  ];
  return (
    <Section id="overzicht" title="Overzicht">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map(([b, l]) => (
          <div key={l} className="rounded-xl border border-hair bg-surface p-3">
            <div className="font-display text-2xl font-semibold">{b}</div>
            <div className="text-xs text-ink-2">{l}</div>
          </div>
        ))}
      </div>
      <h3 className="mt-6 mb-2 font-display text-lg font-semibold">Spreads per maand</h3>
      <div className="grid gap-1.5">
        {months.map((m) => (
          <div key={m.m} className="grid grid-cols-[84px_1fr_40px] items-center gap-3 text-sm" title={`${m.photos} foto's`}>
            <span className="text-ink-2 capitalize">{m.m}</span>
            <span className="h-3"><span className="block h-3 rounded-r bg-accent" style={{ width: `${(m.spreads / max) * 100}%` }} /></span>
            <span className="text-right tabular-nums">{num(m.spreads)}</span>
          </div>
        ))}
      </div>
      <h3 className="mt-6 mb-2 font-display text-lg font-semibold">Tradities</h3>
      <div className="flex flex-wrap gap-1.5">
        {plan.traditions.map((t) => (
          <span key={t.name} className={`rounded-full px-3 py-1 text-xs ${t.events ? "bg-ink text-page" : "border border-hair text-ink-2"}`}>
            {t.events ? "✓" : "○"} {t.name}
          </span>
        ))}
      </div>
    </Section>
  );
}

function Events({ data, onOpen }: { data: YearData; onOpen: (o: Open) => void }) {
  const picks = useStateMap("picks").data ?? {};
  const [cat, setCat] = useState<string | null>(null);
  const cats = useMemo(() => [...new Set(data.plan.events.map((e) => e.category))], [data]);
  const list = data.plan.events.filter((e) => !cat || e.category === cat);
  // a month heading above the first event of each month
  const firstOfMonth = new Set(list.filter((e, i) => i === 0 || list[i - 1].start.slice(0, 7) !== e.start.slice(0, 7)).map((e) => e.id));
  return (
    <Section id="gebeurtenissen" title="Gebeurtenissen">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {cats.map((c) => (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}
            className={`rounded-full border px-3 py-1 text-xs ${cat === c ? "border-ink bg-ink text-page" : "border-hair bg-surface text-ink-2"}`}>
            {CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
      </div>
      {list.map((e) => {
        const m = e.start.slice(0, 7);
        const head = firstOfMonth.has(e.id) ? <h3 className="mt-6 mb-2 font-display text-lg font-semibold capitalize">{MONTHS[+m.slice(5) - 1]} {m.startsWith("2025") ? "" : m.slice(0, 4)}</h3> : null;
        const heroes = new Set(e.heroCandidates);
        const ids = [...e.heroCandidates, ...e.photoIds.filter((id) => !heroes.has(id))];
        return (
          <div key={e.id}>
            {head}
            <article className="mb-2 rounded-xl border border-hair bg-surface p-3 md:p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div><b>{e.title}</b> <span className="text-xs text-muted">{fmtRange(e.start, e.end)} · {e.photoIds.length} foto's</span></div>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  <span className="rounded-full border border-hair px-2">{CATEGORY_LABELS[e.category] ?? e.category}</span>
                  {e.tradition && <span className="rounded-full bg-ink px-2 text-page">{e.tradition}</span>}
                  <span className="rounded-full border border-hair px-2">{num(e.suggestedSpreads)} spread</span>
                </div>
              </div>
              <p className="my-2 text-sm text-ink-2">{e.summary}{e.notes ? <span className="text-muted"> {e.notes}</span> : null}</p>
              <div className="flex flex-wrap gap-1">
                {ids.map((id) => {
                  const p = data.photos.get(id);
                  return p ? <Thumb key={id} photo={p} big={heroes.has(id)} picked={picks[e.id] === id} onOpen={() => onOpen({ photo: p, event: e })} /> : null;
                })}
              </div>
            </article>
          </div>
        );
      })}
    </Section>
  );
}

function Themes({ data, onOpen }: { data: YearData; onOpen: (o: Open) => void }) {
  return (
    <Section id="themas" title="Thema's">
      <p className="mb-4 max-w-2xl text-sm text-ink-2">Groepen die niet per se chronologisch zijn: ideeën voor themaspreads.</p>
      {data.plan.themes.map((t, i) => (
        <article key={i} className="mb-2 rounded-xl border border-hair bg-surface p-3 md:p-4">
          <b>{t.title}</b> <span className="text-xs text-muted">{t.photoIds.length} foto's</span>
          <p className="my-2 text-sm text-ink-2">{t.idea}</p>
          <div className="flex flex-wrap gap-1">
            {t.photoIds.map((id) => {
              const p = data.photos.get(id);
              return p ? <Thumb key={id} photo={p} onOpen={() => onOpen({ photo: p, event: null })} /> : null;
            })}
          </div>
        </article>
      ))}
    </Section>
  );
}

function Questions({ data, onOpen }: { data: YearData; onOpen: (o: Open) => void }) {
  const remote = useStateMap("answers").data;
  const save = useSaveState("answers");
  // local edits on top of the saved answers, so typing never waits for the server
  const [draft, setDraft] = useState<Record<string, string>>({});
  const answers = { ...remote, ...draft };
  const [status, setStatus] = useState<Record<string, string>>({});
  const timer = useRef<number | undefined>(undefined);
  const qs = data.plan.questions;
  const done = qs.filter((q) => answers[q.id]?.trim()).length;
  const change = (id: string, value: string) => {
    const next = { ...answers, [id]: value };
    setDraft((d) => ({ ...d, [id]: value }));
    setStatus((s) => ({ ...s, [id]: "…" }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      save.mutate(next, {
        onSuccess: () => setStatus((s) => ({ ...s, [id]: "opgeslagen ✓" })),
        onError: () => setStatus((s) => ({ ...s, [id]: "niet opgeslagen" })),
      });
    }, 600);
  };
  return (
    <Section id="vragen" title="Open vragen">
      <p className="mb-4 text-sm text-ink-2">{done} van {qs.length} beantwoord. Antwoorden worden meteen opgeslagen.</p>
      {qs.map((q, i) => (
        <article key={q.id} className="mb-2 rounded-xl border border-hair bg-surface p-3 md:p-4">
          <div className="text-sm"><b>{i + 1}.</b> {q.question}</div>
          <div className="my-2 flex flex-wrap gap-1">
            {q.photoIds.map((id) => {
              const p = data.photos.get(id);
              return p ? <Thumb key={id} photo={p} onOpen={() => onOpen({ photo: p, event: null })} /> : null;
            })}
          </div>
          <textarea rows={2} value={answers[q.id] ?? ""} onChange={(e) => change(q.id, e.target.value)} placeholder="Jouw antwoord…"
            className="w-full rounded-lg border border-hair bg-page px-3 py-2 text-sm" />
          <span className="text-xs text-muted">{status[q.id] ?? ""}</span>
        </article>
      ))}
    </Section>
  );
}

function Whatsapp({ data }: { data: YearData }) {
  const byFile = new Map(data.index.map((p) => [p.file, p]));
  const src = (file: string) => {
    const p = byFile.get(file);
    return p ? thumbUrl(p) : `/data/2025/thumbs/${file.replace(/[^\w.-]/g, "_")}.jpg`;
  };
  const groups = [
    ["Dubbel (weggelaten)", data.duplicates.filter((d) => d.verdict === "duplicate")],
    ["Vergelijkbaar (beide gehouden)", data.duplicates.filter((d) => d.verdict === "similar")],
  ] as const;
  return (
    <Section id="whatsapp" title="WhatsApp-foto's">
      {groups.map(([title, list]) => (
        <div key={title} className="mb-6">
          <h3 className="mb-2 font-display text-lg font-semibold">{title} · {list.length}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {list.map((d) => (
              <div key={d.whatsapp} className="grid grid-cols-2 gap-1">
                <img src={src(d.whatsapp)} alt="" loading="lazy" className="aspect-[3/4] w-full rounded object-cover" />
                <img src={src(d.match)} alt="" loading="lazy" className="aspect-[3/4] w-full rounded object-cover" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
}
