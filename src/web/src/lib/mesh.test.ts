import { describe, expect, it } from "vitest";
import { bboxOf, cellPolygons, inset, makeMesh, meshEdges, pointInPolygon, removeVert, splitEdge, type Pt } from "./mesh";

const square: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("inset", () => {
  it("moves every edge inward, whichever way round the points go", () => {
    for (const pts of [square, [...square].reverse()]) {
      const b = bboxOf(inset(pts, 1));
      expect(b.x).toBeCloseTo(1);
      expect(b.w).toBeCloseTo(8);
    }
  });

  it("keeps a straight edge straight through a point on it (a T-junction)", () => {
    const withMid: Pt[] = [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]];
    expect(inset(withMid, 1)[1][1]).toBeCloseTo(1);
  });
});

describe("makeMesh", () => {
  it("makes one cell per photo for rows, within the margins", () => {
    const m = makeMesh("raster", 7, "x");
    expect(m.cells).toHaveLength(7);
    const all = bboxOf(cellPolygons(m).flat());
    expect(all.x).toBeCloseTo(10, 0);
    expect(all.x + all.w).toBeCloseTo(200, 0);
  });

  it("shares points between neighbouring cells", () => {
    const m = makeMesh("raster", 6, "x");
    const uses = new Map<number, number>();
    for (const c of m.cells) for (const v of c) uses.set(v, (uses.get(v) ?? 0) + 1);
    expect([...uses.values()].some((n) => n >= 3)).toBe(true);
  });

  it("shakes the points for Schuin, the same way for the same page", () => {
    const a = makeMesh("schuin", 6, "page"), b = makeMesh("schuin", 6, "page"), r = makeMesh("raster", 6, "page", { gap: 3 });
    expect(a.verts).toEqual(b.verts);
    expect(a.verts).not.toEqual(r.verts);
  });

  it("keeps Schuin within the margins unless asked", () => {
    const all = bboxOf(cellPolygons(makeMesh("schuin", 6, "p")).flat());
    expect(all.x).toBeGreaterThanOrEqual(9.9);
    expect(all.y).toBeGreaterThanOrEqual(9.9);
    expect(makeMesh("schuin", 6, "p", { bleed: true }).bleed).toBe(true);
  });

  it("gives a honeycomb at least 14 cells, into the bleed", () => {
    const m = makeMesh("honingraat", 5, "x");
    expect(m.cells.length).toBeGreaterThanOrEqual(14);
    expect(m.bleed).toBe(true);
    expect(m.cells.every((c) => c.length === 6)).toBe(true);
  });
});

describe("pointInPolygon", () => {
  it("tells inside from outside", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
  });
});

describe("editing a mesh", () => {
  it("adds a point halfway a side, in both cells along it", () => {
    const m = makeMesh("raster", 4, "x");
    const shared = meshEdges(m).find(([a, b]) => m.cells.filter((c) => c.includes(a) && c.includes(b)).length === 2)!;
    const next = splitEdge(m, shared[0], shared[1]);
    const v = m.verts.length;
    expect(next.cells.filter((c) => c.includes(v))).toHaveLength(2);
    expect(next.verts[v]).toEqual([(m.verts[shared[0]][0] + m.verts[shared[1]][0]) / 2, (m.verts[shared[0]][1] + m.verts[shared[1]][1]) / 2]);
  });

  it("takes a point out again, but never below a triangle", () => {
    const m = makeMesh("raster", 4, "x");
    const [a, b] = meshEdges(m)[0];
    const v = m.verts.length;
    expect(removeVert(splitEdge(m, a, b), v).cells).toEqual(m.cells);
    const tri = { ...m, cells: [[0, 1, 2]] };
    expect(removeVert(tri, 1)).toBe(tri);
  });

  it("gives other variants of the same kind", () => {
    const a = makeMesh("schuin", 6, "p", { variant: 0 }), b = makeMesh("schuin", 6, "p", { variant: 1 });
    expect(a.verts).not.toEqual(b.verts);
    expect(makeMesh("raster", 6, "p", { variant: 1 }).cells).toHaveLength(6);
    const h0 = makeMesh("honingraat", 5, "p"), h1 = makeMesh("honingraat", 5, "p", { variant: 1 });
    expect(h0.verts).not.toEqual(h1.verts);
  });
});
