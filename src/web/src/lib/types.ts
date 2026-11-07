// Shapes of the data files under /data/<year>/ (written by the tools/ pipeline).

export interface Label {
  family?: string[];
  others?: number;
  faces?: number;
  closeup?: boolean;
  /** Centre of the main face(s) as fractions (x, y) of the photo. */
  face?: [number, number] | null;
  objectsOnly?: boolean;
  scenic?: boolean;
  quality?: "goed" | "matig";
}

/** A photo from index.json, enriched with its label and tone. */
export interface Photo {
  id: string;
  file: string;
  taken: string;
  date: string;
  time: string | null;
  whatsapp: boolean;
  thumb: string;
  display?: string;
  w: number;
  h: number;
  similarTo?: string;
  label?: Label;
  tone?: string;
}

export type Photos = Map<string, Photo>;

export interface PlanEvent {
  id: string;
  title: string;
  category: string;
  tradition: string | null;
  start: string;
  end: string;
  photoDays: number;
  photoIds: string[];
  summary: string;
  heroCandidates: string[];
  suggestedSpreads: number;
  confidence?: string;
  notes?: string;
}

export interface Theme {
  title: string;
  idea: string;
  photoIds: string[];
  quarter: string;
}

export interface Question {
  id: string;
  quarter: string;
  question: string;
  photoIds: string[];
}

export interface Plan {
  year: string;
  photos: number;
  excluded: Record<string, string>;
  events: PlanEvent[];
  themes: Theme[];
  questions: Question[];
  traditions: { name: string; events: number }[];
  check: { missing: string[]; double: string[]; unknown: string[] };
}

export interface Duplicate {
  whatsapp: string;
  match: string;
  distance: number;
  verdict: "duplicate" | "similar";
  drop: string;
}

export type StringMap = Record<string, string>;
