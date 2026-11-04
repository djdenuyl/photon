import { describe, expect, it } from "vitest";
import { groupPixels, pickColours } from "./palette";
import { diff } from "./saver";

/** RGBA data: `n` pixels of each colour. */
function pixels(...parts: [[number, number, number], number][]): Uint8ClampedArray {
  const out: number[] = [];
  for (const [[r, g, b], n] of parts) for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  return new Uint8ClampedArray(out);
}

describe("colour suggestions", () => {
  it("suggest the red jumper, not the dark room around it", () => {
    const data = pixels([[40, 36, 32], 700], [[90, 85, 80], 150], [[200, 40, 45], 150]);
    const [first] = pickColours(groupPixels(data));
    expect(first).toBe("#c8282d");
  });

  it("leave out near-black and near-white, and colours too alike", () => {
    const data = pixels([[5, 5, 5], 500], [[250, 250, 250], 300], [[60, 120, 200], 100], [[62, 122, 205], 100]);
    const picks = pickColours(groupPixels(data));
    expect(picks).toHaveLength(1);
  });
});

describe("saving per page", () => {
  it("sends only what changed, and null for what went", () => {
    expect(diff({ a: "1", b: "2", c: "3" }, { a: "1", b: "20", d: "4" })).toEqual({ b: "20", c: null, d: "4" });
  });
});
