// A photo in the big view, with "make this the big photo" for its event.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { displayUrl, useSaveState, useStateMap } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import type { Photo, PlanEvent } from "@/lib/types";

export function PhotoSheet({ photo, event, onClose }: { photo: Photo; event: PlanEvent | null; onClose: () => void }) {
  const picks = useStateMap("picks").data ?? {};
  const save = useSaveState("picks");
  const chosen = event ? picks[event.id] === photo.id : false;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const toggle = () => {
    if (!event) return;
    const next = { ...picks };
    if (chosen) delete next[event.id];
    else next[event.id] = photo.id;
    save.mutate(next);
    onClose();
  };
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/90" role="dialog" aria-modal="true" aria-label="Foto">
      <button type="button" aria-label="Sluiten" onClick={onClose} className="flex min-h-0 flex-1 items-center justify-center p-3 md:p-8">
        <img src={displayUrl(photo)} alt="" className="max-h-full max-w-full rounded object-contain shadow-2xl" />
      </button>
      <div className="flex flex-wrap items-center gap-3 bg-page px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:px-6">
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate font-semibold">{event?.title ?? photo.file}</div>
          <div className="text-muted">
            {photo.id} · {fmtDate(photo.date)}
            {photo.time ? ` ${photo.time}` : " · WhatsApp"}
          </div>
        </div>
        {event && (
          <button type="button" onClick={toggle} className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${chosen ? "bg-orange text-white" : "bg-ink text-page"}`}>
            {chosen ? "★ Grote foto — terugzetten" : "☆ Maak dit de grote foto"}
          </button>
        )}
        <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-hair px-4 text-sm font-semibold">
          Sluiten
        </button>
      </div>
    </div>,
    document.body,
  );
}
