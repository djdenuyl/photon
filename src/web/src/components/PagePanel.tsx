// The page menu, shown when the page itself is selected (a click on an empty spot): its colour
// and the shape of that colour area, extra colour areas, the background photo, and the layouts: a
// mesh of photo cells whose points can be dragged (Raster, Schuin, Honingraat, Banen, Mozaïek), a
// collage, one photo across the spine; copying a page's layout to another page.
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
  onCollage: () => void;
  onSpine: () => void;
  onClearLayout: () => void;
  onCopy: () => void;
  onPaste: () => void;
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
const tile = (on: boolean) => `flex flex-col items-center gap-1 rounded-lg border p-2 text-xs ${on ? "border-ink bg-ink text-page" : "border-hair hover:bg-page"}`;

const TEMPLATES: { id: Mesh["template"]; label: string; hint: string; icon: ReactNode }[] = [
  { id: "raster", label: "Raster", hint: "Rijen binnen de marges; sleep de punten voor schuine lijnen", icon: <path d="M3 3h18v18H3zM3 10h18M3 16h18M10 3v7M14 10v6M8 16v5" /> },
  { id: "schuin", label: "Schuin", hint: "Gebroken vlakken tot in de afloop (zoals 2022, blz. 32–33)", icon: <path d="M3 3h18v18H3zM3 9l9-2 9 4M3 15l7 1 11-3M12 7l-2 9M15 12l2 9" /> },
  { id: "honingraat", label: "Honingraat", hint: "Zeshoeken tot in de afloop (zoals 2022, blz. 3)", icon: <path d="M7 3l4 0 2 4-2 4H7L5 7zM13 11h4l2 4-2 4h-4l-2-4zM7 11l-2 4 2 4" /> },
  { id: "banen", label: "Banen", hint: "Evenwijdige schuine banen", icon: <path d="M3 3h18v18H3zM8 3l-3 18M14 3l-3 18M20 3l-3 18" /> },
  { id: "mozaiek", label: "Mozaïek", hint: "Eén grote foto met kleinere eromheen (zoals 2020–2021)", icon: <path d="M3 3h18v18H3zM14 3v18M14 10h7M14 15h7M17.5 15v6" /> },
];
const COLLAGE_ICON = <path d="M4 6l9-2 1.5 7-9 2zM11 12.5l8.5-1 .8 8-8.5 1zM6.5 13.5l1 6 5-.8" />;
const SPINE_ICON = <path d="M2 4h20v16H2zM12 4v16M2 12h20" />;

export function PagePanel({
  title,
  color,
  tones,
  hasBgPhoto,
  mesh,
  arrangement,
  canSpine,
  hasLayout,
  copied,
  sides,
  a,
}: {
  title: string;
  color: string;
  tones: string[];
  hasBgPhoto: boolean;
  mesh: Mesh | undefined;
  /** A free arrangement on the page (not a mesh). */
  arrangement: "collage" | "spine" | null;
  /** Two facing pages are on screen (for a photo across the spine). */
  canSpine: boolean;
  /** The page's photos are arranged differently from the proposal. */
  hasLayout: boolean;
  /** A copied layout from another page, by that page's name. */
  copied: string | null;
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
      <Section title="Indeling">
        <p className="mb-2 text-xs text-ink-2">Vlakken met gedeelde punten (sleep een punt en de foto's eromheen bewegen mee), een collage, of één foto over de rug van de spread.</p>
        <div className="grid grid-cols-3 gap-1.5">
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" title={t.hint} onClick={() => a.onTemplate(t.id)} className={tile(mesh?.template === t.id)}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
              {t.label}
            </button>
          ))}
          <button type="button" title="Foto's los over elkaar, licht gedraaid, met een witte rand" onClick={a.onCollage} className={tile(arrangement === "collage")}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">{COLLAGE_ICON}</svg>
            Collage
          </button>
          <button type="button" disabled={!canSpine} onClick={a.onSpine} className={`${tile(arrangement === "spine")} disabled:opacity-40`}
            title={canSpine ? "De breedste foto als band over beide pagina's, de rest eronder" : "Kan alleen in de spreadweergave, met twee pagina's"}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">{SPINE_ICON}</svg>
            Over de rug
          </button>
        </div>
        {arrangement === "collage" && <p className="mt-2 text-xs text-ink-2">De blauwe knoppen naast het boek geven een andere collage.</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" className={btn()} onClick={a.onCopy} title="Onthoud de indeling van deze pagina om op een andere pagina te plakken">Indeling kopiëren</button>
          {copied && <button type="button" className={btn()} onClick={a.onPaste} title={`De indeling van ${copied}, met de foto's van deze pagina`}>Plakken (van {copied})</button>}
          {hasLayout && !mesh && <button type="button" className={btn()} onClick={a.onClearLayout}>Terug naar het voorstel</button>}
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
              <button type="button" className={btn()} onClick={a.onClearLayout}>Terug naar het voorstel</button>
            </div>
          </div>
        )}
      </Section>
    </Panel>
  );
}
