// A book to leaf through: the current spread (or page) with previous/next beside it, a dropdown to
// jump, and a filmstrip. Shared by this year's book (editable) and the earlier Albelli books.
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";

export interface Slide {
  label: string;
  title: string;
  /** Width in the slide's own units relative to its height (spread 1.5, page 0.75). */
  aspect: number;
  html: (big: boolean) => string;
}

export function BookViewer({
  slides,
  index,
  onIndex,
  toolbar,
  overlay,
  onStageClick,
  swipe = true,
}: {
  slides: Slide[];
  index: number;
  onIndex: (i: number) => void;
  toolbar?: ReactNode;
  overlay?: ReactNode;
  onStageClick?: (e: React.MouseEvent) => void;
  swipe?: boolean;
}) {
  const current = slides[index];
  const go = (i: number) => onIndex(Math.max(0, Math.min(i, slides.length - 1)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=dialog]") || document.querySelector("[data-editing]")) return;
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const touch = useRef<number | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    if (swipe) touch.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (touch.current === null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
  };

  if (!current) return null;
  const side = "flex h-12 w-10 shrink-0 items-center justify-center rounded-full border border-hair bg-surface text-xl text-ink-2 shadow-sm disabled:opacity-30 md:h-16 md:w-12";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <select value={index} onChange={(e) => go(Number(e.target.value))} aria-label="Ga naar"
          className="h-10 min-w-0 flex-1 rounded-full border border-hair bg-surface px-3 text-sm md:max-w-md">
          {slides.map((s, i) => (
            <option key={i} value={i}>{s.label} — {s.title}</option>
          ))}
        </select>
        <span className="text-xs text-muted tabular-nums">{index + 1} / {slides.length}</span>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 md:gap-4">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Vorige" className={side}>‹</button>
        <div
          className="relative min-w-0 flex-1"
          style={{ maxWidth: `min(100%, calc((100dvh - 15rem) * ${current.aspect}))` }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div onClick={onStageClick} dangerouslySetInnerHTML={{ __html: current.html(true) }} />
          {overlay}
        </div>
        <button type="button" onClick={() => go(index + 1)} disabled={index === slides.length - 1} aria-label="Volgende" className={side}>›</button>
      </div>
      <p className="mt-2 text-center text-sm text-ink-2">{current.label} · {current.title}</p>
      <Filmstrip slides={slides} active={index} onPick={go} />
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
          className={`shrink-0 rounded-md border-2 p-0.5 text-left ${i === active ? "border-accent" : "border-transparent"}`}
          style={{ width: s.aspect > 1 ? "8rem" : "4.5rem" }}>
          <div className="overflow-hidden rounded-sm bg-hair" style={{ aspectRatio: String(s.aspect) }}
            dangerouslySetInnerHTML={{ __html: visible.has(i) ? s.html(false) : "" }} />
          <span className="mt-0.5 block truncate text-[11px] text-muted">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
