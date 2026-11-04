// App chrome: the dark tab bar (desktop), the mobile header and bottom tabs, the year menu,
// the theme toggle and the account sheet.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { fetchJson, type Me } from "@/lib/api";
import { useCreateYear, useYears, YEAR } from "@/lib/data";
import { currentTheme, setTheme } from "@/lib/theme";

const DESKTOP = "(min-width: 768px)";

/** True at tablet/desktop widths. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(DESKTOP).matches,
  );
}

/** The year in the URL (/boek/:year), else this year. */
export function useSelectedYear(): number {
  const { pathname } = useLocation();
  const m = pathname.match(/^\/boek\/(\d{4})/);
  return m ? Number(m[1]) : YEAR;
}

const ICONS = {
  book: "M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2zM13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5z",
  plan: "M4 6h16M4 12h16M4 18h10",
  guide: "M5 4h10l4 4v12H5zM15 4v4h4M8 12h8M8 16h6",
};

function useTabs() {
  const year = useSelectedYear();
  return [
    { to: `/boek/${year}`, label: "Boek", icon: ICONS.book, match: (p: string) => p === "/" || p.startsWith("/boek") },
    { to: "/indeling", label: "Indeling", icon: ICONS.plan, match: (p: string) => p.startsWith("/indeling") },
    { to: "/gids", label: "Stijlgids", icon: ICONS.guide, match: (p: string) => p.startsWith("/gids") },
  ];
}

function Glyph({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Desktop: a dark bar with real tabs; the active tab takes the page colour. */
export function DesktopHeader({ me }: { me: Me }) {
  const { pathname } = useLocation();
  const tabs = useTabs();
  return (
    <header className="sticky top-0 z-30 bg-bar">
      <div className="mx-auto flex h-12 max-w-[1280px] items-end gap-1 px-6">
        <div className="mr-4 flex h-full items-center gap-2 text-page">
          <span className="font-display text-lg font-semibold text-[#f6f4ef]">Het Jaar Rond</span>
          <YearMenu dark />
        </div>
        {tabs.map((t) => (
          <NavLink
            key={t.label}
            to={t.to}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${t.match(pathname) ? "bg-page text-ink" : "text-bar-ink hover:text-[#f6f4ef]"}`}
          >
            {t.label}
          </NavLink>
        ))}
        <div className="ml-auto flex h-full items-center gap-2">
          <ThemeToggle dark />
          <AccountButton me={me} />
        </div>
      </div>
    </header>
  );
}

export function MobileHeader({ me }: { me: Me }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 bg-bar px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
      <span className="font-display text-lg font-semibold text-[#f6f4ef]">Het Jaar Rond</span>
      <YearMenu dark />
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle dark />
        <AccountButton me={me} />
      </div>
    </header>
  );
}

export function TabBar() {
  const { pathname } = useLocation();
  const tabs = useTabs();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hair bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {tabs.map((t) => (
        <NavLink
          key={t.label}
          to={t.to}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${t.match(pathname) ? "text-accent" : "text-muted"}`}
        >
          <Glyph d={t.icon} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

function ThemeToggle({ dark }: { dark?: boolean }) {
  const [theme, setLocal] = useState(currentTheme);
  return (
    <button
      type="button"
      aria-label={theme === "dark" ? "Licht thema" : "Donker thema"}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        setLocal(next);
      }}
      className={`flex h-9 w-9 items-center justify-center rounded-full ${dark ? "text-bar-ink hover:text-[#f6f4ef]" : "text-ink-2"}`}
    >
      ◐
    </button>
  );
}

/** "2025 ▾": every year (earlier books read-only), and "+ Nieuw jaar". */
function YearMenu({ dark }: { dark?: boolean }) {
  const year = useSelectedYear();
  const years = useYears().data ?? [];
  const create = useCreateYear();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };
  const next = Math.max(YEAR, ...years.map((y) => y.year)) + 1;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`rounded-full px-3 py-1 font-display text-lg font-semibold ${dark ? "text-[#f6f4ef] ring-1 ring-white/25 hover:bg-white/10" : "ring-1 ring-hair"}`}
      >
        {year} <span className="text-sm opacity-70">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute top-full left-0 z-50 mt-2 w-64 rounded-xl border border-hair bg-surface p-2 text-ink shadow-xl">
          {years.map((y) => (
            <div key={y.year} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <button type="button" onClick={() => go(`/boek/${y.year}`)}
                className={`font-display text-base font-semibold ${y.year === year ? "text-accent" : ""}`}>
                {y.year}
              </button>
              <span className="text-xs text-muted">{y.source === "albelli" ? "Albelli" : y.source === "new" ? "nieuw" : "Photon"}</span>
              <div className="ml-auto flex gap-1">
                {y.parts.length > 1 &&
                  y.parts.map((p) => (
                    <button key={p.deel} type="button" onClick={() => go(`/boek/${y.year}?deel=${p.deel}`)}
                      className="rounded-full border border-hair px-2 py-0.5 text-xs text-ink-2 hover:bg-page">
                      {p.deel}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <div className="mt-1 border-t border-hair pt-2">
            {adding === null ? (
              <button type="button" onClick={() => setAdding(next)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-accent hover:bg-page">
                + Nieuw jaar
              </button>
            ) : (
              <form
                className="flex gap-2 px-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate(adding, { onSuccess: () => { setAdding(null); go(`/boek/${adding}`); } });
                }}
              >
                <input type="number" value={adding} onChange={(e) => setAdding(Number(e.target.value))} aria-label="Jaar"
                  className="w-24 rounded-lg border border-hair bg-page px-2 py-1 text-sm" />
                <button type="submit" className="rounded-lg bg-ink px-3 py-1 text-sm font-semibold text-page">Maak</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function initial(me: Me): string {
  return (me.name || me.email || "?").trim().charAt(0).toUpperCase();
}

function AccountButton({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Account" aria-haspopup="dialog" onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f6f4ef] font-display text-base font-semibold text-[#161513]">
        {initial(me)}
      </button>
      {open && <AccountSheet me={me} onClose={() => setOpen(false)} />}
    </>
  );
}

function AccountSheet({ me, onClose }: { me: Me; onClose: () => void }) {
  const qc = useQueryClient();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const signOut = async () => {
    await fetchJson("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    localStorage.removeItem("photon-cache");
    qc.clear();
    location.href = "/";
  };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-start md:justify-end">
      <button type="button" aria-label="Sluiten" onClick={onClose} className="absolute inset-0 bg-black/40 md:bg-black/15" />
      <div role="dialog" aria-modal="true" aria-label="Account" className="relative w-full rounded-t-3xl bg-page px-5 pt-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] md:m-4 md:mt-14 md:w-80 md:rounded-2xl">
        <div className="truncate font-semibold">{me.name ?? me.email}</div>
        <div className="truncate text-sm text-muted">{me.email}</div>
        <button type="button" onClick={() => void signOut()} className="mt-5 min-h-12 w-full rounded-xl border border-hair bg-surface font-semibold">
          Uitloggen
        </button>
      </div>
    </div>,
    document.body,
  );
}
