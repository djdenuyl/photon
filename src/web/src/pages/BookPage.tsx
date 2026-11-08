// This year's book: the generated layout with your picks and edits applied, cover included.
// Opens in the editor; "Bekijken" leafs through it without the editing controls. Every change is
// saved as you go (see lib/saver.ts), there is nothing to save by hand.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookViewer, type Slide } from "@/components/BookViewer";
import { EditBar, EditorOverlay, itemsFor, moveBy, photoOf, SelectionBar, withFrame, type Item } from "@/components/Editor";
import { ExportModal } from "@/components/ExportModal";
import { NotesDrawer, type NoteTarget } from "@/components/NotesDrawer";
import { PagePanel } from "@/components/PagePanel";
import { PhotoPicker } from "@/components/PhotoPicker";
import { PhotoSheet } from "@/components/PhotoSheet";
import { useIsDesktop } from "@/components/Shell";
import { displayUrl, thumbUrl, useSaveState, useStateMap, useYearData, YEAR } from "@/lib/data";
import { allPages, applyEdits, clearedLayout, copyLayout, parseEdits, pasteLayout, serializeEdits, swapPhoto, updateElement, type CopiedLayout, type ElementEdit, type Edits, type PageEdits } from "@/lib/edits";
import { collage, overDeRug } from "@/lib/freeform";
import { buildBooks, PAGE, pageBody, renderPage, renderSpread, type Book, type Page } from "@/lib/layout";
import { useAutoColors } from "@/lib/contrast";
import { makeMesh, type Mesh } from "@/lib/mesh";
import { newNote, newNoteId, useNotes, type Note } from "@/lib/notes";
import { usePalette } from "@/lib/palette";
import { arrangements, type Cell } from "@/lib/smart";
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
  const [exporting, setExporting] = useState(false);
  // a page's arrangement, copied to put on another page
  const [copied, setCopied] = useState<CopiedLayout | null>(null);

  // editor state: undo/redo and the live preview while dragging (the edits live in the query cache)
  const [editing, setEditing] = useState(true);
  const [past, setPast] = useState<Edits[]>([]);
  const [future, setFuture] = useState<Edits[]>([]);
  const [preview, setPreview] = useState<Edits | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [snap, setSnap] = useSnapSetting();
  const [swapping, setSwapping] = useState<Item | null>(null);
  const [addingBg, setAddingBg] = useState<Page | null>(null);
  // notes: the drawer, and a note just added (its field gets the focus)
  const { notes, save: saveNote } = useNotes();
  const [notesOpen, setNotesOpen] = useState(false);
  const [freshNote, setFreshNote] = useState<string | null>(null);
  // which smart layout each page is on (by page key), to click through them
  const [smartAt, setSmartAt] = useState<Record<string, number>>({});
  const edits = useMemo(() => parseEdits(remoteEdits), [remoteEdits]);
  const shown = preview ?? edits;

  const books = useMemo(
    () => (year.data ? applyEdits(buildBooks(year.data.plan, year.data.photos, picks ?? {}), shown) : null),
    [year.data, picks, shown],
  );
  const book = books?.[bookIndex];
  // text set to "automatisch contrast" gets white or dark from what lies under it
  const autoColors = useAutoColors(book ? allPages(book) : [], year.data?.photos, thumbUrl);
  const slides = useMemo(() => {
    if (!book || !year.data) return [];
    for (const p of allPages(book))
      for (const e of p.elements) if (e.type === "caption" && e.color === "auto") e.autoColor = autoColors.get(`${p.event.id}:${p.k}|${e.slot ?? ""}`);
    return slidesFor(book, year.data.photos, perPage);
  }, [book, year.data, perPage, autoColors]);
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
    commit(selected.reduce((acc, i) => updateElement(acc, i.key, i.slot, withFrame(i, f(i))), edits));

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
  // colours that suit the visible pages: the tones of their photos
  const pagePhotoUrls = [...new Set((current?.pages ?? []).flatMap(({ page }) => (page?.elements ?? []).flatMap((e) => {
    const photo = e.type === "photo" ? year.data?.photos.get(e.id) : undefined;
    return photo ? [thumbUrl(photo)] : [];
  })))];
  const tones = usePalette(pagePhotoUrls);

  // the page menu: colour and shape of the page's colour area, colour areas, background photo, layouts
  const pageItem = one?.kind === "page" ? one : null;
  const pageEdit = pageItem ? edits[pageItem.key] : undefined;
  const meshOf = (key: string): Mesh | undefined => shown[key]?.mesh?.mesh;
  const setMesh = (page: Page, key: string, template: Mesh["template"] | null, opts?: { gap?: number; bleed?: boolean; seed?: string }) => {
    // cell edits belong to the previous mesh
    const pe = Object.fromEntries(Object.entries(edits[key] ?? {}).filter(([slot]) => !slot.startsWith("cell") && slot !== "mesh"));
    if (!template) {
      commit({ ...edits, [key]: pe });
        return;
    }
    const plain = page.elements.flatMap((e) => (e.type === "photo" && !e.bg && (!e.shape || e.cell !== undefined) && e.id ? [e.id] : []));
    const mesh = makeMesh(template, Math.max(1, plain.length), opts?.seed ?? key, opts);
    // more cells than photos (honeycomb): more photos of the event that aren't in the book yet
    // more cells than photos (a honeycomb): the rest stay empty, to be filled by a click
    const cells = mesh.cells.map((_, i) => plain[i] ?? "");
    commit({ ...edits, [key]: { ...pe, mesh: { mesh, cells } } });
  };

  // a new mesh shape for the same photos (cells beyond the old count are filled like setMesh does)
  const setMeshKeepCells = (key: string, mesh: Mesh) => {
    const old = edits[key]?.mesh?.cells ?? [];
    const cells = mesh.cells.map((_, i) => old[i] ?? "");
    const pe = Object.fromEntries(Object.entries(edits[key] ?? {}).filter(([slot]) => !(slot.startsWith("cell") && Number(slot.slice(4)) >= cells.length)));
    commit({ ...edits, [key]: { ...pe, mesh: { mesh, cells } } });
  };
  // the photos (and month title) a page arranges: smart layout, collage, over de rug
  const cellsOf = (page: Page): Cell[] => page.elements.flatMap((e): Cell[] => {
    if (e.type === "month") return [{ slot: e.slot ?? "month", aspect: e.w / e.h }];
    if (e.type !== "photo" || e.bg || e.shape || e.twin || e.cell !== undefined) return [];
    const ph = year.data?.photos.get(e.id);
    return ph ? [{ slot: e.slot ?? e.id, aspect: ph.w / ph.h }] : [];
  });
  const setCollage = (page: Page, variant = 0) => {
    const key = `${page.event.id}:${page.k}`;
    // a mesh gives way: its photos come back as frames first
    const plain: Edits = { ...edits, [key]: clearedLayout(edits[key]) };
    const base = applyEdits(buildBooks(year.data!.plan, year.data!.photos, picks ?? {}), plain).flatMap(allPages).find((q) => `${q.event.id}:${q.k}` === key) ?? page;
    const pe: PageEdits = { ...plain[key], layout: { layout: "collage" } };
    for (const [slot, ed] of Object.entries(collage(cellsOf(base), key, variant))) pe[slot] = { ...pe[slot], ...ed };
    commit({ ...edits, [key]: pe });
  };
  // the facing pages of the spread on screen, when there are two
  const spread = current && current.pages.length === 2 && current.pages[0].page && current.pages[1].page ? [current.pages[0].page, current.pages[1].page] as const : null;
  const setSpine = () => {
    if (!spread || !year.data) return;
    const [l, r] = spread;
    const lk = `${l.event.id}:${l.k}`, rk = `${r.event.id}:${r.k}`;
    const plain: Edits = { ...edits, [lk]: clearedLayout(edits[lk]), [rk]: clearedLayout(edits[rk]) };
    const pages = applyEdits(buildBooks(year.data.plan, year.data.photos, picks ?? {}), plain).flatMap(allPages);
    const [pl, pr] = [lk, rk].map((k) => pages.find((q) => `${q.event.id}:${q.k}` === k)!);
    const [cl, cr] = [cellsOf(pl), cellsOf(pr)];
    // across the spine: the widest photo of the two pages (the left one when it's a tie)
    const photosOf = (cs: Cell[]) => cs.filter((c) => c.slot !== "month");
    const widest = [...photosOf(cl).map((c) => ({ c, from: "left" as const })), ...photosOf(cr).map((c) => ({ c, from: "right" as const }))]
      .sort((a, b) => b.c.aspect - a.c.aspect)[0];
    if (!widest) return;
    const out = overDeRug({ key: lk, cells: cl }, { key: rk, cells: cr }, widest.from, widest.c.slot);
    const next: Edits = { ...plain };
    for (const [k, pe] of Object.entries(out)) {
      const merged = { ...next[k] };
      for (const [slot, ed] of Object.entries(pe)) merged[slot] = { ...merged[slot], ...ed };
      next[k] = merged;
    }
    commit(next);
  };
  // back to the proposal: this page's arrangement, and the facing page's half of a spine photo
  const clearLayout = (key: string) => {
    const next: Edits = { ...edits, [key]: clearedLayout(edits[key]) };
    for (const [k, pe] of Object.entries(edits)) {
      const linked = Object.values(pe).some((ed) => ed.add === "twin" && ed.of?.startsWith(`${key}|`))
        || Object.values(edits[key] ?? {}).some((ed) => ed.add === "twin" && ed.of?.startsWith(`${k}|`));
      if (linked && k !== key) next[k] = clearedLayout(pe);
    }
    commit(next);
  };
  const hasLayout = (key: string) => Object.entries(edits[key] ?? {}).some(([slot, ed]) =>
    slot === "mesh" || slot === "layout" || ed.add === "twin" || (!ed.add && (ed.x !== undefined || ed.rot !== undefined)))
    || Object.values(edits).some((pe) => Object.values(pe).some((ed) => ed.add === "twin" && ed.of?.startsWith(`${key}|`)));

  // smart layout: the photos (and month title) of a page in the next (or previous) arrangement
  const smart = (page: Page, dir: 1 | -1) => {
    const key = `${page.event.id}:${page.k}`;
    if (edits[key]?.layout?.layout === "collage") {
      const at = (smartAt[key] ?? 0) + dir;
      setCollage(page, ((at % 30) + 30) % 30);
      setSmartAt({ ...smartAt, [key]: at });
      return;
    }
    const mesh = meshOf(key);
    if (mesh) {
      // a mesh layout: another variant of the same kind (other rows, other shakes, shifted hexagons)
      const at = (smartAt[key] ?? 0) + dir;
      const n = mesh.template === "honingraat" ? (edits[key]?.mesh?.cells ?? []).filter(Boolean).length : mesh.cells.length;
      setMeshKeepCells(key, makeMesh(mesh.template, Math.max(1, n), key, { gap: mesh.gap, bleed: mesh.bleed, variant: ((at % 12) + 12) % 12 }));
      setSmartAt({ ...smartAt, [key]: at });
      return;
    }
    const cells = cellsOf(page);
    const m = PAGE.margin;
    const options = arrangements(cells, { x: m, y: m, w: PAGE.w - 2 * m, h: PAGE.h - 2 * m });
    if (!options.length) return;
    const at = (((smartAt[key] ?? -1) + dir) % options.length + options.length) % options.length;
    // a mesh layout gives way to the arrangement
    const base = Object.fromEntries(Object.entries(edits[key] ?? {}).filter(([slot]) => slot !== "mesh" && !slot.startsWith("cell")));
    let next: Edits = { ...edits, [key]: base };
    for (const [slot, box] of Object.entries(options[at])) next = updateElement(next, key, slot, { ...box, rot: 0 });
    commit(next);
    setSmartAt({ ...smartAt, [key]: at });
  };
  // what a note is about, for people (null: not in this book)
  const pageLabel = (p: Page) => (p.cover ? p.event.title : `${p.event.title} · p. ${p.index + 1}`);
  const labelOf = (n: Note): string | null => {
    const p = book ? allPages(book).find((q) => `${q.event.id}:${q.k}` === n.page) : undefined;
    if (!p) return null;
    if (!n.slot) return pageLabel(p);
    const el = p.elements.find((e) => e.slot === n.slot);
    const what = el?.type === "photo" ? `foto ${el.id}` : el?.type === "caption" ? "tekst" : el?.type === "month" ? "maandtitel" : el?.type === "fill" ? "kleurvlak" : n.slot;
    return `${pageLabel(p)} · ${what}`;
  };
  const noteTarget: NoteTarget | null = (() => {
    if (one && one.kind !== "page") return { page: one.key, slot: one.slot, label: labelOf({ page: one.key, slot: one.slot } as Note) ?? "selectie" };
    const p = one?.page ?? current?.pages.map(({ page }) => page).find((q) => q);
    return p ? { page: `${p.event.id}:${p.k}`, label: pageLabel(p) } : null;
  })();
  const addNote = (t: NoteTarget | null = noteTarget) => {
    if (!t) return;
    const id = newNoteId();
    saveNote(id, newNote(t.page, t.slot));
    setFreshNote(id);
    openPanel("notes");
  };
  const jumpTo = (n: Pick<Note, "page" | "slot">) => {
    const i = slides.findIndex((s) => s.pages.some(({ page }) => page && `${page.event.id}:${page.k}` === n.page));
    if (i >= 0) go(i);
    if (n.slot) setSelection(new Set([`${n.page}|${n.slot}`]));
  };
  const openNotes = Object.values(notes).filter((n) => n.status === "open");
  const noted = new Set(openNotes.map((n) => (n.slot ? `${n.page}|${n.slot}` : n.page)));
  // one side panel at a time: the photo picker, the page menu or the notes
  const openPanel = (which: "swap" | "notes" | null, item?: Item) => {
    setSwapping(which === "swap" && item ? item : null);
    setAddingBg(null);
    setNotesOpen(which === "notes");
  };
  // "Pagina bewerken": the visible page (the left one of a spread, if there is one)
  const selectPage = (side?: "left" | "right") => {
    const pages = items.filter((i) => i.kind === "page");
    const pick = side === "right" ? pages.find((i) => i.dx > 0) ?? pages[0] : side === "left" ? pages.find((i) => i.dx === 0) ?? pages[0] : pages[0];
    if (pick) setSelection(new Set([pick.sel]));
    openPanel(null);
  };
  const togglePick = () => {
    if (!one || one.el.type !== "photo") return;
    const next = { ...(picks ?? {}) };
    if (next[one.page.event.id] === one.el.id) delete next[one.page.event.id];
    else next[one.page.event.id] = one.el.id;
    savePicks.mutate(next);
  };
  const barActions = {
    apply,
    onSwap: () => one && openPanel("swap", one),
    onPick: togglePick,
    pickedHere: !!one && one.el.type === "photo" && picks?.[one.page.event.id] === one.el.id,
    onFront: toFront,
    onBack: toBack,
    tones,
    onNote: () => addNote(),
  };
  const addTarget = () => pageItem?.page ?? one?.page ?? current?.pages.find((p) => p.page)?.page ?? null;
  const addText = () => {
    const target = addTarget();
    if (!target) return;
    const key = `${target.event.id}:${target.k}`;
    const slot = `add${Date.now().toString(36)}`;
    commit(updateElement(edits, key, slot, { add: "caption", box: true, text: "Tekst", x: PAGE.w / 2 - 30, y: PAGE.h / 2 - 8, w: 60, h: 16, size: 5 }));
    setSelection(new Set([`${key}|${slot}`]));
  };
  const addWord = () => {
    const target = addTarget();
    if (!target) return;
    const key = `${target.event.id}:${target.k}`;
    const slot = `word${Date.now().toString(36)}`;
    commit(updateElement(edits, key, slot, { add: "word", text: "Tekst" }));
    setSelection(new Set([`${key}|${slot}`]));
  };
  const addFrame = () => {
    const target = addTarget();
    if (!target) return;
    const key = `${target.event.id}:${target.k}`;
    const slot = `frame${Date.now().toString(36)}`;
    commit(updateElement(edits, key, slot, { add: "frame" }));
    setSelection(new Set([`${key}|${slot}`]));
  };

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [role=dialog], aside")) return;
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
        apply((i) => moveBy(i, dx, dy) ?? {});
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
  // how often each photo is in the books: once per spread (a photo across both pages of a spread
  // is one photo), the covers apart
  const photoIds = (p: Page | null) => (p?.elements ?? []).flatMap((e) => {
    const id = e.type === "photo" ? e.id : e.type === "month" ? e.photo : null;
    return id ? [id] : [];
  });
  const placedIds = new Map<string, number>();
  const onCover = new Set<string>();
  for (const b of books!) {
    for (const sp of b.spreads) for (const id of new Set([...photoIds(sp.left), ...photoIds(sp.right)])) placedIds.set(id, (placedIds.get(id) ?? 0) + 1);
    for (const id of [...photoIds(b.covers.front), ...photoIds(b.covers.back)]) onCover.add(id);
  }

  const onStageClick = (e: React.MouseEvent) => {
    if (editing) return;
    const el = (e.target as Element).closest<SVGElement>("[data-photo]");
    const id = el?.dataset.photo;
    const photo = id ? data.photos.get(id) : undefined;
    if (!photo) return;
    setOpen({ photo, event: data.plan.events.find((ev) => ev.id === el?.dataset.event) ?? null });
  };

  const seg = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-medium ${on ? "bg-ink text-page" : "text-ink-2"}`;
  const pick = "h-9 rounded-full border border-hair bg-surface px-2.5 text-sm";
  const toolbar = !desktop ? (
    <>
      <select aria-label="Deel" value={bookIndex} onChange={(e) => go(0, Number(e.target.value))} className={pick}>
        {books!.map((b, i) => <option key={b.name} value={i}>{b.name}</option>)}
      </select>
      <select aria-label="Modus" value={editing ? "edit" : "view"} className={pick}
        onChange={(e) => {
          const on = e.target.value === "edit";
          setEditing(on);
          if (!on) {
            setSelection(new Set());
            void saver.flush();
          }
        }}>
        <option value="edit">Bewerken</option>
        <option value="view">Bekijken</option>
      </select>
      <select aria-label="Weergave" value={perPage ? "page" : "spread"} onChange={(e) => { setChoice(e.target.value === "page"); go(0); }} className={pick}>
        <option value="page">Pagina's</option>
        <option value="spread">Spreads</option>
      </select>
      <button type="button" onClick={() => setExporting(true)} className={pick}>Exporteren</button>
    </>
  ) : (
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
      <button type="button" onClick={() => { void saver.flush(); setExporting(true); }}
        className="h-[42px] rounded-full bg-surface px-4 text-sm font-medium text-ink-2 ring-1 ring-hair hover:text-ink">
        Exporteren
      </button>
    </>
  );

  return (
    <div className={`mx-auto px-3 pt-3 md:px-6 md:pt-5 ${editing ? "max-w-[1280px]" : ""}`}>
      <BookViewer
        presentation={!editing}
        aside={(() => {
          if (!editing) return undefined;
          const pages = current.pages.map(({ page }) => (page && !page.cover ? page : null));
          const btn = (label: string, onClick: () => void) => (
            <button type="button" onClick={onClick} title={label} aria-label={label}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-md hover:brightness-110 md:h-11 md:w-11">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3h8v10H3zM13 3h8v6h-8zM13 11h8v10h-8zM3 15h8v6H3z" />
              </svg>
            </button>
          );
          if (pages.length === 1) {
            const p = pages[0];
            return p ? { left: btn("Slimme indeling: vorige opmaak", () => smart(p, -1)), right: btn("Slimme indeling: volgende opmaak", () => smart(p, 1)) } : undefined;
          }
          return {
            left: pages[0] ? btn("Slimme indeling: andere opmaak voor de linkerpagina", () => smart(pages[0]!, 1)) : undefined,
            right: pages[1] ? btn("Slimme indeling: andere opmaak voor de rechterpagina", () => smart(pages[1]!, 1)) : undefined,
          };
        })()}
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
              meshes={current.pages.flatMap(({ page, dx }) => {
                const key = page ? `${page.event.id}:${page.k}` : "";
                const m = page ? meshOf(key) : undefined;
                return m ? [{ key, dx, mesh: m }] : [];
              })}
              meshActive={one && (one.kind === "cell" || one.kind === "page") && meshOf(one.key) ? one.key : null}
              noted={noted}
              swapFrom={swapping}
              onSwapWith={(other) => {
                // trade the two photos (wherever they are on the spread)
                const a = swapping!, pa = photoOf(a) ?? "", pb = photoOf(other) ?? "";
                let next = updateElement(edits, a.key, a.slot, { photo: pb, zoom: undefined, focus: undefined });
                next = updateElement(next, other.key, other.slot, { photo: pa, zoom: undefined, focus: undefined });
                commit(next);
                setSwapping(null);
              }}
              onEmpty={(item) => openPanel("swap", item)}
              onNotes={() => setNotesOpen(true)}
              bar={pageItem || !desktop ? null : <SelectionBar selected={selected} a={barActions} />}
              onPreview={setPreview}
              onCommit={commit}
            />
          ) : null
        }
      />
      {editing && !desktop && selected.length > 0 && !pageItem ? (
        <div data-keep-selection className="sticky bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-20 mt-3 flex items-center gap-1 rounded-2xl border border-hair bg-surface p-1 text-ink shadow-lg">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <SelectionBar dock selected={selected} a={barActions} />
          </div>
          <button type="button" onClick={() => setSelection(new Set())} aria-label="Selectie opheffen"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-l border-hair">✕</button>
        </div>
      ) : editing ? (
        <EditBar
          onUndo={undo}
          onRedo={redo}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          snap={snap}
          onSnap={setSnap}
          onAddText={addText}
          onAddFrame={addFrame}
          onAddWord={addWord}
          onPage={() => selectPage()}
          saving={saving}
          notes={openNotes.filter((n) => labelOf(n) !== null).length}
          onNotes={() => openPanel(notesOpen ? null : "notes")}
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
      {editing && !notesOpen && !swapping && !addingBg && pageItem && pageItem.el.type === "fill" && (
        <PagePanel
          title={pageItem.page.cover ? pageItem.page.event.title : `${pageItem.page.event.title}${pageItem.page.k ? ` · pagina ${pageItem.page.k + 1}` : ""}`}
          color={pageItem.el.color}
          tones={tones}
          hasBgPhoto={pageItem.page.elements.some((e) => e.type === "photo" && e.bg)}
          mesh={meshOf(pageItem.key)}
          arrangement={edits[pageItem.key]?.layout?.layout === "collage" ? "collage" : Object.values(edits).some((pe) => Object.values(pe).some((ed) => ed.add === "twin" && ed.of?.startsWith(`${pageItem.key}|`))) || Object.values(edits[pageItem.key] ?? {}).some((ed) => ed.add === "twin") ? "spine" : null}
          canSpine={!!spread && !pageItem.page.cover}
          hasLayout={hasLayout(pageItem.key)}
          copied={copied && copied.from !== pageItem.key ? (() => {
            const from = allPages(book).find((q) => `${q.event.id}:${q.k}` === copied.from);
            return from ? pageLabel(from) : "een andere pagina";
          })() : null}
          sides={current.pages.filter(({ page }) => page).length === 2 ? { current: pageItem.dx > 0 ? "right" : "left", pick: selectPage } : undefined}
          a={{
            onColor: (color) => commit(updateElement(edits, pageItem.key, "pagefill", { color, hidden: undefined })),
            onFullShape: () => commit(updateElement(edits, pageItem.key, "pagefill", { pts: undefined, hidden: undefined })),
            onAddFill: () => {
              const slot = `fill${Date.now().toString(36)}`;
              commit(updateElement(edits, pageItem.key, slot, { add: "fill", color: tones[0] ?? "#f2c94c" }));
              setSelection(new Set([`${pageItem.key}|${slot}`]));
            },
            onBgPhoto: () => {
              const bg = items.find((i) => i.kind === "bg" && i.key === pageItem.key);
              if (bg) setSelection(new Set([bg.sel]));
              else {
                openPanel(null);
                setAddingBg(pageItem.page);
              }
            },
            onTemplate: (t) => setMesh(pageItem.page, pageItem.key, t),
            onCollage: () => setCollage(pageItem.page),
            onSpine: setSpine,
            onClearLayout: () => clearLayout(pageItem.key),
            onCopy: () => setCopied(copyLayout(pageItem.page, edits[pageItem.key])),
            onPaste: () => copied && commit(pasteLayout(edits, pageItem.page, copied)),
            onGap: (gap) => {
              const m = meshOf(pageItem.key);
              if (m) commit(updateElement(edits, pageItem.key, "mesh", { mesh: { ...m, gap } }));
            },
            onBleed: (bleed) => {
              const m = meshOf(pageItem.key);
              if (m) setMeshKeepCells(pageItem.key, makeMesh(m.template, pageEdit?.mesh?.cells?.length ?? m.cells.length, pageItem.key, { gap: m.gap, bleed }));
            },
            onNote: () => addNote({ page: pageItem.key, label: pageLabel(pageItem.page) }),
            onClose: () => setSelection(new Set()),
          }}
        />
      )}
      {editing && notesOpen && (
        <NotesDrawer
          notes={notes}
          labelOf={labelOf}
          target={noteTarget}
          fresh={freshNote}
          onAdd={() => addNote()}
          onSave={saveNote}
          onJump={jumpTo}
          onClose={() => setNotesOpen(false)}
        />
      )}
      {addingBg && (
        <PhotoPicker
          current={undefined}
          event={addingBg.event}
          photos={data.photos}
          events={data.plan.events}
          bookEvents={new Set(book.pages.map((p) => p.event.id))}
          initialScope={addingBg.event.photoIds.length ? "event" : "book"}
          placed={placedIds}
          onCover={onCover}
          onPick={(id) => {
            const key = `${addingBg.event.id}:${addingBg.k}`;
            commit(updateElement(edits, key, `bgphoto${Date.now().toString(36)}`, { add: "photo", photo: id }));
            setAddingBg(null);
          }}
          onClose={() => setAddingBg(null)}
        />
      )}
      {exporting && (
        <ExportModal
          book={book}
          year={YEAR}
          photos={data.photos}
          placed={placedIds}
          notes={openNotes}
          desktop={desktop}
          onJump={(page, slot) => {
            setEditing(true);
            jumpTo({ page, slot });
          }}
          onClose={() => setExporting(false)}
        />
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
          onCover={onCover}
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
