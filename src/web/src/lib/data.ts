// Queries for the year's data files (/data/<year>/…) and the editable state (/api/state/…).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson, jsonBody } from "./api";
import type { Duplicate, Label, Photo, Photos, Plan, StringMap } from "./types";

export const YEAR = 2025;
const DATA = `/data/${YEAR}/`;

export const thumbUrl = (p: Photo): string => DATA + p.thumb;
/** 1600 px web versions for the big view (originals stay out of the browser). */
export const displayUrl = (p: Photo): string => `${DATA}display/${p.id}.jpg`;

export interface YearData {
  plan: Plan;
  index: Photo[];
  photos: Photos;
  duplicates: Duplicate[];
}

async function loadYear(): Promise<YearData> {
  const get = <T,>(file: string) => fetchJson<T>(DATA + file);
  const [plan, index, labels, tones, duplicates] = await Promise.all([
    get<Plan>("plan.json"),
    get<Photo[]>("index.json"),
    get<Record<string, Label>>("labels.json").catch(() => ({}) as Record<string, Label>),
    get<StringMap>("tones.json").catch(() => ({}) as StringMap),
    get<Duplicate[]>("duplicates.json").catch(() => [] as Duplicate[]),
  ]);
  for (const p of index) {
    p.label = labels[p.id];
    p.tone = tones[p.id];
  }
  return { plan, index, photos: new Map(index.map((p) => [p.id, p])), duplicates };
}

export function useYearData() {
  return useQuery({ queryKey: ["year", YEAR], queryFn: loadYear, staleTime: 10 * 60_000 });
}

export type StateKind = "answers" | "picks" | "edits";

/** One entry in the year menu: an Albelli book (read-only) or a year made in Photon. */
export interface YearEntry {
  year: number;
  parts: { label: string; deel: number }[];
  source: "albelli" | "photon" | "new";
}

interface GraphicsManifest {
  books: { slug: string; name: string }[];
}

/** Every year: the earlier Albelli books (from graphics.json), this year, and years started here. */
export function useYears() {
  return useQuery({
    queryKey: ["years"],
    queryFn: async (): Promise<YearEntry[]> => {
      const [graphics, created] = await Promise.all([
        fetchJson<GraphicsManifest>("/data/albelli/graphics.json").catch(() => ({ books: [] })),
        fetchJson<{ year: number }[]>("/api/years").catch(() => []),
      ]);
      const byYear = new Map<number, YearEntry>();
      for (const b of graphics.books) {
        const year = Number(b.name.slice(0, 4));
        const deel = /deel 2/.test(b.name) ? 2 : 1;
        const entry = byYear.get(year) ?? { year, parts: [], source: "albelli" as const };
        entry.parts.push({ label: b.name.includes("deel") ? `Deel ${deel}` : "Boek", deel });
        byYear.set(year, entry);
      }
      byYear.set(YEAR, { year: YEAR, parts: [{ label: "Deel 1", deel: 1 }, { label: "Deel 2", deel: 2 }], source: "photon" });
      for (const c of created) if (!byYear.has(c.year)) byYear.set(c.year, { year: c.year, parts: [], source: "new" });
      return [...byYear.values()].sort((a, b) => b.year - a.year);
    },
  });
}

export function useCreateYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) => fetchJson<{ year: number }>("/api/years", jsonBody("POST", { year })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["years"] }),
  });
}

export function useStateMap(kind: StateKind) {
  return useQuery({
    queryKey: ["state", YEAR, kind],
    queryFn: () => fetchJson<StringMap>(`/api/state/${YEAR}/${kind}`),
  });
}

/** Replaces the whole map; the cache is updated first so the UI follows at once. */
export function useSaveState(kind: StateKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StringMap) => fetchJson<StringMap>(`/api/state/${YEAR}/${kind}`, jsonBody("PUT", data)),
    onMutate: (data) => qc.setQueryData(["state", YEAR, kind], data),
  });
}
