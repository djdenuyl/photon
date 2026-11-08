// Swap: pick a photo by people, close-up, scenery, event or month, or search.
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchJson, jsonBody } from "@/lib/api";
import { Panel } from "./Panel";
import { thumbUrl, YEAR } from "@/lib/data";
import { GOOGLE_PHOTOS_SOURCE, isGooglePhotosMessage } from "@/lib/googlePhotos";
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
  onCover,
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
  /** On how many spreads each photo is (the covers apart). */
  placed: Map<string, number>;
  /** Photos on a cover. */
  onCover: Set<string>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [people, setPeople] = useState<Set<string>>(new Set());
  const [company, setCompany] = useState<Company>("all");
  const [closeup, setCloseup] = useState(false);
  const [scenic, setScenic] = useState(false);
  const [unused, setUnused] = useState(false);
  const [twice, setTwice] = useState(false);
  const [scope, setScope] = useState<Scope>(initialScope);
  const [query, setQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleSession, setGoogleSession] = useState<{ id: string; interval: number } | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleMessage, setGoogleMessage] = useState("");
  useEffect(() => {
    const refresh = () => {
      void fetchJson<{ connected: boolean }>("/api/google-photos/status")
        .then((s) => setGoogleConnected(s.connected))
        .catch(() => setGoogleConnected(false));
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  // The popup that just finished connecting asks what to do next; open the actual picker in
  // it (same tab, no second click) and tell it where, or tell it to close if that fails.
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isGooglePhotosMessage(event.data) || event.data.type !== "connected") return;
      setGoogleConnected(true);
      setGoogleMessage("");
      const popup = event.source as Window | null;
      try {
        setGoogleBusy(true);
        const session = await fetchJson<{ sessionId: string; pickerUri: string }>("/api/google-photos/sessions", { method: "POST" });
        popup?.postMessage({ source: GOOGLE_PHOTOS_SOURCE, type: "continue", pickerUri: `${session.pickerUri}/autoclose` }, event.origin);
        setGoogleSession({ id: session.sessionId, interval: 3 });
        setGoogleMessage("Kies foto's in het Google Foto's-tabblad; Photon importeert ze zodra je klaar bent.");
      } catch {
        popup?.postMessage({ source: GOOGLE_PHOTOS_SOURCE, type: "close" }, event.origin);
        setGoogleMessage("Google Foto's is verbonden, maar de fotokiezer starten lukte niet. Probeer het opnieuw.");
      } finally {
        setGoogleBusy(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const cancelGoogleSession = async () => {
    const session = googleSession;
    if (!session) return;
    setGoogleSession(null);
    setGoogleBusy(false);
    setGoogleMessage("Geannuleerd.");
    try {
      await fetchJson<{ ok: boolean }>(`/api/google-photos/sessions/${session.id}`, { method: "DELETE" });
    } catch {
      // best effort: the picker session also expires on its own
    }
  };
  useEffect(() => {
    if (!googleSession) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const status = await fetchJson<{ mediaItemsSet?: boolean; pollingConfig?: { pollInterval?: string } }>(`/api/google-photos/sessions/${googleSession.id}`);
        if (status.mediaItemsSet) {
          setGoogleBusy(true);
          const result = await fetchJson<{ imported: number; duplicates: number; failed: number }>("/api/google-photos/import", jsonBody("POST", {
            year: YEAR, event_id: event.id, session_id: googleSession.id,
          }));
          await queryClient.invalidateQueries({ queryKey: ["year", YEAR] });
          if (!stopped) {
            const notes = [
              result.duplicates ? `${result.duplicates} stond${result.duplicates === 1 ? "" : "en"} al in Photon` : "",
              result.failed ? `${result.failed} lukte${result.failed === 1 ? "" : "n"} niet, probeer die opnieuw` : "",
            ].filter(Boolean);
            setGoogleMessage(`${result.imported} foto${result.imported === 1 ? "" : "'s"} toegevoegd aan deze gebeurtenis${notes.length ? ` (${notes.join("; ")})` : ""}.`);
            setGoogleSession(null);
            setGoogleBusy(false);
          }
          return;
        }
        const interval = Number.parseFloat(status.pollingConfig?.pollInterval ?? String(googleSession.interval));
        if (!stopped) timer = setTimeout(poll, Math.max(2000, interval * 1000));
      } catch {
        if (!stopped) {
          setGoogleMessage("Foto's importeren via Google Foto's is mislukt. Probeer het opnieuw.");
          setGoogleSession(null);
          setGoogleBusy(false);
        }
      }
    };
    void poll();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [googleSession, event.id, queryClient]);
  const eventOf = useMemo(() => {
    const m = new Map<string, PlanEvent>();
    for (const e of events) for (const id of e.photoIds) m.set(id, e);
    return m;
  }, [events]);
  const months = useMemo(() => [...new Set(events.map((e) => e.start.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort(), [events]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const month = event.start.slice(0, 7);
    return [...photos.values()].filter((p) => {
      const ev = eventOf.get(p.id);
      if (!ev || p.id === current?.id) return false;
      if (monthFilter === "all" && scope === "event" && ev.id !== event.id) return false;
      if (monthFilter === "all" && scope === "month" && ev.start.slice(0, 7) !== month) return false;
      if (scope === "book" && !bookEvents.has(ev.id)) return false;
      if (monthFilter !== "all" && ev.start.slice(0, 7) !== monthFilter) return false;
      const l = p.label ?? {};
      for (const f of people) if (!(l.family ?? []).includes(f)) return false;
      if (company === "us" && (l.others ?? 0) > 0) return false;
      if (company === "others" && !(l.others ?? 0)) return false;
      if (closeup && !l.closeup) return false;
      if (scenic && !l.scenic) return false;
      if (unused && placed.has(p.id)) return false;
      if (twice && (placed.get(p.id) ?? 0) < 2) return false;
      if (q && !`${p.id} ${ev.title} ${ev.summary}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [photos, eventOf, current, event, bookEvents, people, company, closeup, scenic, unused, twice, placed, scope, query, monthFilter]);

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? "border-ink bg-ink text-page" : "border-hair bg-page text-ink-2"}`;
  return (
    <Panel title={current ? "Andere foto kiezen" : "Foto kiezen"} onClose={onClose}
      lead={current && <img src={thumbUrl(current)} alt="" className="h-10 w-10 rounded object-cover" />}
      subtitle={<>{current && <span className="font-mono">{current.id} · </span>}{event.title}</>}>
        <div className="space-y-2 border-b border-hair p-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek op gebeurtenis of foto-nummer…"
            className="w-full rounded-lg border border-hair bg-page px-3 py-2 text-sm" />
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hair bg-page/60 p-2">
            <button type="button" disabled={googleBusy || !!googleSession} onClick={async () => {
              setGoogleMessage("");
              if (!googleConnected) {
                // this tab's popup stays open across connecting *and* picking (see main.tsx /
                // lib/googlePhotos.ts): it asks us what to do next once Google sends it back.
                const next = window.location.pathname + window.location.search;
                const popup = window.open(`/api/google-photos/connect?next=${encodeURIComponent(next)}`, "_blank");
                if (!popup) setGoogleMessage("Sta pop-ups toe om Google Foto's te verbinden.");
                return;
              }
              const popup = window.open("about:blank", "_blank");
              setGoogleBusy(true);
              try {
                const session = await fetchJson<{ sessionId: string; pickerUri: string }>("/api/google-photos/sessions", { method: "POST" });
                if (popup) popup.location.href = `${session.pickerUri}/autoclose`;
                setGoogleSession({ id: session.sessionId, interval: 3 });
                setGoogleMessage("Kies foto's in het Google Foto's-tabblad; Photon importeert ze zodra je klaar bent.");
              } catch {
                popup?.close();
                setGoogleBusy(false);
                setGoogleMessage("Google Foto's starten lukte niet. Controleer de verbinding en probeer opnieuw.");
              }
            }} className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-page disabled:opacity-40">
              {googleBusy ? "Importeren…" : googleConnected ? "+ Google Foto's" : "Google Foto's verbinden"}
            </button>
            {googleSession && !googleBusy && (
              <button type="button" onClick={cancelGoogleSession} className="rounded px-1.5 py-0.5 text-xs text-ink-2 hover:bg-page">Annuleren</button>
            )}
            {googleConnected && !googleSession && <button type="button" onClick={async () => {
              if (!window.confirm("Google Foto's ontkoppelen? Geïmporteerde foto's blijven in Photon staan.")) return;
              try {
                await fetchJson<{ ok: boolean }>("/api/google-photos/connection", { method: "DELETE" });
                setGoogleConnected(false);
                setGoogleMessage("Google Foto's is ontkoppeld. Geïmporteerde foto's blijven in het boek beschikbaar.");
              } catch {
                setGoogleMessage("Ontkoppelen lukte niet. Probeer het opnieuw.");
              }
            }} className="rounded px-1.5 py-0.5 text-xs text-[#d92d20] hover:bg-[#d92d20]/10">Ontkoppelen</button>}
            {googleMessage
              ? <span role="status" className="text-xs text-muted">{googleMessage}</span>
              : <span className="text-xs text-muted">Gekozen foto's worden naar de privéopslag van Photon gekopieerd; het Google Foto's-origineel blijft staan.</span>}
          </div>
          {googleConnected && (
            <p className="text-[11px] text-muted">
              Photon gebruikt Google Foto's-gegevens alleen voor je eigen fotoboek, volgens Google's{" "}
              <a className="underline" href="https://developers.google.com/photos/support/api-policy" target="_blank" rel="noreferrer">
                Limited Use-beperkingen
              </a>.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(event.photoIds.length ? (["event", "month", "book", "year"] as const) : (["book", "year"] as const)).map((s) => (
              <button key={s} type="button" className={chip(scope === s)} onClick={() => setScope(s)}>
                {{ event: "Deze gebeurtenis", month: "Deze maand", book: "Dit boek", year: "Heel het jaar" }[s]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <span>Maand</span>
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-hair bg-page px-2 py-1.5 text-sm text-ink">
              <option value="all">Alle maanden</option>
              {months.map((m) => <option key={m} value={m}>{new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(new Date(`${m}-01T12:00:00`))}</option>)}
            </select>
          </label>
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
            <button type="button" className={chip(unused)} onClick={() => { setUnused(!unused); setTwice(false); }}>nog niet in het boek</button>
            <button type="button" className={chip(twice)} onClick={() => { setTwice(!twice); setUnused(false); }}>meer dan 1× in het boek</button>
          </div>
        </div>
        <div className="p-3">
          <p className="mb-2 text-xs text-muted">{results.length} foto's · staat een foto al in het boek, dan ruilen ze van plek. Of klik een foto op de spread om die twee te ruilen.</p>
          <div className="grid grid-cols-3 gap-1.5 md:grid-cols-3">
            {results.map((p) => (
              <div key={p.id} className="relative overflow-hidden rounded">
                <button type="button" onClick={() => onPick(p.id)} className="relative block overflow-hidden rounded" title={`${p.id} · ${eventOf.get(p.id)?.title ?? ""}`}>
                  <img src={thumbUrl(p)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  {(placed.has(p.id) || onCover.has(p.id)) && (
                    <span className="absolute top-1 left-1 flex flex-wrap gap-0.5">
                      {placed.has(p.id) && <span className="rounded bg-black/60 px-1 text-[10px] text-white">in boek</span>}
                      {(placed.get(p.id) ?? 0) > 1 && <span className="rounded bg-[#e8590c] px-1 text-[10px] font-bold text-white">{placed.get(p.id)}×</span>}
                      {onCover.has(p.id) && <span className="rounded bg-[#5b4bb7] px-1 text-[10px] text-white">op kaft</span>}
                    </span>
                  )}
                  <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white">{p.id}</span>
                </button>
                {p.id.startsWith("g") && (
                  <button type="button" aria-label="Verwijder geïmporteerde foto uit Photon" title="Foto uit Photon verwijderen"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!window.confirm("Verwijder deze foto uit Photon en uit de boekpagina's? De Google Foto's-original blijft staan.")) return;
                      try {
                        await fetchJson<{ ok: boolean }>(`/api/google-photos/${YEAR}/${p.id}`, { method: "DELETE" });
                        await Promise.all([
                          queryClient.invalidateQueries({ queryKey: ["year", YEAR] }),
                          queryClient.invalidateQueries({ queryKey: ["state", YEAR, "edits"] }),
                          queryClient.invalidateQueries({ queryKey: ["state", YEAR, "picks"] }),
                        ]);
                      } catch {
                        setGoogleMessage("De foto kon niet uit Photon worden verwijderd. Probeer het opnieuw.");
                      }
                    }}
                    className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white hover:bg-[#d92d20]/90">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
    </Panel>
  );
}
