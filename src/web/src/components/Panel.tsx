// The one side panel of the editor (photo swap, page menu, notes): a floating card on the right
// on desktop, a sheet above the bottom bar on a phone. It doesn't block the book: the selection
// stays, and the page can still be clicked.
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function Panel({ title, subtitle, lead, onClose, children, label }: {
  title: string;
  subtitle?: ReactNode;
  /** Something before the title (a thumbnail). */
  lead?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  label?: string;
}) {
  return createPortal(
    <aside data-keep-selection aria-label={label ?? title}
      className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+8.5rem)] z-40 flex max-h-[60dvh] flex-col overflow-hidden rounded-2xl border border-hair bg-surface text-ink shadow-xl md:inset-x-auto md:top-24 md:right-4 md:bottom-4 md:max-h-none md:w-96">
      <div className="flex items-center gap-3 border-b border-hair px-4 py-3">
        {lead}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Sluiten" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-page">✕</button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </aside>,
    document.body,
  );
}
