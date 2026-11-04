// The notes drawer: every note in this book, open ones first; add one for the selection or the
// visible page, write it, say who it's for (yourself or the agent), tick it off, or jump to it.
import { useState } from "react";
import { Panel } from "./Panel";
import type { Note, Notes } from "@/lib/notes";

export interface NoteTarget {
  page: string;
  slot?: string;
  /** What it is, for people: "Texel · pagina 2", "foto p123". */
  label: string;
}

function NoteCard({ id, note, label, focus, onSave, onJump }: { id: string; note: Note; label: string; focus: boolean; onSave: (n: Note | null) => void; onJump: () => void }) {
  const [draft, setDraft] = useState(note.text);
  const save = () => draft !== note.text && onSave({ ...note, text: draft });
  const done = note.status === "done";
  return (
    <li className={`rounded-xl border p-3 ${done ? "border-hair opacity-60" : note.to === "agent" ? "border-accent/50 bg-accent/5" : "border-[#e8c547]/60 bg-[#fff6cf]/40"}`}>
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <button type="button" onClick={onJump} className="min-w-0 flex-1 truncate text-left font-medium text-ink-2 underline-offset-2 hover:underline" title="Ga naar deze pagina">
          {label}
        </button>
        <span className="text-muted">{new Date(note.created).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</span>
      </div>
      <textarea value={draft} autoFocus={focus} rows={Math.max(2, Math.min(6, draft.split("\n").length))} placeholder="Wat moet hier nog gebeuren?"
        onChange={(e) => setDraft(e.target.value)} onBlur={save}
        className="w-full resize-y rounded-lg border border-hair bg-page px-2 py-1.5 text-sm" aria-label={`Notitie ${id}`} />
      {note.reply && <p className="mt-1.5 rounded-lg bg-page px-2 py-1.5 text-xs text-ink-2"><span className="font-semibold">Agent:</span> {note.reply}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <div className="flex rounded-full bg-page p-0.5 ring-1 ring-hair" role="group" aria-label="Voor wie">
          {(["me", "agent"] as const).map((to) => (
            <button key={to} type="button" aria-pressed={note.to === to} onClick={() => onSave({ ...note, text: draft, to })}
              className={`rounded-full px-2 py-0.5 ${note.to === to ? "bg-ink text-page" : "text-ink-2"}`}>
              {to === "me" ? "Voor mezelf" : "Voor de agent"}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1">
          <input type="checkbox" checked={done} onChange={(e) => onSave({ ...note, text: draft, status: e.target.checked ? "done" : "open" })} />
          Klaar
        </label>
        <button type="button" onClick={() => onSave(null)} className="rounded px-1.5 py-0.5 text-[#d92d20] hover:bg-[#d92d20]/10">Verwijder</button>
      </div>
    </li>
  );
}

export function NotesDrawer({
  notes,
  labelOf,
  target,
  fresh,
  onAdd,
  onSave,
  onJump,
  onClose,
}: {
  notes: Notes;
  /** Only the notes of this book (by page key) are shown. */
  labelOf: (n: Note) => string | null;
  /** What "+ Notitie" attaches to: the selection, else the visible page. */
  target: NoteTarget | null;
  /** A note just added (its text field gets the focus). */
  fresh: string | null;
  onAdd: () => void;
  onSave: (id: string, note: Note | null) => void;
  onJump: (note: Note) => void;
  onClose: () => void;
}) {
  const [showDone, setShowDone] = useState(false);
  const mine = Object.entries(notes)
    .map(([id, n]) => ({ id, n, label: labelOf(n) }))
    .filter((x): x is { id: string; n: Note; label: string } => x.label !== null)
    .sort((a, b) => (a.n.status === b.n.status ? b.n.created.localeCompare(a.n.created) : a.n.status === "open" ? -1 : 1));
  const open = mine.filter((x) => x.n.status === "open");
  const shown = showDone ? mine : open;
  return (
    <Panel title="Notities" subtitle={`${open.length} open · voor jezelf of voor de agent`} onClose={onClose}>
      <div className="flex items-center gap-2 px-4 py-2">
        <button type="button" onClick={onAdd} disabled={!target} className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-page disabled:opacity-40">
          + Notitie{target ? ` bij ${target.label}` : ""}
        </button>
        <label className="ml-auto flex items-center gap-1 text-xs text-ink-2">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Toon afgehandeld
        </label>
      </div>
      <ul className="space-y-2 px-4 pb-4">
        {shown.length === 0 && <li className="py-6 text-center text-sm text-muted">Nog geen notities. Selecteer iets, of laat de selectie leeg voor de hele pagina.</li>}
        {shown.map(({ id, n, label }) => (
          <NoteCard key={id + n.status + n.to} id={id} note={n} label={label} focus={id === fresh} onSave={(note) => onSave(id, note)} onJump={() => onJump(n)} />
        ))}
      </ul>
    </Panel>
  );
}
