// This year's book: the generated layout with your picks and edits applied, cover included.
// Opens in the editor; "Bekijken" leafs through it without the editing controls. Every change is
// saved as you go (see lib/saver.ts), there is nothing to save by hand.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookViewer, type Slide } from "@/components/BookViewer";
import { EditBar, EditorOverlay, itemsFor, photoOf, SelectionBar, type Item } from "@/components/Editor";
import { PhotoPicker } from "@/components/PhotoPicker";
import { PhotoSheet } from "@/components/PhotoSheet";
import { useIsDesktop } from "@/components/Shell";
import { displayUrl, thumbUrl, useSaveState, useStateMap, useYearData, YEAR } from "@/lib/data";
import { allPages, applyEdits, parseEdits, serializeEdits, swapPhoto, updateElement, type ElementEdit, type Edits } from "@/lib/edits";
import { buildBooks, PAGE, pageBody, renderPage, renderSpread, type Book, type Page } from "@/lib/layout";
import { Saver, type SaveStatus } from "@/lib/saver";
import type { Photo, Photos, PlanEvent } from "@/lib/types";

interface BookSlide extends Slide {
  pages: { page: Page | null; dx: number }[];
  width: number;
}

function slidesFor(book: Book, photos: Photos, perPage: boolean): BookSlide[] {
  const url = (big: boolean) => (big ? displayUrl : thumbUrl);
  const body = (p: Page | null, big: boolean) => (p ? pageBody(p, photos, url(big)) : null);
  const { back, front } = book.covers;
  if (perPage) {
    return [
      { label: "Achterkant", title: "Omslag", aspect: 0.75, pages: [{ page: back, dx: 0 }], width: PAGE.w, html: (big) => renderPage(body(back, big)) },
      { label: "Voorkant", title: "Omslag", aspect: 0.75, pages: [{ page: front, dx: 0 }], width: PAGE.w, html: (big) => renderPage(body(front, big)) },
      ...book.pages.map((p, i) => ({
        label: `Pagina ${i + 1}`, title: p.event.title, aspect: 0.75, pages: [{ page: p, dx: 0 }], width: PAGE.w,
        html: (big: boolean) => renderPage(body(p, big)),
      })),
    ];
  }
  return [
    {
      label: "Omslag", title: "achterkant · voorkant", aspect: 1.5, width: 2 * PAGE.w,
      pages: [{ page: back, dx: 0 }, { page: front, dx: PAGE.w }],
      html: (big) => renderSpread(body(back, big), body(front, big)),
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

function useSnapSetting(): [boolean, (on: boolean) => void] {
  const [snap, setSnap] = useState(() => {
    try {
      return localStorage.getItem("photon-snap") !== "off";
    } catch {
      return true;
    }
  });
  const set = (on: boolean) => {
    setSnap(on);
    try {
      localStorage.setItem("photon-snap", on ? "on" : "off");
    } catch {
      // private mode: the setting just isn't remembered
    }
  };
  return [snap, set];
}

export function BookPage() {
  const year = useYearData();
  const picks = useStateMap("picks").data;
  const savePicks = useSaveState("picks");
  const remoteEdits = useStateMap("edits").data;
  const qc = useQueryClient();
  const [saving, setSaving] = useState<SaveStatus>("saved");
  const [saver] = useState(
    () => new Saver(`/api/state/${YEAR}/edits`, setSaving, (server) => qc.setQueryData(["state", YEAR, "edits"], server)),
  );
  useEffect(() => {
    if (remoteEdits) saver.setBase(remoteEdits);
  }, [saver, remoteEdits]);
  const desktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const bookIndex = params.get("deel") === "2" ? 1 : 0;
  const [choice, setChoice] = useState<boolean | null>(null);
  const perPage = choice ?? !desktop;
  const [open, setOpen] = useState<{ photo: Photo; event: PlanEvent | null } | null>(null);

  // editor state: undo/redo and the live preview while dragging (the edits live in the query cache)
  const [editing, setEditing] = useState(true);
  const [past, setPast] = useState<Edits[]>([]);
  const [future, setFuture] = useState<Edits[]>([]);
  const [preview, setPreview] = useState<Edits | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [snap, setSnap] = useSnapSetting();
  const [swapping, setSwapping] = useState<Item | null>(null);
  const edits = useMemo(() => parseEdits(remoteEdits), [remoteEdits]);
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

  // every change (and every undo/redo) is stored; the saver batches them into few writes
  const store = (next: Edits) => {
    const data = serializeEdits(next);
    qc.setQueryData(["state", YEAR, "edits"], data);
    saver.save(data);
  };
  const commit = (next: Edits) => {
    setPast((p) => [...p.slice(-199), edits]);
    setFuture([]);
    store(next);
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [edits, ...f]);
    setPast((p) => p.slice(0, -1));
    store(past[past.length - 1]);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, edits]);
    setFuture((f) => f.slice(1));
    store(future[0]);
  };
  useEffect(() => {
    const onHide = () => saver.flushOnExit();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void saver.flush();
    };
  }, [saver]);

  // a click anywhere outside the book's elements (and the editor's own controls) clears the selection
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-editing], [data-keep-selection], [role=dialog]")) setSelection(new Set());
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [editing]);

  const current = slides[slide];
  const items = current && editing ? itemsFor(current.pages) : [];
  const selected = items.filter((i) => selection.has(i.sel));
  const one = selected.length === 1 ? selected[0] : null;
  const apply = (f: (i: Item) => ElementEdit | null) =>
    commit(selected.reduce((acc, i) => updateElement(acc, i.key, i.slot, f(i)), edits));

  // stacking: in front of everything on the page, or behind everything but the background
  const zs = (i: Item) => i.page.elements.map((e) => ({ z: e.z ?? 0, bg: e.type === "photo" && !!e.bg, slot: e.slot }));
  const toFront = () =>
    commit(selected.reduce((acc, i, n) => updateElement(acc, i.key, i.slot, { z: Math.max(...zs(i).map((e) => e.z)) + 1 + n }), edits));
  const toBack = () =>
    commit(selected.reduce((acc, i, n) => {
      const all = zs(i);
      const floor = Math.max(-1, ...all.filter((e) => e.bg).map((e) => e.z));
      const lowest = Math.min(1e6, ...all.filter((e) => !e.bg && e.slot !== i.slot).map((e) => e.z));
      const z = lowest === 1e6 ? floor + 1 : floor + ((lowest - floor) * (n + 1)) / (selected.length + 1);
      return updateElement(acc, i.key, i.slot, { z });
    }, edits));
  const togglePick = () => {
    if (!one || one.el.type !== "photo") return;
    const next = { ...(picks ?? {}) };
    if (next[one.page.event.id] === one.el.id) delete next[one.page.event.id];
    else next[one.page.event.id] = one.el.id;
    savePicks.mutate(next);
  };
  const addText = () => {
    const target = current ? [...current.pages].reverse().find((p) => p.page) : undefined;
    if (!target?.page) return;
    const key = `${target.page.event.id}:${target.page.k}`;
    const slot = `add${Date.now().toString(36)}`;
    commit(updateElement(edits, key, slot, { add: "caption", text: "Tekst", x: PAGE.w / 2 - 10, y: PAGE.h / 2 }));
    setSelection(new Set([`${key}|${slot}`]));
  };

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
        apply((i) => (i.kind === "bg" ? {} : { x: i.el.x + dx, y: i.el.y + dy }));
      } else if (e.key === "ArrowRight") {
        go(slide + 1);
      } else if (e.key === "ArrowLeft") {
        go(slide - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (year.isPending) return <p className="p-6 text-muted">Boek laden…</p>;
  if (!book || !year.data || !current) return <p className="p-6 text-muted">Geen gegevens gevonden.</p>;
  const data = year.data;
  const photosPlaced = book.pages.reduce((n, p) => n + p.elements.filter((e) => e.type === "photo").length, 0);
  // every photo used anywhere in either book, the covers included
  const placedIds = new Set(books!.flatMap((b) => allPages(b).flatMap((p) => p.elements.flatMap((e) => (e.type === "photo" ? [e.id] : e.type === "month" && e.photo ? [e.photo] : [])))));

  const onStageClick = (e: React.MouseEvent) => {
    if (editing) return;
    const el = (e.target as Element).closest<SVGElement>("[data-photo]");
    const id = el?.dataset.photo;
    const photo = id ? data.photos.get(id) : undefined;
    if (!photo) return;
    setOpen({ photo, event: data.plan.events.find((ev) => ev.id === el?.dataset.event) ?? null });
  };

  const seg = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-medium ${on ? "bg-ink text-page" : "text-ink-2"}`;
  const toolbar = (
    <>
      <div className="flex rounded-full bg-surface p-1 ring-1 ring-hair">
        {books!.map((b, i) => (
          <button key={b.name} type="button" aria-pressed={i === bookIndex} onClick={() => go(0, i)} className={seg(i === bookIndex)}>
            {b.name} <span className="opacity-70">· {b.pages.length} p.</span>
          </button>
        ))}
      </div>
      <div className="flex rounded-full bg-surface p-1 ring-1 ring-hair" role="group" aria-label="Weergave">
        <button type="button" aria-pressed={!perPage} onClick={() => { setChoice(false); go(0); }} className={seg(!perPage)}>Spreads</button>
        <button type="button" aria-pressed={perPage} onClick={() => { setChoice(true); go(0); }} className={seg(perPage)}>Pagina's</button>
      </div>
      <div className="flex rounded-full bg-surface p-1 ring-1 ring-hair" role="group" aria-label="Modus">
        <button type="button" aria-pressed={editing} onClick={() => setEditing(true)} className={seg(editing)}>Bewerken</button>
        <button type="button" aria-pressed={!editing} onClick={() => { setEditing(false); setSelection(new Set()); void saver.flush(); }} className={seg(!editing)}>Bekijken</button>
      </div>
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
          editing ? (
            <EditorOverlay
              items={items}
              width={current.width}
              photos={data.photos}
              edits={edits}
              selection={selection}
              onSelect={setSelection}
              snap={snap}
              bar={
                <SelectionBar
                  selected={selected}
                  a={{
                    apply,
                    onSwap: () => one && setSwapping(one),
                    onPick: togglePick,
                    pickedHere: !!one && one.el.type === "photo" && picks?.[one.page.event.id] === one.el.id,
                    onFront: toFront,
                    onBack: toBack,
                  }}
                />
              }
              onPreview={setPreview}
              onCommit={commit}
            />
          ) : null
        }
      />
      {editing ? (
        <EditBar
          onUndo={undo}
          onRedo={redo}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          snap={snap}
          onSnap={setSnap}
          onAddText={addText}
          saving={saving}
          onResetPages={() => {
            const keys = current.pages.flatMap(({ page }) => (page ? [`${page.event.id}:${page.k}`] : []));
            const next = { ...edits };
            for (const k of keys) delete next[k];
            commit(next);
            setSelection(new Set());
          }}
        />
      ) : (
        <p className="mt-2 pb-4 text-xs text-muted">
          {book.pages.length} pagina's (Albelli Staand L: tot ongeveer 120) · {(photosPlaced / book.pages.length).toFixed(1).replace(".", ",")} foto's per pagina ·{" "}
          {Object.keys(picks ?? {}).length} grote foto's gekozen · {Object.keys(edits).length} pagina's bewerkt. Tik op een foto om hem groot te bekijken.
        </p>
      )}
      {open && <PhotoSheet photo={open.photo} event={open.event} onClose={() => setOpen(null)} />}
      {swapping && (
        <PhotoPicker
          current={data.photos.get(photoOf(swapping) ?? "")}
          event={swapping.page.event}
          photos={data.photos}
          events={data.plan.events}
          bookEvents={new Set(book.pages.map((p) => p.event.id))}
          // cover parts, backgrounds and month titles look in the whole book; a grid photo in its event
          initialScope={swapping.kind === "photo" && !swapping.page.cover ? "event" : "book"}
          placed={placedIds}
          onPick={(id) => {
            const old = photoOf(swapping);
            // a photo in the book's grid trades places; cover parts, backgrounds and month titles just take it
            commit(swapping.kind === "photo" && old
              ? swapPhoto(books!, edits, swapping.key, swapping.slot, old, id)
              : updateElement(edits, swapping.key, swapping.slot, { photo: id, zoom: undefined, focus: undefined }));
            setSwapping(null);
          }}
          onClose={() => setSwapping(null)}
        />
      )}
    </div>
  );
}
