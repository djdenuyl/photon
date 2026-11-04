// A small made-up year for the tests (the real data holds personal photos and stays out of git).
import type { Label, Photo, Photos, Plan, PlanEvent } from "@/lib/types";

const FAMILY = ["Anne", "David", "Lou", "Oos"];

function photo(id: string, date: string, i: number): Photo {
  const landscape = i % 3 !== 1;
  const fam = [FAMILY[i % 4], FAMILY[(i + 1) % 4]].slice(0, 1 + (i % 2));
  const label: Label = {
    family: fam,
    others: i % 5 === 0 ? 2 : 0,
    faces: fam.length + (i % 5 === 0 ? 2 : 0),
    closeup: i % 2 === 1,
    face: [0.5, 0.4],
    objectsOnly: false,
    scenic: i % 7 === 3,
    quality: "goed",
  };
  return { id, file: `${id}.jpg`, taken: `${date}T12:00`, date, time: "12:00", whatsapp: false, thumb: `thumbs/${id}.jpg`, w: landscape ? 4000 : 3000, h: landscape ? 3000 : 4000, label, tone: "#806040" };
}

let counter = 0;
function event(id: string, title: string, category: string, start: string, n: number, spreads = 1): { e: PlanEvent; ps: Photo[] } {
  const ps = Array.from({ length: n }, () => {
    counter++;
    return photo(`p${String(counter).padStart(3, "0")}`, start, counter);
  });
  return {
    ps,
    e: { id, title, category, tradition: null, start, end: start, photoDays: 1, photoIds: ps.map((p) => p.id), summary: title, heroCandidates: [ps[0].id], suggestedSpreads: spreads },
  };
}

/** Five events over the year: a short one, a weekend away, a birthday, the summer holiday, Christmas. */
export function year(): { plan: Plan; photos: Photos } {
  counter = 0;
  const parts = [
    event("Q1-01", "Nieuwjaarsochtend", "dagelijks-leven", "2025-01-02", 6),
    event("Q1-02", "Weekend weg", "weekendje-weg", "2025-02-14", 14, 2),
    event("Q1-03", "Lou jarig", "verjaardag", "2025-03-20", 5),
    event("Q3-01", "Zomervakantie", "zomervakantie", "2025-08-01", 22, 3),
    event("Q4-01", "Kerst", "kerst", "2025-12-24", 8),
  ];
  const photos: Photos = new Map(parts.flatMap((p) => p.ps).map((p) => [p.id, p]));
  const plan: Plan = {
    year: "2025", photos: photos.size, excluded: {}, events: parts.map((p) => p.e),
    themes: [], questions: [], traditions: [], check: { missing: [], double: [], unknown: [] },
  };
  return { plan, photos };
}
