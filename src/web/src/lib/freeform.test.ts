import { describe, expect, it } from "vitest";
import { year } from "@/test/fixtures";
import { applyEdits, clearedLayout, copyLayout, pageKey, pasteLayout, updateElement, type Edits } from "./edits";
import { collage, overDeRug } from "./freeform";
import { FONTS, PAGE, buildBooks, pageBody, photoBox, type Element, type Page } from "./layout";
import { cellPolygons, makeMesh } from "./mesh";

const { plan, photos } = year();
const fresh = () => buildBooks(plan, photos, {});
const plain = (p: Page) => p.elements.filter((e): e is Extract<Element, { type: "photo" }> => e.type === "photo" && !e.bg && !e.shape && !e.twin);
const area = (pts: [number, number][]) => Math.abs(pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;

describe("new mesh templates", () => {
  for (const template of ["banen", "mozaiek"] as const) {
    it(`${template}: one cell per photo, together covering the page`, () => {
      for (const n of [1, 3, 5, 7, 9]) {
        const m = makeMesh(template, n, "x", { gap: 0 });
        expect(m.cells).toHaveLength(n);
        const total = cellPolygons(m).reduce((s, c) => s + area(c), 0);
        expect(total).toBeCloseTo((PAGE.w - 2 * PAGE.margin) * (PAGE.h - 2 * PAGE.margin), 0);
      }
    });
  }

  it("mozaiek: the first block is the large one", () => {
    const m = makeMesh("mozaiek", 6, "x", { gap: 0 });
    const sizes = cellPolygons(m).map(area);
    expect(sizes[0]).toBe(Math.max(...sizes));
    expect(sizes[0] / sizes.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.5);
  });

  it("mozaiek: neighbours share the point where they meet", () => {
    const m = makeMesh("mozaiek", 5, "x");
    const used = m.cells.flat();
    expect(new Set(used).size).toBeLessThan(used.length);
  });
});

describe("collage", () => {
  it("gives every photo a turned, bordered frame on the page", () => {
    const cells = [1.33, 0.75, 1.5, 1, 1.33].map((aspect, i) => ({ slot: `s${i}`, aspect }));
    const c = collage(cells, "k");
    expect(Object.keys(c)).toHaveLength(5);
    for (const e of Object.values(c)) {
      expect(e.x!).toBeGreaterThanOrEqual(0);
      expect(e.x! + e.w!).toBeLessThanOrEqual(PAGE.w);
      expect(e.y! + e.h!).toBeLessThanOrEqual(PAGE.h);
      expect(Math.abs(e.rot!)).toBeLessThanOrEqual(9);
      expect(e.border?.w).toBeGreaterThan(0);
    }
    expect(collage(cells, "k", 1)).not.toEqual(c);
  });
});

describe("over de rug", () => {
  it("draws the spine photo on both pages, the halves meeting at the fold", () => {
    const books = fresh();
    const [l, r] = books[0].pages.slice(1, 3);
    const lk = pageKey(l), rk = pageKey(r);
    const cells = (p: Page) => plain(p).map((e) => ({ slot: e.slot ?? e.id, aspect: 1.33 }));
    const spine = plain(l)[0].id;
    const out = overDeRug({ key: lk, cells: cells(l) }, { key: rk, cells: cells(r) }, "left", spine);
    const edits: Edits = out;
    const after = applyEdits(fresh(), edits)[0];
    const src = after.pages[1].elements.find((e) => e.slot === spine)!;
    const twin = after.pages[2].elements.find((e) => e.type === "photo" && e.twin)!;
    expect(src.x + src.w).toBeGreaterThan(PAGE.w);
    expect(twin.x).toBeCloseTo(src.x - PAGE.w);
    expect(twin.type === "photo" && src.type === "photo" && twin.id === src.id).toBe(true);
  });

  it("a twin whose photo is gone disappears", () => {
    const books = fresh();
    const [l, r] = books[0].pages.slice(1, 3);
    let edits = updateElement({}, pageKey(r), "twinX", { add: "twin", of: `${pageKey(l)}|nothing` });
    edits = updateElement(edits, pageKey(r), "z", {});
    expect(applyEdits(fresh(), edits)[0].pages[2].elements.some((e) => e.type === "photo" && e.twin)).toBe(false);
  });
});

describe("copy and paste a layout", () => {
  it("gives the other page's photos the same frames, in reading order", () => {
    const books = fresh();
    const [a, b] = books[0].pages.filter((p) => plain(p).length >= 3);
    let edits = updateElement({}, pageKey(a), plain(a)[0].id, { x: 20, y: 30, w: 50, h: 40, rot: 5 });
    const shown = applyEdits(fresh(), edits)[0];
    const sa = shown.pages.find((p) => pageKey(p) === pageKey(a))!;
    const sb = shown.pages.find((p) => pageKey(p) === pageKey(b))!;
    edits = pasteLayout(edits, sb, copyLayout(sa, edits[pageKey(a)]));
    const pasted = applyEdits(fresh(), edits)[0].pages.find((p) => pageKey(p) === pageKey(b))!;
    expect(plain(pasted).some((e) => e.x === 20 && e.y === 30 && e.rot === 5)).toBe(true);
  });

  it("a mesh goes over with this page's photos in its cells", () => {
    const books = fresh();
    const [a, b] = books[0].pages.filter((p) => plain(p).length >= 3);
    const mesh = makeMesh("banen", plain(a).length, "a");
    const edits: Edits = { [pageKey(a)]: { mesh: { mesh, cells: plain(a).map((e) => e.id) } } };
    const out = pasteLayout(edits, b, copyLayout(a, edits[pageKey(a)]));
    expect(out[pageKey(b)].mesh?.mesh?.template).toBe("banen");
    expect(out[pageKey(b)].mesh?.cells?.filter(Boolean)).toEqual(plain(b).map((e) => e.id).slice(0, mesh.cells.length));
  });

  it("clearing keeps photo swaps and what was added", () => {
    const pe = clearedLayout({ p001: { photo: "p009", x: 3, rot: 4 }, mesh: {}, layout: { layout: "collage" }, add1: { add: "caption", text: "Hoi", x: 5 } });
    expect(pe).toEqual({ p001: { photo: "p009" }, add1: { add: "caption", text: "Hoi", x: 5 } });
  });
});

describe("text and filled text", () => {
  it("a filled text added in the editor is a month-like element with its own text", () => {
    const books = fresh();
    const page = books[0].pages[0];
    const edits = updateElement({}, pageKey(page), "word1", { add: "word", text: "Texel", color: "#e07a5f", font: "donuts" });
    const shown = applyEdits(fresh(), edits)[0].pages[0];
    const word = shown.elements.find((e) => e.slot === "word1");
    expect(word).toMatchObject({ type: "month", name: "Texel", color: "#e07a5f", font: "donuts" });
    const svg = pageBody(shown, photos, () => "");
    expect(svg).toContain(`fill="#e07a5f"`);
    expect(svg).toContain(">Texel<");
  });

  it("text takes its font and turn", () => {
    const books = fresh();
    const page = books[0].pages[0];
    const edits = updateElement({}, pageKey(page), "cap1", { add: "caption", text: "Hoi", font: "serif", rot: 12, box: true, x: 10, y: 10, w: 40, h: 10 });
    const svg = pageBody(applyEdits(fresh(), edits)[0].pages[0], photos, () => "");
    expect(svg).toContain("Fraunces");
    expect(svg).toContain("rotate(12");
    expect(FONTS.serif.family).toContain("Fraunces");
  });
});

describe("a photo turned in its frame", () => {
  it("covers the frame's turned box, around the same centre", () => {
    const el: Element = { type: "photo", id: "p001", x: 10, y: 10, w: 100, h: 50, irot: 90 };
    const b = photoBox(el);
    for (const [k, v] of Object.entries({ x: 35, y: -15, w: 50, h: 100 })) expect(b[k as keyof typeof b]).toBeCloseTo(v);
  });
});
