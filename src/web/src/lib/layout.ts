// First-draft book layout from the event plan, following the style guide (all units in mm).
// Page 210 x 280 with 4.5 mm bleed; outer margin 10, gap 5, photos keep 10 mm from the spine.
// Pure: input is the plan, the photos (with labels and tones) and the chosen big photos.
import type { Label, Photo, Photos, Plan, PlanEvent, StringMap } from "./types";

export const PAGE = { w: 210, h: 280, margin: 10, gap: 5, bleed: 4.5 } as const;
const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
// Events where a big photo fits the style guide: outings, trips, family moments, milestones.
const BIG = new Set(["zomervakantie", "korte-vakantie", "weekendje-weg", "familieweekend", "verjaardag", "feestdag", "kerst", "sinterklaas", "oud-en-nieuw", "mijlpaal-kind", "dagje-uit"]);
const TRIPS = new Set(["zomervakantie", "korte-vakantie", "weekendje-weg", "familieweekend", "dagje-uit"]);
const PARTIES = new Set(["verjaardag", "feestdag", "kerst", "sinterklaas", "oud-en-nieuw", "familieweekend", "zomervakantie"]);
// Exceptions per spread, after the 2022–2024 books (per 10 spreads ≈ 1 photo background,
// 1.3 overlap, 1.4 without margin, 1.2 colour); panoramas across the spine are rarer.
const RATES = { bg: 0.1, overlap: 0.13, nomargin: 0.1, color: 0.12, panorama: 0.06 } as const;
type Style = keyof typeof RATES;
const MAX_PER_PAGE = 8;
// A month title takes part in the grid as a cell "#month:<name>" with the shape of the word.
const MONTH_TOKEN = "#month:";

export interface Box { x: number; y: number; w: number; h: number }
/** Editor bookkeeping on every element: its edit key and its stacking order. */
interface Editable {
  /** The edit key: set by the layout for cover parts, else the photo the layout put here. */
  slot?: string;
  /** Stacking order (higher is in front); the layout order unless edited. */
  z?: number;
}
/** A photo clipped to a shape instead of its rectangle (the cover letters and shards). */
export type Shape = { kind: "letter"; ch: string } | { kind: "poly"; pts: [number, number][]; tint?: string };
export interface Border { w: number; color: string }
export interface PhotoElement extends Box, Editable {
  type: "photo";
  id: string;
  big?: boolean;
  bg?: boolean;
  /** The white frame of the style guide (1.5 mm); `border` overrides it. */
  frame?: boolean;
  border?: Border | null;
  /** Background photos: a white veil (opacity) so they sit behind the photos on top; default 0.25. */
  veil?: number;
  shape?: Shape;
  /** A cell of a mesh layout (its index): shaped by the mesh, not moved on its own. */
  cell?: number;
  /** Editor: zoom inside the frame (1 = just covering it). */
  zoom?: number;
  /** Editor: focus point (fractions of the photo) kept in the middle of the frame. */
  focus?: [number, number];
  /** Editor: frame rotation in degrees. */
  rot?: number;
  /** Editor: the photo turned inside its frame (degrees); it is scaled to keep the frame covered. */
  irot?: number;
  /** The facing page's half of a photo across the spine: drawn here, edited on the other page. */
  twin?: boolean;
}
/** Text filled with a photo: the month titles, and "gevulde tekst" added in the editor (slot
 * "word…"). The text is stretched to its box; a colour fills it instead of the photo. */
export interface MonthElement extends Box, Editable {
  type: "month";
  name: string;
  photo: string | null;
  zoom?: number;
  focus?: [number, number];
  rot?: number;
  irot?: number;
  font?: FontId;
  color?: string;
}
/** A text frame: the text wraps within its width; what doesn't fit is cut off (the editor warns). */
export interface CaptionElement extends Box, Editable {
  type: "caption";
  text: string;
  size?: number;
  color?: string;
  /** Unset: Open Sans with a soft halo (the captions of the earlier books). */
  font?: FontId;
  align?: "left" | "center" | "right";
  rot?: number;
  /** With color "auto": the colour picked for what lies under the text (set by the editor). */
  autoColor?: string;
}
/** A flat colour area (the page background is one, slot "pagefill"); points in mm on the page,
 * its box their bounding box. */
export interface FillElement extends Box, Editable {
  type: "fill";
  color: string;
  pts: [number, number][];
}

/** The fonts text can be set in (all loaded by index.html, and embedded in the print files). */
export type FontId = "sans" | "serif" | "heavy" | "donuts";
export const FONTS: Record<FontId, { label: string; family: string; weight: number }> = {
  sans: { label: "Open Sans", family: "'Open Sans', sans-serif", weight: 400 },
  serif: { label: "Fraunces", family: "'Fraunces', serif", weight: 400 },
  heavy: { label: "League Spartan", family: "'League Spartan', sans-serif", weight: 900 },
  donuts: { label: "Happy Donuts", family: "'HAPPY DONUTS', 'Cooper Black', serif", weight: 400 },
};

/** Font size in points from the page's millimetres (text sizes are in mm, like everything). */
export const toPt = (mm: number): number => (mm * 72) / 25.4;
export const fromPt = (pt: number): number => (pt * 25.4) / 72;

/** The size a filled text's letters get: as tall as the box allows, as wide as its text allows. */
export const filledSize = (e: Pick<MonthElement, "w" | "h" | "name">): number =>
  Math.min(e.h * 1.25, (e.w / (0.85 * Math.max(1, e.name.length))) * 1.25);

/** The white veil over a background photo, as Albelli does (adjustable per photo). */
export const BG_VEIL = 0.25;

export const CAPTION_SIZE = 3.53;
const LINE = 1.25;

/** A one-line text frame sized to its text (an estimate: the text is not measured), placed by
 * its first baseline. The legacy captions had x/y as left (or right, "end") and baseline − 1.7 × size. */
export function captionFrame(text: string, x: number, baseline: number, size = CAPTION_SIZE, font?: FontId, end = false): Box {
  const w = Math.max(6, text.length * size * (font === "donuts" || font === "heavy" ? 0.8 : 0.6) + size);
  const h = size * LINE + size * 0.2;
  return { x: end ? x - w : x, y: baseline - size * 0.95, w, h };
}
export type Element = PhotoElement | MonthElement | CaptionElement | FillElement;

export interface Page {
  event: PlanEvent;
  elements: Element[];
  index: number;
  /** Page number within its event: with the event id the stable key for edits. */
  k: number;
  style: Style | null;
  background?: string;
  cover?: "front" | "back";
}

export interface Spread { label: string; left: Page | null; right: Page | null }

export interface Cover {
  background: string | null;
  letters: { ch: string; photo: string | null }[];
  shards: string[];
  label: string;
}

export interface Book {
  name: string;
  title: string;
  pages: Page[];
  spreads: Spread[];
  index: number;
  cover: Cover;
  /** The cover as two editable pages. */
  covers: { back: Page; front: Page };
}

const aspect = (p: Photo | undefined): number => (p ? p.w / p.h : 1.33);
const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, i) => a + i);
const label = (p: Photo | undefined): Label => p?.label ?? {};
const isScenic = (p: Photo | undefined): boolean => !!label(p).scenic && label(p).quality !== "matig";
const cellAspect = (id: string, photos: Photos): number =>
  id.startsWith(MONTH_TOKEN) ? 0.85 * (id.length - MONTH_TOKEN.length) : aspect(photos.get(id));

function distribute(ids: string[], pages: number): string[][] {
  const out: string[][] = [];
  let i = 0;
  for (let k = 0; k < pages; k++) {
    const n = Math.round((ids.length - i) / (pages - k));
    out.push(ids.slice(i, i + n));
    i += n;
  }
  return out;
}

/** Justified rows filling a box; photos are cropped (cover) to absorb the leftover height. */
export function grid(ids: string[], photos: Photos, box: Box, gap: number = PAGE.gap): PhotoElement[] {
  if (!ids.length) return [];
  const ars = ids.map((id) => cellAspect(id, photos));
  let best: { score: number; groups: number[][]; heights: number[]; used: number } | null = null;
  for (let rows = 1; rows <= Math.min(ids.length, 6); rows++) {
    const groups: number[][] = [];
    let start = 0;
    for (let g = 0; g < rows; g++) {
      const remaining = rows - g;
      if (remaining === 1) {
        groups.push(range(start, ids.length));
        break;
      }
      const target = ars.slice(start).reduce((a, b) => a + b, 0) / remaining;
      let end = start, acc = 0;
      while (end < ids.length - (remaining - 1) && (end === start || acc + ars[end] / 2 < target)) acc += ars[end++];
      groups.push(range(start, end));
      start = end;
    }
    const heights = groups.map((g) => (box.w - gap * (g.length - 1)) / g.reduce((s, i) => s + ars[i], 0));
    const used = heights.reduce((a, b) => a + b, 0) + gap * (groups.length - 1);
    const score = Math.abs(Math.log(box.h / used));
    if (!best || score < best.score) best = { score, groups, heights, used };
  }
  const b = best!;
  const scale = (box.h - gap * (b.groups.length - 1)) / (b.used - gap * (b.groups.length - 1));
  const cells: PhotoElement[] = [];
  let y = box.y;
  b.groups.forEach((g, r) => {
    const h = b.heights[r] * scale;
    let x = box.x;
    const sum = g.reduce((s, i) => s + ars[i], 0);
    g.forEach((i, k) => {
      const w = k === g.length - 1 ? box.x + box.w - x : (box.w - gap * (g.length - 1)) * (ars[i] / sum);
      cells.push({ type: "photo", id: ids[i], x, y, w, h });
      x += w + gap;
    });
    y += h + gap;
  });
  return cells;
}

function pagesFor(event: PlanEvent): number {
  const n = event.photoIds.length;
  let pages = Math.max(1, Math.round((Number(event.suggestedSpreads) || 0.5) * 2));
  pages = Math.min(pages, Math.max(1, Math.ceil(n / 3)));
  return Math.max(pages, Math.ceil(n / MAX_PER_PAGE));
}

/** A muted page colour in the tone of the given photos. */
export function pageTone(ids: string[], photos: Photos): string {
  const rgb = ids
    .map((id) => photos.get(id)?.tone)
    .filter((t): t is string => !!t)
    .map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));
  if (!rgb.length) return "#cfc8bb";
  const [r, g, b] = [0, 1, 2].map((i) => rgb.reduce((s, c) => s + c[i], 0) / rgb.length);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return `hsl(${Math.round(h * 60 + 360) % 360} ${Math.round(Math.min(s, 0.4) * 100)}% ${Math.round(Math.max(0.42, Math.min(l, 0.62)) * 100)}%)`;
}

interface Sequenced { event: PlanEvent; n: number }

/**
 * Page counts and order. An event of two pages or more always starts on a left page. If it would
 * start on a right page: a one-page event from the same month moves forward, or the event shrinks
 * to one page when it fits, or the previous event gets a page more. Half-spread events may start
 * on either side.
 */
function sequence(events: PlanEvent[]): Sequenced[] {
  const queue: Sequenced[] = events.map((event) => ({ event, n: pagesFor(event) }));
  const out: Sequenced[] = [];
  let pos = 0; // page index; 0 is page 1 (a right page), odd indices are left pages
  while (queue.length) {
    const item = queue.shift()!;
    if (item.n >= 2 && pos > 0 && pos % 2 === 0) {
      const prev = out[out.length - 1];
      const month = item.event.start.slice(0, 7);
      const j = queue.slice(0, 4).findIndex((q) => q.n === 1 && q.event.start.slice(0, 7) === month);
      if (j >= 0) {
        // Prefer pulling a one-page event of the same month forward: no extra pages.
        const filler = queue.splice(j, 1)[0];
        out.push(filler);
        pos += filler.n;
      } else if (item.event.photoIds.length <= MAX_PER_PAGE) {
        item.n = 1; // fits on one page, which may start on the right
      } else if (prev && prev.event.photoIds.length >= 2 * (prev.n + 1)) {
        prev.n += 1;
        pos += 1;
      }
    }
    out.push(item);
    pos += item.n;
  }
  return out;
}

interface Planned extends Sequenced { style: Style | null; scenic?: string; landscapeHero?: string }

/** Decide the exceptions per event so they follow the measured rates and never sit next to each other. */
function planStyles(items: Sequenced[], photos: Photos): Planned[] {
  const used: Record<Style, number> = { bg: 0, overlap: 0, nomargin: 0, color: 0, panorama: 0 };
  let spreads = 0, cooldown = 0;
  return items.map(({ event, n }) => {
    spreads += n / 2;
    cooldown -= n;
    const ids = event.photoIds;
    const scenic = ids.find((id) => isScenic(photos.get(id)));
    const landscapeHero = (event.heroCandidates || []).find((id) => aspect(photos.get(id)) > 1.3);
    const eligible: Style[] = [];
    if (scenic && ids.length >= 4) eligible.push("bg");
    if (landscapeHero && n >= 2 && BIG.has(event.category)) eligible.push("panorama");
    if (n >= 2 && ids.length >= 8 && PARTIES.has(event.category)) eligible.push("overlap");
    if (event.category === "dagelijks-leven" || TRIPS.has(event.category)) eligible.push("nomargin");
    eligible.push("color");
    let style: Style | null = null;
    if (cooldown <= 0) {
      const deficits = eligible.map((s) => [s, RATES[s] * spreads - used[s]] as const).sort((a, b) => b[1] - a[1]);
      if (deficits[0][1] > 0.4) style = deficits[0][0];
    }
    if (style) {
      used[style]++;
      cooldown = 2; // at least one plain spread after an exception
    }
    return { event, n, style, scenic, landscapeHero };
  });
}

export function buildBooks(plan: Plan, photos: Photos, picks: StringMap = {}): Book[] {
  const parts = [
    { name: "Deel 1", events: plan.events.filter((e) => e.start < "2025-07-01") },
    { name: "Deel 2", events: plan.events.filter((e) => e.start >= "2025-07-01") },
  ];
  return parts.map((part, bi) => {
    const pages: Page[] = [];
    let lastMonth: number | null = null;
    const m = PAGE.margin, g = PAGE.gap, B = PAGE.bleed;
    const full: Box = { x: -B, y: -B, w: PAGE.w + 2 * B, h: PAGE.h + 2 * B };

    for (const planned of planStyles(sequence(part.events), photos)) {
      const { event, n } = planned;
      let { style } = planned;
      const month = event.start.startsWith("2025") ? +event.start.slice(5, 7) - 1 : null;
      const opensMonth = month !== null && month !== lastMonth;
      const startsLeft = pages.length % 2 === 1;
      if (style === "panorama" && !startsLeft) style = null; // a panorama needs both pages of a spread
      const picked = picks[event.id];
      // A big photo you picked wins over an automatic exception that has no place for it.
      if (picked && style !== "panorama" && style !== "overlap") style = null;
      let hero: string | undefined = picked || (!style && n >= 2 && BIG.has(event.category) ? event.heroCandidates?.[0] : undefined);
      if (style === "panorama") hero = picked && aspect(photos.get(picked)) > 1.3 ? picked : planned.landscapeHero;
      if (style === "overlap") hero = picked || event.heroCandidates?.[0];
      const spreadWide = (style === "panorama" || style === "bg") && startsLeft && n >= 2;
      const bgPhoto = style === "bg" ? planned.scenic : undefined;
      const reserved = new Set([hero, bgPhoto].filter(Boolean));
      const rest = event.photoIds.filter((id) => !reserved.has(id));
      const fullPage = !style && !!hero && aspect(photos.get(hero)) < 1 && n >= 2;
      const chunks = distribute(rest, Math.max(1, fullPage ? n - 1 : n));
      let monthFill: string | null = null;
      if (opensMonth && month !== null) {
        // The title goes into the photo grid, alternating top / middle / bottom, so it never leaves a gap.
        monthFill = event.photoIds.find((id) => aspect(photos.get(id)) > 1.2 && !label(photos.get(id)).objectsOnly) ?? event.photoIds[0];
        const target = chunks[style === "overlap" && chunks.length > 1 ? 1 : 0];
        const at = [0, Math.floor(target.length / 2), target.length][month % 3];
        target.splice(at, 0, MONTH_TOKEN + MONTHS[month]);
        lastMonth = month;
      }

      for (let k = 0; k < n; k++) {
        const special = k === 0 || (spreadWide && k === 1);
        const page: Page = { event, elements: [], index: pages.length, k, style: special ? style : null };
        const isLeft = pages.length % 2 === 1;
        const box: Box = { x: m, y: m, w: PAGE.w - 2 * m, h: PAGE.h - 2 * m };
        const ids = fullPage && k === 0 ? [] : chunks.shift() ?? [];
        const add = (...els: Element[]) => page.elements.push(...els);
        const carry = (extra: string[]) => {
          if (extra.length && chunks.length) chunks[0].unshift(...extra);
        };

        // Backgrounds first.
        if (style === "bg" && special && bgPhoto) {
          add({ type: "photo", id: bgPhoto, x: spreadWide && !isLeft ? -PAGE.w - B : -B, y: -B, w: spreadWide ? 2 * PAGE.w + 2 * B : PAGE.w + 2 * B, h: PAGE.h + 2 * B, bg: true });
        } else if (style === "color" && k === 0) {
          page.background = pageTone(event.photoIds, photos);
        }

        if (style === "panorama" && spreadWide && k <= 1 && hero) {
          // One landscape photo across the spine, grids below on both pages.
          const h = Math.min(130, (2 * PAGE.w - 2 * m) / aspect(photos.get(hero)));
          add({ type: "photo", id: hero, x: k === 0 ? m : m - PAGE.w, y: m, w: 2 * PAGE.w - 2 * m, h, big: true });
          const top = m + h + g;
          add(...grid(ids, photos, { x: m, y: top, w: PAGE.w - 2 * m, h: PAGE.h - m - top }));
        } else if (style === "bg" && special) {
          // Photos on a scenic background: a lighter grid with white frames.
          // Keep it light (4 photos) when a next page can take the rest; otherwise place all.
          const few = chunks.length ? ids.slice(0, 4) : ids;
          carry(ids.slice(few.length));
          const top = isLeft ? 150 : 18;
          const area = isLeft ? { x: 18, y: top, w: 174, h: PAGE.h - 18 - top } : { x: 18, y: top, w: 174, h: 118 };
          add(...grid(few, photos, area).map((c) => ({ ...c, frame: true })));
        } else if (style === "overlap" && k === 0 && hero) {
          // Collage: one full-bleed photo with smaller photos overlapping it.
          add({ type: "photo", id: hero, ...full, big: true });
          const small = chunks.length ? ids.slice(0, 3) : ids.slice(0, 5);
          carry(ids.slice(small.length));
          small.forEach((id, i) => {
            const w = 72, h = w / Math.max(0.75, Math.min(1.5, aspect(photos.get(id))));
            // A loose stack along the outer edge: each photo overlaps the previous one a little.
            add({ type: "photo", id, x: PAGE.w - m - w - (i % 2) * 22, y: PAGE.h - m - h - i * (h * 0.85 + 4), w, h, frame: true });
          });
        } else if (style === "nomargin" && k === 0) {
          add(...grid(ids, photos, full));
        } else if (k === 0 && fullPage && hero) {
          add({ type: "photo", id: hero, ...full, big: true });
        } else if (k === 0 && hero && !style) {
          const h = Math.min(box.h * 0.55, box.w / Math.max(aspect(photos.get(hero)), 1.2));
          add({ type: "photo", id: hero, x: box.x, y: box.y, w: box.w, h, big: true });
          add(...grid(ids, photos, { x: box.x, y: box.y + h + g, w: box.w, h: box.h - h - g }));
        } else {
          add(...grid(ids, photos, box));
        }

        page.elements = page.elements.map((e): Element =>
          e.type === "photo" && e.id.startsWith(MONTH_TOKEN)
            ? { type: "month", name: e.id.slice(MONTH_TOKEN.length), photo: monthFill, x: e.x, y: e.y, w: e.w, h: e.h }
            : e,
        );
        if (k === 0) {
          const photosOnPage = page.elements.filter((e): e is PhotoElement => e.type === "photo");
          const first = photosOnPage.find((e) => !e.bg && !e.big) ?? photosOnPage[0];
          if (first) {
            const x = Math.max(first.x + 4, m + 4), y = Math.min(first.y + first.h - 10, PAGE.h - m - 10);
            add({ type: "caption", text: event.title, ...captionFrame(event.title, x, y + 1.7 * CAPTION_SIZE) });
          }
        }
        pages.push(page);
      }
    }
    const spreads: Spread[] = [{ label: "1", left: null, right: pages[0] ?? null }];
    for (let i = 1; i < pages.length; i += 2) spreads.push({ label: `${i + 1} / ${i + 2}`, left: pages[i], right: pages[i + 1] ?? null });
    const cover = buildCover(part.events, bi, photos);
    return { name: part.name, title: `Het Jaar Rond 2025 - ${part.name.toLowerCase()}`, pages, spreads, index: bi, cover, covers: coverPages(cover, bi) };
  });
}

/* ---------- cover ---------- */

const FAMILY = ["Anne", "David", "Lou", "Oos"];

interface Candidate { id: string; event: PlanEvent; p: Photo | undefined }

function buildCover(events: PlanEvent[], bi: number, photos: Photos): Cover {
  const all: Candidate[] = events.flatMap((e) => e.photoIds.map((id) => ({ id, event: e, p: photos.get(id) })));
  const good = (c: Candidate) => !!c.p && label(c.p).quality !== "matig" && !label(c.p).objectsOnly;
  const fam = (c: Candidate) => (label(c.p).family ?? []).filter((f) => FAMILY.includes(f));

  // Front background: a scenic photo from a trip.
  const background = (all.find((c) => isScenic(c.p) && TRIPS.has(c.event.category)) ?? all.find((c) => isScenic(c.p)))?.id ?? null;

  // Letters: a mix of us with friends and family (about 60%) and just the four of us (about 40%);
  // people on every photo, each event at most once, never the same family member next to or above another.
  const withPeople = all.filter((c) => good(c) && (label(c.p).faces ?? 0) >= 1);
  const score = (c: Candidate) => (fam(c).length ? 2 : 0) + (label(c.p).closeup ? 1.5 : 0) + Math.min(label(c.p).faces ?? 0, 4) * 0.25;
  const byScore = (a: Candidate, b: Candidate) => score(b) - score(a);
  const social = withPeople.filter((c) => (label(c.p).others ?? 0) > 0).sort(byScore);
  const own = withPeople.filter((c) => !label(c.p).others && fam(c).length).sort(byScore);
  const OWN_SLOTS = new Set([1, 3, 7, 9, 11, 13]); // spread the family-only photos over the letters
  const letters: (Candidate | null)[] = [];
  const usedEvents = new Set<string>(), usedIds = new Set<string>();
  [..."HETJAARROND2025"].forEach((_, i) => {
    const neighbours = [i % 3 ? letters[i - 1] : null, i >= 3 ? letters[i - 3] : null].filter((n): n is Candidate => !!n);
    const clash = (c: Candidate) => neighbours.some((nb) => fam(nb).some((f) => fam(c).includes(f)));
    const order = OWN_SLOTS.has(i) ? [own, social] : [social, own];
    let pick: Candidate | undefined;
    for (const relax of [0, 1, 2]) {
      for (const pool of order) {
        pick = pool.find((c) => !usedIds.has(c.id) && (relax > 0 || !usedEvents.has(c.event.id)) && (relax > 1 || !clash(c)));
        if (pick) break;
      }
      if (pick) break;
    }
    if (pick) {
      usedIds.add(pick.id);
      usedEvents.add(pick.event.id);
    }
    letters.push(pick ?? null);
  });

  // Back: four close-ups, each with exactly two family members, every duo different.
  const shards: string[] = [];
  const duos = new Set<string>();
  for (const strict of [true, false]) {
    for (const c of all) {
      if (shards.length === 4) break;
      const l = label(c.p);
      const pair = fam(c).sort().join("+");
      if (!good(c) || !l.closeup || fam(c).length !== 2 || duos.has(pair) || usedIds.has(c.id)) continue;
      if (strict && l.others) continue;
      duos.add(pair);
      usedIds.add(c.id);
      shards.push(c.id);
    }
  }
  return {
    background,
    letters: [..."HETJAARROND2025"].map((ch, i) => ({ ch, photo: letters[i]?.id ?? null })),
    shards,
    label: `DEEL ${bi + 1}`,
  };
}

/* ---------- rendering (SVG strings) ---------- */

export type UrlFor = (p: Photo) => string;

/** Where a photo sits to cover a box (zoomed), keeping the focus point (an edit, else the
 * labelled face, else the upper centre) as close to the middle as the edges allow. */
export function placement(photo: Photo, box: Box, zoom = 1, focus?: [number, number]): Box {
  const ar = aspect(photo);
  const [fx, fy] = focus ?? label(photo).face ?? [0.5, 0.42];
  let w = box.w, h = box.w / ar;
  if (h < box.h) {
    h = box.h;
    w = h * ar;
  }
  w *= zoom;
  h *= zoom;
  const x = Math.min(box.x, Math.max(box.x + box.w - w, box.x + box.w / 2 - fx * w));
  const y = Math.min(box.y, Math.max(box.y + box.h - h, box.y + box.h / 2 - fy * h));
  return { x, y, w, h };
}

/** A frame without a photo: a light area with a photo icon in the middle. */
function emptyFrame({ x, y, w, h }: Box): string {
  const s = Math.max(6, Math.min(w, h) * 0.28), k = s / 24;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ebe7df"/><g transform="translate(${x + w / 2 - s / 2} ${y + h / 2 - s / 2}) scale(${k})" fill="none" stroke="#b3ab9c" stroke-width="1.6" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M2.5 16l5.5-5.5 4.5 4.5 3-3 6 6"/><circle cx="16" cy="9.5" r="1.8" fill="#b3ab9c" stroke="none"/></g>`;
}

/** <image> placed to cover a box (see `placement`). */
function placed(photo: Photo | undefined, box: Box, url: UrlFor, zoom = 1, focus?: [number, number], irot = 0): string {
  if (!photo) return emptyFrame(box);
  const { x, y, w, h } = placement(photo, box, zoom, focus);
  const turn = irot ? ` transform="rotate(${irot} ${box.x + box.w / 2} ${box.y + box.h / 2})"` : "";
  return `<image href="${url(photo)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"${turn}/>`;
}


const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const uid = () => Math.random().toString(36).slice(2, 8);

const SHARDS = ["0,0 132,0 96,148 0,118", "132,0 210,0 210,176 96,148", "0,118 96,148 122,280 0,280", "96,148 210,176 210,280 122,280"];
const TINTS = ["#73ebff", "#fffa5f", "#e17dcd", "#7bff6b"];

function bbox(pts: string): Box {
  const xy = pts.split(" ").map((p) => p.split(",").map(Number));
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// Front: the metrics of the 2022 Inkscape original. HAPPY DONUTS 52.45, scaled x1.2025 / y0.8316,
// left-aligned columns at x 21.5 / 76.6 / 131.6 and baselines at 66.2 + 65.75·row (before scaling),
// the group 15.9 mm left and 11 mm up (ink from 7.5 to 271 mm, as on the 2022 cover). A solid
// black letter sits 1.3/1.5 mm right/down under each photo letter. A letter's box is the ink of
// its glyph (so the photo can be panned right up to the letter's edges); the glyph scales with
// the box height.
const LSX = 1.2025, LSY = 0.8316, LFS = 52.45;
/** HAPPY DONUTS ink per glyph, in em: left of the origin, right of it, above and below the baseline
 * (measured with canvas measureText). */
const GLYPHS: Record<string, [number, number, number, number]> = {
  "0": [0, 0.875, 0.828, 0.234], "1": [0, 0.406, 0.844, 0.203], "2": [0, 0.844, 0.844, 0.219], "3": [-0.016, 0.906, 0.828, 0.234],
  "4": [0, 0.938, 0.844, 0.203], "5": [-0.031, 0.828, 0.828, 0.203], "6": [-0.078, 1.078, 0.828, 0.266], "7": [0, 0.781, 0.828, 0.203],
  "8": [-0.109, 0.891, 0.844, 0.219], "9": [-0.141, 0.953, 0.828, 0.219], A: [0, 0.938, 0.859, 0.203], D: [0, 0.984, 0.844, 0.203],
  E: [0, 0.969, 0.844, 0.203], H: [0, 0.984, 0.844, 0.219], J: [0, 1.016, 0.844, 0.203], N: [0, 0.969, 0.844, 0.203],
  O: [0, 0.984, 0.844, 0.203], R: [0, 0.953, 0.844, 0.203], T: [0, 0.922, 0.859, 0.203],
};
const glyph = (ch: string) => GLYPHS[ch] ?? [0, 0.95, 0.844, 0.21];

function coverEvent(id: string, title: string): PlanEvent {
  return { id, title, category: "omslag", tradition: null, start: "", end: "", photoDays: 0, photoIds: [], summary: "", heroCandidates: [], suggestedSpreads: 0 };
}

/** The cover as two pages of ordinary (editable) elements. */
export function coverPages(cover: Cover, bi: number): { back: Page; front: Page } {
  const page = (side: "front" | "back", elements: Element[]): Page => ({
    event: coverEvent(`omslag${bi + 1}-${side}`, side === "front" ? "Voorkant" : "Achterkant"),
    elements, index: -1, k: 0, style: null, background: "#777", cover: side,
  });
  const col = (i: number) => 21.5 + 55.05 * (i % 3), base = (i: number) => 66.2 + 65.75 * Math.floor(i / 3);
  const letters = cover.letters.map((l, i): PhotoElement => {
    const [left, right, up, down] = glyph(l.ch);
    const tx = col(i) - 15.9 / LSX, ty = base(i) - 11 / LSY;
    return {
      type: "photo", id: l.photo ?? "", slot: `letter${i}`, shape: { kind: "letter", ch: l.ch },
      x: (tx - left * LFS) * LSX, y: (ty - up * LFS) * LSY, w: (left + right) * LFS * LSX, h: (up + down) * LFS * LSY,
    };
  });
  const front: Element[] = [
    { type: "photo", id: cover.background ?? "", slot: "background", x: -PAGE.bleed, y: -PAGE.bleed, w: PAGE.w + 2 * PAGE.bleed, h: PAGE.h + 2 * PAGE.bleed, bg: true },
    ...letters,
    { type: "caption", text: cover.label, slot: "label", ...captionFrame(cover.label, 196, 270, 7.3, "donuts", true), size: 7.3, color: "#000", font: "donuts", align: "right" },
  ];
  const back = SHARDS.map((pts, i): PhotoElement => {
    const xy = pts.split(" ").map((q) => q.split(",").map(Number));
    const box = bbox(pts);
    return {
      type: "photo", id: cover.shards[i] ?? "", slot: `shard${i}`, ...box,
      shape: { kind: "poly", tint: TINTS[i], pts: xy.map(([x, y]): [number, number] => [(x - box.x) / box.w, (y - box.y) / box.h]) },
    };
  });
  return { back: page("back", back), front: page("front", front) };
}

const DONUTS = FONTS.donuts.family;

/** The clip outline (and what goes under/over the photo) of a shaped photo. */
function shapeParts(e: PhotoElement & { shape: Shape }): { clip: string; under: string; over: string } {
  if (e.shape.kind === "letter") {
    const [left, , up, down] = glyph(e.shape.ch);
    const k = e.h / ((up + down) * LFS * LSY), fs = LFS * k, ch = esc(e.shape.ch);
    const text = (attrs: string, dx = 0, dy = 0) =>
      `<text x="${(e.x + dx) / LSX + left * fs}" y="${(e.y + dy) / LSY + up * fs}" transform="scale(${LSX} ${LSY})" font-family="${DONUTS}" font-size="${fs}" ${attrs}>${ch}</text>`;
    return { clip: text(""), under: text('fill="#000"', 1.3 * k, 1.5 * k), over: "" };
  }
  const pts = bledPoly(e, e.shape.pts).map((q) => q.join(",")).join(" ");
  // a polygon photo keeps its frame: the outline drawn twice as wide under the photo
  const border = e.border !== undefined ? e.border : e.frame ? { w: 1.5, color: "#fff" } : null;
  const under = border && border.w > 0 ? `<polygon points="${pts}" fill="${border.color}" stroke="${border.color}" stroke-width="${2 * border.w}" stroke-linejoin="miter"/>` : "";
  return { clip: `<polygon points="${pts}"/>`, under, over: e.shape.tint ? `<polygon points="${pts}" fill="${e.shape.tint}" opacity=".2"/>` : "" };
}

/** A polygon photo's outline (`pts` as fractions of its frame) on the page, carried on into the
 * bleed where it touches the page's edge, like a colour area. */
function bledPoly(e: Box, pts: [number, number][]): [number, number][] {
  return intoBleed(pts.map(([u, v]): [number, number] => [e.x + u * e.w, e.y + v * e.h]));
}

/** The box a photo is placed to cover: its frame, or for a polygon photo touching the page's edge
 * its outline including the bleed, so the photo reaches the cut. A photo turned inside its frame
 * covers the box's turned bounding box (same centre), so no corner of the frame is left empty. */
export function photoBox(e: Element): Box {
  if (e.type === "fill" || e.type === "caption") return { x: e.x, y: e.y, w: e.w, h: e.h };
  let box: Box = e;
  if (e.type === "photo" && e.shape?.kind === "poly") {
    const pts = bledPoly(e, e.shape.pts);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    box = { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return turned(box, e.irot ?? 0);
}

function turned(box: Box, deg: number): Box {
  if (!deg) return box;
  const a = (deg * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const w = box.w * c + box.h * s, h = box.w * s + box.h * c;
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

/**
 * A colour area's outline as printed: points on the page's edge go on into the bleed so the colour
 * reaches the cut. A point where a slanted side meets the edge slides along that side's own line,
 * so the side stays exactly where it was drawn; a point between two sides along the edge (or a
 * corner) moves straight out.
 */
export function intoBleed(pts: [number, number][]): [number, number][] {
  const B = PAGE.bleed, W = PAGE.w, H = PAGE.h, eps = 0.01;
  const sides = ([x, y]: [number, number]) => [x <= eps && "l", x >= W - eps && "r", y <= eps && "t", y >= H - eps && "b"].filter(Boolean) as string[];
  const along = (a: [number, number], b: [number, number]) => sides(a).some((s) => sides(b).includes(s));
  const n = pts.length;
  return pts.map((p, i) => {
    const on = sides(p);
    if (!on.length) return p;
    const nb = [pts[(i - 1 + n) % n], pts[(i + 1) % n]];
    const inward = nb.filter((q) => !along(p, q));
    if (inward.length === 1) {
      // slide away from the inner neighbour along their line, up to the bleed's edge
      const q = inward[0], dx = p[0] - q[0], dy = p[1] - q[1];
      const ts = [dx < 0 ? (-B - p[0]) / dx : dx > 0 ? (W + B - p[0]) / dx : Infinity, dy < 0 ? (-B - p[1]) / dy : dy > 0 ? (H + B - p[1]) / dy : Infinity];
      const t = Math.min(...ts);
      if (Number.isFinite(t)) return [p[0] + dx * t, p[1] + dy * t];
    }
    if (inward.length === 2) return p; // a spike touching the edge
    return [on.includes("l") ? -B : on.includes("r") ? W + B : p[0], on.includes("t") ? -B : on.includes("b") ? H + B : p[1]];
  });
}

/** The inside of one page (210 × 280 user units, clipped by the caller). */
export function pageBody(p: Page, photos: Photos, url: UrlFor): string {
  const id = `pg${uid()}`;
  // white paper; the page colour is a "pagefill" element once the edits are applied
  const parts = [`<rect x="-5" y="-5" width="${PAGE.w + 10}" height="${PAGE.h + 10}" fill="${p.background ?? "#fff"}"/>`];
  for (const e of p.elements) {
    if (e.type === "fill") {
      if (e.color !== "transparent") parts.push(`<polygon points="${intoBleed(e.pts).map((q) => q.join(",")).join(" ")}" fill="${e.color}"/>`);
    } else if (e.type === "photo" && e.shape) {
      const { clip, under, over } = shapeParts({ ...e, shape: e.shape });
      const cid = `${id}c${parts.length}`;
      const inner = `${under}<clipPath id="${cid}">${clip}</clipPath><g clip-path="url(#${cid})" class="lay-photo" data-photo="${e.id}">${placed(photos.get(e.id), photoBox(e), url, e.zoom, e.focus, e.irot)}${over}</g>`;
      parts.push(e.rot ? `<g transform="rotate(${e.rot} ${e.x + e.w / 2} ${e.y + e.h / 2})">${inner}</g>` : inner);
    } else if (e.type === "photo") {
      const border = e.border !== undefined ? e.border : e.frame ? { w: 1.5, color: "#fff" } : null;
      const veil = e.veil ?? (e.bg ? BG_VEIL : 0);
      const frame = border && border.w > 0 ? `<rect x="${e.x - border.w}" y="${e.y - border.w}" width="${e.w + 2 * border.w}" height="${e.h + 2 * border.w}" fill="${border.color}"/>` : "";
      const inner = `${frame}<svg x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" viewBox="${e.x} ${e.y} ${e.w} ${e.h}" overflow="hidden" class="lay-photo${e.big ? " big" : ""}" data-photo="${e.id}" data-event="${p.event.id}">${placed(photos.get(e.id), photoBox(e), url, e.zoom, e.focus, e.irot)}${veil ? `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="#fff" opacity="${veil}"/>` : ""}</svg>`;
      parts.push(e.rot ? `<g transform="rotate(${e.rot} ${e.x + e.w / 2} ${e.y + e.h / 2})">${inner}</g>` : inner);
    } else if (e.type === "month") {
      const size = filledSize(e), f = FONTS[e.font ?? "heavy"];
      // the month titles are capitals; a filled text added in the editor is as typed
      const text = e.slot === "month" ? e.name.toUpperCase() : e.name;
      const attrs = `x="${e.x + e.w / 2}" y="${e.y + e.h / 2 + size * 0.35}" text-anchor="middle" font-family="${f.family}" font-weight="${f.weight}" font-size="${size}" textLength="${e.w}" lengthAdjust="spacingAndGlyphs"`;
      const cid = `${id}m${parts.length}`;
      const inner = e.color
        ? `<text ${attrs} fill="${e.color}">${esc(text)}</text>`
        : `<clipPath id="${cid}"><text ${attrs}>${esc(text)}</text></clipPath><g clip-path="url(#${cid})">${placed(photos.get(e.photo ?? ""), photoBox(e), url, e.zoom, e.focus, e.irot)}</g>`;
      parts.push(e.rot ? `<g transform="rotate(${e.rot} ${e.x + e.w / 2} ${e.y + e.h / 2})">${inner}</g>` : inner);
    } else {
      const size = e.size ?? CAPTION_SIZE, color = e.color === "auto" ? (e.autoColor ?? "#fff") : (e.color ?? "#fff");
      const f = FONTS[e.font ?? "sans"];
      const halo = e.font ? "" : `text-shadow:0 0 ${size * 0.25}px ${color === "#fff" ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.45)"};`;
      const style = `margin:0;width:100%;height:100%;overflow:hidden;font-family:${f.family};font-weight:${f.weight};font-size:${size}px;line-height:${LINE};color:${color};text-align:${e.align ?? "left"};white-space:pre-wrap;overflow-wrap:break-word;${halo}`;
      const inner = `<foreignObject x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}"><div xmlns="http://www.w3.org/1999/xhtml" data-cap="${p.event.id}:${p.k}|${e.slot ?? ""}" style="${style.replace(/"/g, "&quot;")}">${esc(e.text)}</div></foreignObject>`;
      // data-rot: the text-fit check measures with the rotation taken off (lib/overflow.ts)
      parts.push(e.rot ? `<g data-rot="" transform="rotate(${e.rot} ${e.x + e.w / 2} ${e.y + e.h / 2})">${inner}</g>` : inner);
    }
  }
  return parts.join("");
}

const clipped = (x: number, inner: string) =>
  `<svg x="${x}" y="0" width="${PAGE.w}" height="${PAGE.h}" viewBox="0 0 ${PAGE.w} ${PAGE.h}" overflow="hidden">${inner}</svg>`;

const BLANK = `<rect width="${PAGE.w}" height="${PAGE.h}" fill="#ebe9e3"/>`;

/** A spread: two pages side by side with a soft fold shadow. Spread-wide photos sit on both
 * pages with the same box offset by the page width, so their halves line up across the spine. */
export function renderSpread(left: string | null, right: string | null): string {
  const id = `sp${uid()}`;
  return `<svg class="spread" viewBox="0 0 ${PAGE.w * 2} ${PAGE.h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${id}"><stop offset="0" stop-opacity="0"/><stop offset=".5" stop-opacity=".16"/><stop offset="1" stop-opacity="0"/></linearGradient></defs>
    ${clipped(0, left ?? BLANK)}${clipped(PAGE.w, right ?? BLANK)}<rect x="${PAGE.w - 6}" width="12" height="${PAGE.h}" fill="url(#${id})"/></svg>`;
}

/** A single page (the phone view). */
export function renderPage(body: string | null): string {
  return `<svg class="spread" viewBox="0 0 ${PAGE.w} ${PAGE.h}" xmlns="http://www.w3.org/2000/svg">${clipped(0, body ?? BLANK)}</svg>`;
}
