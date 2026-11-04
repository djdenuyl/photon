// Notes on a page or on one element of it: reminders for yourself ("nog even naar kijken") or
// requests for the agent ("deze pagina anders indelen"). Stored in the `notes` state map, one entry
// per note (id → JSON), saved per note with PATCH. The agent reads and answers them with
// scripts/notes.py (see AGENTS.md).
import { useQueryClient } from "@tanstack/react-query";
import { fetchJson, jsonBody } from "./api";
import { useStateMap, YEAR } from "./data";
import type { StringMap } from "./types";

export interface Note {
  /** The page key (`eventId:k`, or `omslagN-front:0`). */
  page: string;
  /** An element on it (its slot), or none for the page itself. */
  slot?: string;
  text: string;
  to: "me" | "agent";
  status: "open" | "done";
  created: string;
  /** The agent's answer, when it handled the note. */
  reply?: string;
}

export type Notes = Record<string, Note>;

export function parseNotes(raw: StringMap | undefined): Notes {
  const out: Notes = {};
  for (const [id, v] of Object.entries(raw ?? {})) {
    try {
      out[id] = JSON.parse(v) as Note;
    } catch {
      /* skip a broken entry */
    }
  }
  return out;
}

export const newNoteId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** An empty open note for yourself, on a page or one of its elements. */
export const newNote = (page: string, slot?: string): Note => ({ page, slot, text: "", to: "me", status: "open", created: new Date().toISOString() });

/** The notes, and a save (null deletes) that updates the cache first. */
export function useNotes(): { notes: Notes; save: (id: string, note: Note | null) => void } {
  const qc = useQueryClient();
  const raw = useStateMap("notes").data;
  const key = ["state", YEAR, "notes"];
  const save = (id: string, note: Note | null) => {
    const prev = qc.getQueryData<StringMap>(key) ?? {};
    const next = { ...prev };
    if (note) next[id] = JSON.stringify(note);
    else delete next[id];
    qc.setQueryData(key, next);
    void fetchJson<StringMap>(`/api/state/${YEAR}/notes`, jsonBody("PATCH", { [id]: note ? JSON.stringify(note) : null }))
      .then((server) => qc.setQueryData(key, server))
      .catch(() => qc.setQueryData(key, prev));
  };
  return { notes: parseNotes(raw), save };
}
