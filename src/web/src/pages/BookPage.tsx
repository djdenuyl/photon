// The book: one spread at a time (desktop) or one page at a time (phone), with a filmstrip.
import { useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { PhotoSheet } from "@/components/PhotoSheet";
import { useIsDesktop } from "@/components/Shell";
import { displayUrl, thumbUrl, useStateMap, useYearData } from "@/lib/data";
import { buildBooks, coverBack, coverFront, pageBody, renderPage, renderSpread, type Book, type UrlFor } from "@/lib/layout";
import type { Photo, PlanEvent, Photos } from "@/lib/types";

interface Slide {
  label: string;
  title: string;
  html: (url: UrlFor) => string;
}

function slidesFor(book: Book, photos: Photos, perPage: boolean): Slide[] {
  const body = (i: number) => (url: UrlFor) => (book.pages[i] ? pageBody(book.pages[i], photos, url) : null);
  if (perPage) {
    return [
      { label: "Achterkant", title: "Omslag", html: (url) => renderPage(coverBack(book.cover, photos, url)) },
      { label: "Voorkant", title: "Omslag", html: (url) => renderPage(coverFront(book.cover, photos, url)) },
      ...book.pages.map((p, i) => ({ label: `Pagina ${i + 1}`, title: p.event.title, html: (url: UrlFor) => renderPage(body(i)(url)) })),
    ];
  }
  return [
    { label: "Omslag", title: "achterkant · voorkant", html: (url) => renderSpread(coverBack(book.cover, photos, url), coverFront(book.cover, photos, url)) },
    ...book.spreads.map((sp) => ({
      label: sp.label,
      title: [...new Set([sp.left, sp.right].filter((p) => p !== null).map((p) => p.event.title))].join(" · "),
      html: (url: UrlFor) =>
        renderSpread(sp.left ? pageBody(sp.left, photos, url) : null, sp.right ? pageBody(sp.right, photos, url) : null),
    })),
  ];
}

export function BookPage() {
  const year = useYearData();
  const picks = useStateMap("picks").data;
  const desktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const bookIndex = params.get("deel") === "2" ? 1 : 0;
  // phone: one page at a time by default; either view can be chosen
  const [choice, setChoice] = useState<boolean | null>(null);
  const perPage = choice ?? !desktop;
  const [open, setOpen] = useState<{ photo: Photo; event: PlanEvent | null } | null>(null);

  const books = useMemo(() => (year.data ? buildBooks(year.data.plan, year.data.photos, picks ?? {}) : null), [year.data, picks]);
  const book = books?.[bookIndex];
  const slides = useMemo(() => (book && year.data ? slidesFor(book, year.data.photos, perPage) : []), [book, year.data, perPage]);
  const slide = Math.min(Number(params.get("s") ?? 0) || 0, Math.max(0, slides.length - 1));
  const go = (i: number, deel = bookIndex) => {
    const next = new URLSearchParams(params);
    next.set("deel", String(deel + 1));
    next.set("s", String(Math.max(0, Math.min(i, slides.length - 1))));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open || (e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(slide + 1);
      if (e.key === "ArrowLeft") go(slide - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const touch = useRef<number | null>(null);
  const onTouchStart = (e: TouchEvent) => (touch.current = e.touches[0].clientX);
  const onTouchEnd = (e: TouchEvent) => {
    if (touch.current === null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) > 50) go(slide + (dx < 0 ? 1 : -1));
  };
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element).closest<SVGElement>("[data-photo]");
    const id = el?.dataset.photo;
    const photo = id ? year.data?.photos.get(id) : undefined;
    if (!photo) return;
    const eventId = el?.dataset.event;
    setOpen({ photo, event: year.data?.plan.events.find((ev) => ev.id === eventId) ?? null });
  };

  if (year.isPending) return <p className="p-6 text-muted">Boek laden…</p>;
  if (!book || !year.data) return <p className="p-6 text-muted">Geen gegevens gevonden.</p>;
  const current = slides[slide];
  const photosPlaced = book.pages.reduce((n, p) => n + p.elements.filter((e) => e.type === "photo").length, 0);

  return (
    <div className="mx-auto max-w-[1280px] px-3 pt-3 md:px-6 md:pt-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-surface p-1 ring-1 ring-hair">
          {books!.map((b, i) => (
            <button key={b.name} type="button" aria-pressed={i === bookIndex} onClick={() => go(0, i)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${i === bookIndex ? "bg-ink text-page" : "text-ink-2"}`}>
              {b.name} <span className="opacity-70">· {b.pages.length} p.</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => go(slide - 1)} disabled={slide === 0} aria-label="Vorige" className="h-10 w-10 rounded-full border border-hair bg-surface text-lg disabled:opacity-40">←</button>
        <select value={slide} onChange={(e) => go(Number(e.target.value))} aria-label="Ga naar"
          className="h-10 min-w-0 flex-1 rounded-full border border-hair bg-surface px-3 text-sm md:max-w-md">
          {slides.map((s, i) => (
            <option key={i} value={i}>{s.label} — {s.title}</option>
          ))}
        </select>
        <button type="button" onClick={() => go(slide + 1)} disabled={slide === slides.length - 1} aria-label="Volgende" className="h-10 w-10 rounded-full border border-hair bg-surface text-lg disabled:opacity-40">→</button>
        <button type="button" onClick={() => { setChoice(!perPage); go(0); }}
          className="h-10 rounded-full border border-hair bg-surface px-3 text-sm">
          {perPage ? "Spreads" : "Pagina's"}
        </button>
      </div>

      <div
        className="mx-auto mt-3"
        style={{ maxWidth: perPage ? "min(100%, calc((100dvh - 15rem) * 0.75))" : "min(100%, calc((100dvh - 14rem) * 1.5))" }}
        onClick={onClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        dangerouslySetInnerHTML={{ __html: current.html(displayUrl) }}
      />
      <p className="mt-2 text-center text-sm text-ink-2">{current.label} · {current.title}</p>

      <Filmstrip slides={slides} active={slide} onPick={go} />
      <p className="mt-2 pb-4 text-xs text-muted">
        {book.pages.length} pagina's (Albelli Staand L: tot ongeveer 120) · {(photosPlaced / book.pages.length).toFixed(1).replace(".", ",")} foto's per pagina ·{" "}
        {Object.keys(picks ?? {}).length} grote foto's door jou gekozen. Tik op een foto om hem als grote foto te kiezen; veeg of gebruik ← → om te bladeren.
      </p>
      {open && <PhotoSheet photo={open.photo} event={open.event} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Filmstrip({ slides, active, onPick }: { slides: Slide[]; active: number; onPick: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<number>>(new Set());
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) =>
        setVisible((prev) => {
          const next = new Set(prev);
          for (const en of entries) if (en.isIntersecting) next.add(Number((en.target as HTMLElement).dataset.i));
          return next;
        }),
      { root, rootMargin: "0px 400px" },
    );
    root.querySelectorAll("[data-i]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [slides]);
  useEffect(() => {
    ref.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active]);
  return (
    <div ref={ref} className="mt-3 flex gap-2 overflow-x-auto pb-2">
      {slides.map((s, i) => (
        <button key={i} type="button" data-i={i} onClick={() => onPick(i)}
          className={`w-28 shrink-0 rounded-md border-2 p-0.5 text-left md:w-32 ${i === active ? "border-accent" : "border-transparent"}`}>
          <div className="overflow-hidden rounded-sm bg-hair" style={{ aspectRatio: s.label.startsWith("Pagina") || s.title === "Omslag" ? "210 / 280" : "420 / 280" }}
            dangerouslySetInnerHTML={{ __html: visible.has(i) ? s.html(thumbUrl) : "" }} />
          <span className="mt-0.5 block truncate text-[11px] text-muted">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
