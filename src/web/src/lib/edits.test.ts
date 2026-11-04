import { describe, expect, it } from "vitest";
import { year } from "@/test/fixtures";
import { applyEdits, findPhoto, pageKey, parseEdits, serializeEdits, swapPhoto, updateElement, type Edits } from "./edits";
import { buildBooks, pageBody, type Element, type Page } from "./layout";
import { makeMesh } from "./mesh";

const { plan, photos } = year();
const fresh = () => buildBooks(plan, photos, {});
const plainPhotos = (p: Page) => p.elements.filter((e): e is Extract<Element, { type: "photo" }> => e.type === "photo" && !e.bg && !e.shape);

describe("applyEdits", () => {
  it("adds the page colour as a fill at the very bottom", () => {
    const [book] = applyEdits(fresh(), {});
    const page = book.pages[0];
    expect(page.elements[0]).toMatchObject({ type: "fill", slot: "pagefill" });
    expect(page.background).toBeUndefined();
  });

  it("hides, moves and restacks elements", () => {
    const page = fresh()[0].pages[0];
    const key = pageKey(page);
    const [a, b] = plainPhotos(page);
    let ed: Edits = updateElement({}, key, a.id, { hidden: true });
    ed = updateElement(ed, key, b.id, { x: 50, y: 60, z: 99 });
    const out = applyEdits(fresh(), ed)[0].pages[0];
    expect(out.elements.some((e) => e.type === "photo" && e.id === a.id)).toBe(false);
    const last = out.elements[out.elements.length - 1];
    expect(last).toMatchObject({ type: "photo", id: b.id, x: 50, y: 60 });
  });

  it("keeps an added background photo below the photos (it doesn't cover the first one)", () => {
    const page = fresh()[0].pages[0];
    const key = pageKey(page);
    const ed = updateElement({}, key, "bgphotoX", { add: "photo", photo: "p001" });
    const out = applyEdits(fresh(), ed)[0].pages[0];
    const bgAt = out.elements.findIndex((e) => e.slot === "bgphotoX");
    const firstPhoto = out.elements.findIndex((e) => e.type === "photo" && !e.bg);
    expect(bgAt).toBeGreaterThan(0); // above the page colour
    expect(bgAt).toBeLessThan(firstPhoto);
  });

  it("adds text frames and converts old one-line caption edits", () => {
    const page = fresh()[0].pages[0];
    const key = pageKey(page);
    let ed = updateElement({}, key, "addA", { add: "caption", box: true, text: "Hallo", x: 20, y: 30, w: 60, h: 16, size: 5 });
    ed = updateElement(ed, key, "cap0", { x: 40, y: 100 }); // from before text frames: left / baseline − 1.7 × size
    const out = applyEdits(fresh(), ed)[0].pages[0];
    expect(out.elements.find((e) => e.slot === "addA")).toMatchObject({ type: "caption", x: 20, y: 30, w: 60, h: 16 });
    const cap = out.elements.find((e) => e.slot === "cap0");
    if (cap?.type === "caption") {
      expect(cap.x).toBeCloseTo(40);
      expect(cap.y).toBeGreaterThan(100); // the frame's top is below the old y (which was 1.7 × size above the baseline)
    }
  });

  it("replaces the plain photos by mesh cells", () => {
    const page = fresh()[0].pages[0];
    const key = pageKey(page);
    const ids = plainPhotos(page).map((e) => e.id);
    const mesh = makeMesh("raster", ids.length, key);
    const out = applyEdits(fresh(), updateElement({}, key, "mesh", { mesh, cells: ids }))[0].pages[0];
    expect(plainPhotos(out)).toHaveLength(0);
    expect(out.elements.filter((e) => e.type === "photo" && e.cell !== undefined)).toHaveLength(ids.length);
  });

  it("leaves surplus mesh cells empty, drawn as an empty frame", () => {
    const page = fresh()[0].pages[0];
    const key = pageKey(page);
    const ids = plainPhotos(page).map((e) => e.id);
    const mesh = makeMesh("honingraat", ids.length, key);
    const cells = mesh.cells.map((_, i) => ids[i] ?? "");
    const out = applyEdits(fresh(), updateElement({}, key, "mesh", { mesh, cells }))[0].pages[0];
    const shown = out.elements.flatMap((e) => (e.type === "photo" && e.cell !== undefined && e.id ? [e.id] : []));
    expect(new Set(shown).size).toBe(shown.length); // no photo twice
    expect(pageBody(out, photos, (p) => p.thumb)).toContain("#ebe7df");
  });

  it("reshapes a colour area by its points", () => {
    const page = fresh()[0].pages[0];
    const tri: [number, number][] = [[0, 0], [210, 0], [0, 280]];
    const out = applyEdits(fresh(), updateElement({}, pageKey(page), "pagefill", { pts: tri, color: "#ff0000" }))[0].pages[0];
    expect(out.elements[0]).toMatchObject({ type: "fill", color: "#ff0000", pts: tri, w: 210, h: 280 });
  });
});

describe("the page's own colour", () => {
  it("keeps its points on the page (handles stay on the page), even from older edits in the bleed", () => {
    const page = fresh()[0].pages[0];
    const old: [number, number][] = [[-4.5, -4.5], [214.5, -4.5], [214.5, 284.5], [-4.5, 284.5]];
    const out = applyEdits(fresh(), updateElement({}, pageKey(page), "pagefill", { pts: old }))[0].pages[0];
    expect(out.elements[0]).toMatchObject({ x: 0, y: 0, w: 210, h: 280 });
  });

  it("is still drawn into the bleed where its points are on the edge", () => {
    const out = applyEdits(fresh(), {})[0].pages[0];
    expect(pageBody(out, photos, (p) => p.thumb)).toContain('points="-4.5,-4.5 214.5,-4.5 214.5,284.5 -4.5,284.5"');
  });
});

describe("swapPhoto", () => {
  it("trades places with a photo already in the book", () => {
    const books = applyEdits(fresh(), {});
    const [p1, p2] = [books[0].pages[0], books[0].pages[2]];
    const a = plainPhotos(p1)[0].id, b = plainPhotos(p2)[0].id;
    const ed = swapPhoto(books, {}, pageKey(p1), a, a, b);
    const after = applyEdits(fresh(), ed);
    expect(findPhoto(after, b)?.page.event.id).toBe(p1.event.id);
    expect(findPhoto(after, a)?.page.event.id).toBe(p2.event.id);
  });

  it("doesn't trade from the cover", () => {
    const books = applyEdits(fresh(), {});
    const b = plainPhotos(books[0].pages[2])[0].id;
    const ed = swapPhoto(books, {}, "omslag1-front:0", "letter0", "x", b);
    expect(Object.keys(ed)).toEqual(["omslag1-front:0"]);
  });
});

describe("updateElement", () => {
  it("resets an element, but keeps an added text", () => {
    let ed = updateElement({}, "k", "addA", { add: "caption", box: true, text: "Hoi", x: 1, y: 2, w: 3, h: 4, color: "#000" });
    ed = updateElement(ed, "k", "addA", null);
    expect(ed.k.addA).toMatchObject({ add: "caption", text: "Hoi", x: 1, box: true });
    expect(ed.k.addA.color).toBeUndefined();
    ed = updateElement(ed, "k", "p001", { zoom: 2 });
    expect(updateElement(ed, "k", "p001", null).k.p001).toBeUndefined();
  });

  it("survives a round trip through the stored strings", () => {
    const ed = updateElement({}, "a:0", "p001", { x: 1, focus: [0.2, 0.3] });
    expect(parseEdits(serializeEdits(ed))).toEqual(ed);
  });
});
