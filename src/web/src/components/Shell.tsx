// App chrome: desktop header with tabs, mobile bottom tab bar, account sheet.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { fetchJson, type Me } from "@/lib/api";

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

const TABS = [
  { to: "/", label: "Boek", icon: "M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2zM13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5z" },
  { to: "/indeling", label: "Indeling", icon: "M4 6h16M4 12h16M4 18h10" },
  { to: "/gids", label: "Stijlgids", icon: "M5 4h10l4 4v12H5zM15 4v4h4M8 12h8M8 16h6" },
];

function Glyph({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function DesktopHeader({ me }: { me: Me }) {
  return (
    <header className="sticky top-0 z-30 border-b border-hair bg-page/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-6">
        <NavLink to="/" className="font-display text-xl font-semibold">Het Jaar Rond <span className="text-muted">2025</span></NavLink>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/"}
              className={({ isActive }) => `rounded-full px-4 py-1.5 text-sm font-medium ${isActive ? "bg-ink text-page" : "text-ink-2 hover:bg-surface"}`}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          <AccountButton me={me} />
        </div>
      </div>
    </header>
  );
}

export function MobileHeader({ me }: { me: Me }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-hair bg-page/90 px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 backdrop-blur">
      <span className="font-display text-lg font-semibold">Het Jaar Rond <span className="text-muted">2025</span></span>
      <AccountButton me={me} />
    </header>
  );
}

export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hair bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === "/"}
          className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? "text-accent" : "text-muted"}`}
        >
          <Glyph d={t.icon} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

function initial(me: Me): string {
  return (me.name || me.email || "?").trim().charAt(0).toUpperCase();
}

function AccountButton({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-base font-semibold text-page"
      >
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
      <button type="button" aria-label="Sluiten" onClick={onClose} className="absolute inset-0 bg-ink/40 md:bg-ink/15" />
      <div role="dialog" aria-modal="true" aria-label="Account" className="relative w-full rounded-t-3xl bg-page px-5 pt-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] md:m-4 md:mt-16 md:w-80 md:rounded-2xl">
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
