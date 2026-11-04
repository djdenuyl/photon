import { describe, expect, it } from "vitest";
import { bboxOf, cellPolygons, inset, makeMesh, pointInPolygon, type Pt } from "./mesh";

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
    const a = makeMesh("schuin", 6, "page"), b = makeMesh("schuin", 6, "page"), r = makeMesh("raster", 6, "page", { bleed: true, gap: 3 });
    expect(a.verts).toEqual(b.verts);
    expect(a.verts).not.toEqual(r.verts);
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
