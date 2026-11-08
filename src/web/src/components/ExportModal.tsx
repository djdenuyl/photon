// Export a book for Albelli: first what would print badly (text that doesn't fit, empty frames,
// photos too small for their frame, photos on more than one spread, open notes), each a link to
// its page; then every page as a 300 dpi print file, into a folder or a zip.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { allPages } from "@/lib/edits";
import { canPickFolder, embeddedFonts, folderTarget, overflowingText, printFiles, renderPrintPage, zipTarget, type Target } from "@/lib/export";
import type { Book, Page } from "@/lib/layout";
import type { Note } from "@/lib/notes";
import { LOW_DPI, PRINT_PX, printIssues, type Issue, type IssueKind } from "@/lib/print";
import type { Photos } from "@/lib/types";

const KINDS: Record<IssueKind, { title: string; color: string }> = {
  text: { title: "Tekst past niet", color: "bg-[#e5322d]" },
  empty: { title: "Lege fotokaders", color: "bg-[#e5322d]" },
  resolution: { title: `Foto's te klein om scherp te drukken (onder ${LOW_DPI} dpi)`, color: "bg-[#e5322d]" },
  twice: { title: "Foto's op meer dan één spread", color: "bg-[#e8590c]" },
  note: { title: "Open notities", color: "bg-[#5b4bb7]" },
};

const pageKey = (p: Page) => `${p.event.id}:${p.k}`;

type Run =
  | { state: "idle" }
  | { state: "running"; done: number; total: number }
  | { state: "done"; files: number; fallbacks: string[] }
  | { state: "error"; message: string };

export function ExportModal({ book, year, photos, placed, notes, desktop, onJump, onClose }: {
  book: Book;
  year: number;
  photos: Photos;
  /** On how many spreads each photo is. */
  placed: Map<string, number>;
  notes: Note[];
  desktop: boolean;
  onJump: (pageKey: string, slot?: string) => void;
  onClose: () => void;
}) {
  const pages = useMemo(() => allPages(book), [book]);
  const pageName = (p: Page) => (p.cover ? `Omslag ${p.cover === "front" ? "voorkant" : "achterkant"}` : `Pagina ${book.pages.indexOf(p) + 1}`);

  const [text, setText] = useState<Issue[] | null>(null);
  useEffect(() => {
    let stale = false;
    void overflowingText(pages, photos).then((over) => {
      if (stale) return;
      setText(pages.flatMap((page) => page.elements.filter((e) => e.type === "caption" && over.has(`${pageKey(page)}|${e.slot ?? ""}`)).map((e): Issue => ({ kind: "text", page, slot: e.slot, detail: "De tekst past niet in het kader" }))));
    });
    return () => {
      stale = true;
    };
  }, [pages, photos]);

  const issues = useMemo(() => {
    const byKey = new Map(pages.map((p) => [pageKey(p), p]));
    const noteIssues = notes.flatMap((n): Issue[] => {
      const page = byKey.get(n.page);
      return page && n.status === "open" ? [{ kind: "note", page, slot: n.slot, detail: n.text.trim() || "(lege notitie)" }] : [];
    });
    return [...(text ?? []), ...printIssues(pages, photos, placed), ...noteIssues];
  }, [text, pages, photos, placed, notes]);

  const [run, setRun] = useState<Run>({ state: "idle" });
  const cancelled = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && run.state !== "running" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, run.state]);

  const files = printFiles(book);
  const start = async () => {
    const target: Target | null = canPickFolder() ? await folderTarget() : zipTarget(`Het Jaar Rond ${year} - ${book.name}.zip`);
    if (!target) return;
    cancelled.current = false;
    setRun({ state: "running", done: 0, total: files.length });
    try {
      const fonts = await embeddedFonts();
      const fallbacks = new Set<string>();
      for (const [i, f] of files.entries()) {
        if (cancelled.current) {
          setRun({ state: "idle" });
          return;
        }
        const out = await renderPrintPage(f.page, photos, fonts);
        for (const id of out.fallbacks) fallbacks.add(id);
        await target.write(f.name, out.blob);
        setRun({ state: "running", done: i + 1, total: files.length });
      }
      await target.finish();
      setRun({ state: "done", files: files.length, fallbacks: [...fallbacks] });
    } catch (e) {
      setRun({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const groups = (Object.keys(KINDS) as IssueKind[]).map((kind) => ({ kind, items: issues.filter((i) => i.kind === kind) })).filter((g) => g.items.length);
  const running = run.state === "running";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="Boek exporteren"
      onClick={(e) => e.target === e.currentTarget && !running && onClose()}>
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-hair bg-surface text-ink shadow-xl md:max-h-[85dvh] md:max-w-2xl md:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-hair px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Boek exporteren</div>
            <div className="truncate text-xs text-muted">{book.name} · {book.pages.length} pagina's en de omslag</div>
          </div>
          <button type="button" onClick={onClose} disabled={running} aria-label="Sluiten" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-page disabled:opacity-40">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="space-y-3 px-5 py-4">
            <h2 className="text-sm font-semibold">Controle</h2>
            {text === null && <p className="text-xs text-muted">Tekstkaders controleren…</p>}
            {text !== null && !groups.length && (
              <p className="flex items-center gap-2 text-sm text-[#2f9e44]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                Niets gevonden: klaar om te drukken.
              </p>
            )}
            {groups.map(({ kind, items }) => (
              <div key={kind}>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-ink-2">
                  <span className={`min-w-5 rounded-full px-1.5 text-center text-[11px] text-white ${KINDS[kind].color}`}>{items.length}</span>
                  {KINDS[kind].title}
                </div>
                <ul className="divide-y divide-hair rounded-lg border border-hair">
                  {items.map((i, n) => (
                    <li key={n}>
                      <button type="button" disabled={running}
                        onClick={() => { onJump(pageKey(i.page), i.slot); onClose(); }}
                        className="flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm hover:bg-page disabled:opacity-60">
                        <span className="w-20 shrink-0 text-xs font-medium text-ink-2 md:w-28">{pageName(i.page)}</span>
                        <span className="line-clamp-2 min-w-0 flex-1">{i.detail}</span>
                        <span aria-hidden="true" className="text-muted">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="space-y-2 border-t border-hair px-5 py-4 text-sm">
            <h2 className="font-semibold">Naar Albelli</h2>
            <p className="text-xs text-ink-2">
              Elke pagina wordt een JPEG van {PRINT_PX.w} × {PRINT_PX.h} px: 300 dpi, met 4,5 mm afloop rondom, van de originele foto's.
              Maak in Albelli een leeg Staand L-boek, zet op elke pagina één foto over de hele pagina (tot in de afloop) en plaats de bestanden op volgorde van hun naam.
              De omslag komt als twee helften mee; de rug stel je in Albelli in.
            </p>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-hair px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {run.state === "running" && (
            <div className="min-w-40 flex-1">
              <div className="mb-1 text-xs text-ink-2">Pagina {run.done} van {run.total}…</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-page"><div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${(run.done / run.total) * 100}%` }} /></div>
            </div>
          )}
          {run.state === "done" && (
            <div role="status" className="min-w-0 flex-1 text-xs">
              <span className="font-medium text-[#2f9e44]">Klaar: {run.files} bestanden.</span>
              {run.fallbacks.length > 0 && <span className="text-[#e8590c]"> {run.fallbacks.length} foto's hadden geen origineel in de opslag en komen van de kleinere versie ({run.fallbacks.slice(0, 6).join(", ")}{run.fallbacks.length > 6 ? "…" : ""}).</span>}
            </div>
          )}
          {run.state === "error" && <div role="alert" className="min-w-0 flex-1 text-xs text-[#d92d20]">Exporteren mislukt: {run.message}</div>}
          {run.state === "idle" && <div className="min-w-0 flex-1 text-xs text-muted">{desktop ? `${files.length} bestanden${canPickFolder() ? ", in een map naar keuze" : ", als zip"}.` : "Exporteren gaat op een computer (Chrome of Edge); de controle werkt overal."}</div>}
          {!desktop ? null : running ? (
            <button type="button" onClick={() => { cancelled.current = true; }} className="rounded px-1.5 py-0.5 text-xs text-ink-2 hover:bg-page">Annuleren</button>
          ) : (
            <button type="button" onClick={() => void start()}
              className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-page disabled:opacity-40">
              {canPickFolder() ? "Kies een map en exporteer" : "Exporteer als zip"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
