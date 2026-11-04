// This year's book: the generated layout with your picks and edits applied. Leaf through it
// (spreads on desktop, pages on a phone) or switch on the editor.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookViewer, type Slide } from "@/components/BookViewer";
import { EditorOverlay, EditorToolbar, itemsFor, PhotoPicker, type EditMode, type Item } from "@/components/Editor";
import { PhotoSheet } from "@/components/PhotoSheet";
import { useIsDesktop } from "@/components/Shell";
import { displayUrl, thumbUrl, useSaveState, useStateMap, useYearData } from "@/lib/data";
import { applyEdits, parseEdits, serializeEdits, swapPhoto, updateElement, type Edits } from "@/lib/edits";
import { buildBooks, coverBack, coverFront, PAGE, pageBody, renderPage, renderSpread, type Book, type Page } from "@/lib/layout";
import type { Photo, Photos, PlanEvent } from "@/lib/types";

interface BookSlide extends Slide {
  pages: { page: Page | null; dx: number }[];
  width: number;
}

function slidesFor(book: Book, photos: Photos, perPage: boolean): BookSlide[] {
  const url = (big: boolean) => (big ? displayUrl : thumbUrl);
  const body = (p: Page | null, big: boolean) => (p ? pageBody(p, photos, url(big)) : null);
  if (perPage) {
    return [
      { label: "Achterkant", title: "Omslag", aspect: 0.75, pages: [], width: PAGE.w, html: (big) => renderPage(coverBack(book.cover, photos, url(big))) },
      { label: "Voorkant", title: "Omslag", aspect: 0.75, pages: [], width: PAGE.w, html: (big) => renderPage(coverFront(book.cover, photos, url(big))) },
      ...book.pages.map((p, i) => ({
        label: `Pagina ${i + 1}`, title: p.event.title, aspect: 0.75, pages: [{ page: p, dx: 0 }], width: PAGE.w,
        html: (big: boolean) => renderPage(body(p, big)),
      })),
    ];
  }
  return [
    {
      label: "Omslag", title: "achterkant · voorkant", aspect: 1.5, pages: [], width: 2 * PAGE.w,
      html: (big) => renderSpread(coverBack(book.cover, photos, url(big)), coverFront(book.cover, photos, url(big))),
    },
    ...book.spreads.map((sp) => ({
      label: sp.label,
      title: [...new Set([sp.left, sp.right].filter((p) => p !== null).map((p) => p.event.title))].join(" · "),
      aspect: 1.5,
      pages: [{ page: sp.left, dx: 0 }, { page: sp.right, dx: PAGE.w }],
      width: 2 * PAGE.w,
      html: (big: boolean) => renderSpread(body(sp.left, big), body(sp.right, big)),
    })),
  ];
}

export function BookPage() {
  const year = useYearData();
  const picks = useStateMap("picks").data;
  const savePicks = useSaveState("picks");
  const remoteEdits = useStateMap("edits").data;
  const saveEdits = useSaveState("edits");
  const desktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const bookIndex = params.get("deel") === "2" ? 1 : 0;
  const [choice, setChoice] = useState<boolean | null>(null);
  const perPage = choice ?? !desktop;
  const [open, setOpen] = useState<{ photo: Photo; event: PlanEvent | null } | null>(null);

  // editor state: local edits (until the server copy is replaced), undo/redo, live preview
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState<Edits | null>(null);
  const [past, setPast] = useState<Edits[]>([]);
  const [future, setFuture] = useState<Edits[]>([]);
  const [preview, setPreview] = useState<Edits | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<EditMode>("move");
  const [swapping, setSwapping] = useState<Item | null>(null);
  const edits = local ?? parseEdits(remoteEdits);
  const shown = preview ?? edits;

  const books = useMemo(
    () => (year.data ? applyEdits(buildBooks(year.data.plan, year.data.photos, picks ?? {}), shown) : null),
    [year.data, picks, shown],
  );
  const book = books?.[bookIndex];
  const slides = useMemo(() => (book && year.data ? slidesFor(book, year.data.photos, perPage) : []), [book, year.data, perPage]);
  const slide = Math.min(Number(params.get("s") ?? 0) || 0, Math.max(0, slides.length - 1));
  const go = (i: number, deel = bookIndex) => {
    const next = new URLSearchParams(params);
    next.set("deel", String(deel + 1));
    next.set("s", String(Math.max(0, i)));
    setParams(next, { replace: true });
    setSelection(new Set());
  };

  const saveTimer = useRef<number | undefined>(undefined);
  const commit = (next: Edits) => {
    setPast((p) => [...p.slice(-99), edits]);
    setFuture([]);
    setLocal(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveEdits.mutate(serializeEdits(next)), 700);
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [edits, ...f]);
    setPast((p) => p.slice(0, -1));
    const prev = past[past.length - 1];
    setLocal(prev);
    saveEdits.mutate(serializeEdits(prev));
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, edits]);
    setFuture((f) => f.slice(1));
    setLocal(future[0]);
    saveEdits.mutate(serializeEdits(future[0]));
  };

  const current = slides[slide];
  const items = current && editing ? itemsFor(current.pages) : [];
  const selected = items.filter((i) => selection.has(i.sel));
  const apply = (f: (i: Item) => Parameters<typeof updateElement>[3]) =>
    commit(selected.reduce((acc, i) => updateElement(acc, i.key, i.slot, f(i)), edits));

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [role=dialog]")) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        setSelection(new Set());
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
        e.preventDefault();
        apply(() => ({ hidden: true }));
        setSelection(new Set());
      } else if (e.key.startsWith("Arrow") && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
        apply((i) => ({ x: i.el.x + dx, y: i.el.y + dy }));
      } else if (e.key.startsWith("Arrow") && !selected.length) {
        if (e.key === "ArrowRight") go(slide + 1);
        if (e.key === "ArrowLeft") go(slide - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (year.isPending) return <p className="p-6 text-muted">Boek laden…</p>;
  if (!book || !year.data || !current) return <p className="p-6 text-muted">Geen gegevens gevonden.</p>;
  const data = year.data;
  const photosPlaced = book.pages.reduce((n, p) => n + p.elements.filter((e) => e.type === "photo").length, 0);
  const placedIds = new Set(books!.flatMap((b) => b.pages.flatMap((p) => p.elements.flatMap((e) => (e.type === "photo" ? [e.id] : [])))));
  const one = selected.length === 1 ? selected[0] : null;

  const onStageClick = (e: React.MouseEvent) => {
    if (editing) return;
    const el = (e.target as Element).closest<SVGElement>("[data-photo]");
    const id = el?.dataset.photo;
    const photo = id ? data.photos.get(id) : undefined;
    if (!photo) return;
    setOpen({ photo, event: data.plan.events.find((ev) => ev.id === el?.dataset.event) ?? null });
  };

  const toolbar = (
    <>
      <div className="flex rounded-full bg-surface p-1 ring-1 ring-hair">
        {books!.map((b, i) => (
          <button key={b.name} type="button" aria-pressed={i === bookIndex} onClick={() => go(0, i)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${i === bookIndex ? "bg-ink text-page" : "text-ink-2"}`}>
            {b.name} <span className="opacity-70">· {b.pages.length} p.</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => { setChoice(!perPage); go(0); }} className="h-10 rounded-full border border-hair bg-surface px-3 text-sm">
        {perPage ? "Spreads" : "Pagina's"}
      </button>
      <button type="button" onClick={() => { setEditing(!editing); setSelection(new Set()); }}
        className={`h-10 rounded-full px-4 text-sm font-semibold ${editing ? "bg-accent text-white" : "border border-hair bg-surface"}`}>
        {editing ? "Bewerken aan" : "Bewerken"}
      </button>
    </>
  );

  return (
    <div className="mx-auto max-w-[1280px] px-3 pt-3 md:px-6 md:pt-5">
      <BookViewer
        slides={slides}
        index={slide}
        onIndex={go}
        toolbar={toolbar}
        swipe={!editing}
        onStageClick={onStageClick}
        overlay={
          editing && current.pages.length ? (
            <EditorOverlay
              items={items}
              width={current.width}
              photos={data.photos}
              edits={edits}
              selection={selection}
              onSelect={setSelection}
              mode={mode}
              onPreview={setPreview}
              onCommit={commit}
            />
          ) : null
        }
      />
      {editing && (
        current.pages.length ? (
          <EditorToolbar
            selected={selected}
            mode={mode}
            onMode={setMode}
            apply={apply}
            onSwap={() => one && setSwapping(one)}
            onPick={() => {
              if (!one) return;
              const next = { ...(picks ?? {}) };
              if (next[one.page.event.id] === one.el.id) delete next[one.page.event.id];
              else next[one.page.event.id] = one.el.id;
              savePicks.mutate(next);
            }}
            pickedHere={!!one && picks?.[one.page.event.id] === one.el.id}
            onUndo={undo}
            onRedo={redo}
            canUndo={past.length > 0}
            canRedo={future.length > 0}
            onResetPages={() => {
              const keys = current.pages.flatMap(({ page }) => (page ? [`${page.event.id}:${page.k}`] : []));
              const next = { ...edits };
              for (const k of keys) delete next[k];
              commit(next);
              setSelection(new Set());
            }}
            onDone={() => { setEditing(false); setSelection(new Set()); }}
          />
        ) : (
          <p className="mt-3 text-center text-sm text-muted">Het omslag is nog niet te bewerken.</p>
        )
      )}
      {!editing && (
        <p className="mt-2 pb-4 text-xs text-muted">
          {book.pages.length} pagina's (Albelli Staand L: tot ongeveer 120) · {(photosPlaced / book.pages.length).toFixed(1).replace(".", ",")} foto's per pagina ·{" "}
          {Object.keys(picks ?? {}).length} grote foto's gekozen · {Object.keys(edits).length} pagina's bewerkt. Tik op een foto om hem als grote foto te kiezen.
        </p>
      )}
      {open && <PhotoSheet photo={open.photo} event={open.event} onClose={() => setOpen(null)} />}
      {swapping && data.photos.get(swapping.el.id) && (
        <PhotoPicker
          current={data.photos.get(swapping.el.id)!}
          event={swapping.page.event}
          photos={data.photos}
          events={data.plan.events}
          placed={placedIds}
          onPick={(id) => {
            commit(swapPhoto(books!, edits, swapping.key, swapping.slot, swapping.el.id, id));
            setSwapping(null);
          }}
          onClose={() => setSwapping(null)}
        />
      )}
    </div>
  );
}
