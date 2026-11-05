// The page menu, shown when the page itself is selected (a click on an empty spot): its colour
// and the shape of that colour area, extra colour areas, the background photo, and the advanced
// layouts (a mesh of photo cells: Raster, Schuin, Honingraat) whose points can be dragged.
import type { ReactNode } from "react";
import type { Mesh } from "@/lib/mesh";
import { ColorChoice } from "./Editor";
import { Panel } from "./Panel";

export interface PageActions {
  onColor: (c: string) => void;
  onFullShape: () => void;
  onAddFill: () => void;
  onBgPhoto: () => void;
  onTemplate: (t: Mesh["template"] | null) => void;
  onGap: (gap: number) => void;
  onBleed: (bleed: boolean) => void;
  onNote: () => void;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-hair px-4 py-3 first:border-t-0">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

const btn = (on = false) => `rounded-lg border px-2.5 py-1.5 text-sm ${on ? "border-ink bg-ink text-page" : "border-hair hover:bg-page"}`;

const TEMPLATES: { id: Mesh["template"]; label: string; hint: string; icon: ReactNode }[] = [
  { id: "raster", label: "Raster", hint: "Rijen binnen de marges; sleep de punten voor schuine lijnen", icon: <path d="M3 3h18v18H3zM3 10h18M3 16h18M10 3v7M14 10v6M8 16v5" /> },
  { id: "schuin", label: "Schuin", hint: "Gebroken vlakken tot in de afloop (zoals 2022, blz. 32–33)", icon: <path d="M3 3h18v18H3zM3 9l9-2 9 4M3 15l7 1 11-3M12 7l-2 9M15 12l2 9" /> },
  { id: "honingraat", label: "Honingraat", hint: "Zeshoeken tot in de afloop (zoals 2022, blz. 3)", icon: <path d="M7 3l4 0 2 4-2 4H7L5 7zM13 11h4l2 4-2 4h-4l-2-4zM7 11l-2 4 2 4" /> },
];

export function PagePanel({
  title,
  color,
  tones,
  hasBgPhoto,
  mesh,
  sides,
  a,
}: {
  title: string;
  color: string;
  tones: string[];
  hasBgPhoto: boolean;
  mesh: Mesh | undefined;
  /** In a spread: which page this is, and switching to the other one. */
  sides?: { current: "left" | "right"; pick: (side: "left" | "right") => void };
  a: PageActions;
}) {
  return (
    <Panel title="Pagina" subtitle={title} onClose={a.onClose}>
      {sides && (
        <div className="flex gap-1 px-4 pt-3" role="group" aria-label="Welke pagina">
          {(["left", "right"] as const).map((side) => (
            <button key={side} type="button" aria-pressed={sides.current === side} onClick={() => sides.pick(side)}
              className={`flex-1 rounded-lg border px-2 py-1 text-sm ${sides.current === side ? "border-ink bg-ink text-page" : "border-hair hover:bg-page"}`}>
              {side === "left" ? "Linkerpagina" : "Rechterpagina"}
            </button>
          ))}
        </div>
      )}
      <Section title="Achtergrondkleur">
        <ColorChoice value={color} tones={tones} onChange={a.onColor} />
        <button type="button" className={`${btn(color === "transparent")} mt-2`} onClick={() => a.onColor("transparent")}>Geen kleur</button>
      </Section>
      <Section title="Vorm">
        <p className="mb-2 text-xs text-ink-2">
          Sleep de punten voor een andere vorm. Het blokje midden op een zijde: klikken voegt daar een punt toe, slepen verschuift de zijde. Klik een punt aan en tik op het rode kruisje (of Delete) om het te verwijderen.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btn()} onClick={a.onFullShape}>Hele pagina</button>
          <button type="button" className={btn()} onClick={a.onAddFill}>+ Kleurvlak</button>
        </div>
      </Section>
      <Section title="Achtergrondfoto">
        <button type="button" className={btn()} onClick={a.onBgPhoto}>{hasBgPhoto ? "Achtergrondfoto bewerken" : "Achtergrondfoto kiezen"}</button>
      </Section>
      <Section title="Notitie">
        <button type="button" className={btn()} onClick={a.onNote}>Notitie bij deze pagina</button>
      </Section>
      <Section title="Indeling (geavanceerd)">
        <p className="mb-2 text-xs text-ink-2">Foto's als vlakken met gedeelde punten: sleep een punt en alle foto's eromheen bewegen mee, de witte voeg blijft even breed.</p>
        <div className="grid grid-cols-3 gap-1.5">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" title={t.hint} onClick={() => a.onTemplate(t.id)}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs ${mesh?.template === t.id ? "border-ink bg-ink text-page" : "border-hair hover:bg-page"}`}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
              {t.label}
            </button>
          ))}
        </div>
        {mesh && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-ink-2">Sleep de knooppunten in de voegen; + op een voeg voegt er een toe, een aangeklikt knooppunt haal je weg met ×. De blauwe knoppen naast het boek geven een andere variant.</p>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-16 shrink-0 text-ink-2">Voeg</span>
              <input type="range" min={0} max={10} step={0.5} value={mesh.gap} onChange={(e) => a.onGap(Number(e.target.value))} className="flex-1" />
              <span className="w-12 text-right tabular-nums">{mesh.gap} mm</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mesh.bleed} onChange={(e) => a.onBleed(e.target.checked)} />
              Tot in de afloop (geen marge)
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={btn()} onClick={() => a.onTemplate(null)}>Terug naar het voorstel</button>
            </div>
          </div>
        )}
      </Section>
    </Panel>
  );
}
