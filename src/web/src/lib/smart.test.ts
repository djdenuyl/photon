import { describe, expect, it } from "vitest";
import { arrangements, type Cell } from "./smart";

const box = { x: 10, y: 10, w: 190, h: 260 };
const cells: Cell[] = [
  { slot: "a", aspect: 4 / 3 },
  { slot: "b", aspect: 3 / 4 },
  { slot: "c", aspect: 4 / 3 },
  { slot: "d", aspect: 3 / 4 },
  { slot: "e", aspect: 16 / 9 },
];

describe("arrangements", () => {
  const all = arrangements(cells, box);

  it("offers several different arrangements", () => {
    expect(all.length).toBeGreaterThan(5);
    expect(new Set(all.map((a) => JSON.stringify(a))).size).toBe(all.length);
  });

  it("keeps every photo inside the box, without overlaps", () => {
    for (const a of all) {
      const boxes = cells.map((c) => a[c.slot]);
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(box.x - 0.01);
        expect(b.y).toBeGreaterThanOrEqual(box.y - 0.01);
        expect(b.x + b.w).toBeLessThanOrEqual(box.x + box.w + 0.01);
        expect(b.y + b.h).toBeLessThanOrEqual(box.y + box.h + 0.01);
      }
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const p = boxes[i], q = boxes[j];
          const overlap = p.x < q.x + q.w - 0.01 && q.x < p.x + p.w - 0.01 && p.y < q.y + q.h - 0.01 && q.y < p.y + p.h - 0.01;
          expect(overlap).toBe(false);
        }
    }
  });

  it("keeps landscape photos landscape in the best one", () => {
    const best = all[0];
    for (const c of cells) if (c.aspect > 1.2) expect(best[c.slot].w / best[c.slot].h).toBeGreaterThan(1);
  });
});
