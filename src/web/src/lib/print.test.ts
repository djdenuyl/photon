import { describe, expect, it } from "vitest";
import { year } from "@/test/fixtures";
import { PAGE, buildBooks, photoBox, type Element, type Page } from "./layout";
import { LOW_DPI, PRINT_PX, printDpi, printIssues } from "./print";

const { plan, photos } = year();
const landscape = [...photos.values()].find((p) => p.w > p.h)!;

const photoEl = (id: string, w: number, h: number, extra: Partial<Extract<Element, { type: "photo" }>> = {}): Element =>
  ({ type: "photo", id, slot: `s${id}`, x: 10, y: 10, w, h, ...extra });

const pageWith = (elements: Element[]): Page => ({ ...buildBooks(plan, photos, {})[0].pages[0], elements });

describe("printDpi", () => {
  it("is the photo's pixels over the inches it is printed at", () => {
    // 4000 px across a frame 254 mm (10 inches) wide, with the frame's own aspect: 400 dpi
    expect(printDpi(landscape, photoEl(landscape.id, 254, 254 * 0.75))).toBeCloseTo(400);
  });

  it("drops when the frame crops the photo or zooms in", () => {
    const full = printDpi(landscape, photoEl(landscape.id, 100, 75))!;
    // a tall frame shows a slice of the photo, scaled up
    expect(printDpi(landscape, photoEl(landscape.id, 100, 150))!).toBeLessThan(full);
    expect(printDpi(landscape, photoEl(landscape.id, 100, 75, { zoom: 2 }))!).toBeCloseTo(full / 2);
  });
});

describe("printIssues", () => {
  it("flags empty frames and photos too small for their frame", () => {
    const small = { ...landscape, id: "tiny", w: 400, h: 300 };
    const all = new Map(photos).set("tiny", small);
    const issues = printIssues([pageWith([photoEl("", 50, 50), photoEl("tiny", 150, 112)])], all, new Map());
    expect(issues.map((i) => i.kind)).toEqual(["empty", "resolution"]);
    expect(printDpi(small, photoEl("tiny", 150, 112))!).toBeLessThan(LOW_DPI);
  });

  it("names a photo on more than one spread once", () => {
    const placed = new Map([[landscape.id, 2]]);
    const page = pageWith([photoEl(landscape.id, 50, 40), photoEl(landscape.id, 60, 45)]);
    expect(printIssues([page, page], photos, placed).filter((i) => i.kind === "twice")).toHaveLength(1);
  });

  it("leaves an empty background photo alone", () => {
    expect(printIssues([pageWith([photoEl("", PAGE.w, PAGE.h, { bg: true })])], photos, new Map())).toEqual([]);
  });
});

describe("photoBox", () => {
  it("carries a polygon photo on the page's edge into the bleed", () => {
    const shard = photoEl(landscape.id, 100, 100, { x: 0, y: 0, shape: { kind: "poly", pts: [[0, 0], [1, 0], [0.8, 1], [0, 1]] } });
    expect(photoBox(shard)).toMatchObject({ x: -PAGE.bleed, y: -PAGE.bleed });
  });

  it("leaves other frames as they are", () => {
    const el = photoEl(landscape.id, 80, 60);
    expect(photoBox(el)).toBe(el);
  });
});

it("print pages are 300 dpi with the bleed", () => {
  expect(PRINT_PX).toEqual({ w: 2587, h: 3413 });
});
