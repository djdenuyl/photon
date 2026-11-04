import { describe, expect, it } from "vitest";
import { year } from "@/test/fixtures";
import { buildBooks, captionFrame, coverPages, PAGE, pageBody } from "./layout";

describe("buildBooks", () => {
  const { plan, photos } = year();
  const books = buildBooks(plan, photos, {});

  it("splits the year in two books at July", () => {
    expect(books).toHaveLength(2);
    expect(books[0].pages.every((p) => p.event.start < "2025-07-01")).toBe(true);
    expect(books[1].pages.every((p) => p.event.start >= "2025-07-01")).toBe(true);
  });

  it("starts an event of two pages or more on a left page (after the opening page)", () => {
    for (const book of books) {
      // page 1 is a right page, so left pages have an odd index
      const first = new Map<string, number>();
      const count = new Map<string, number>();
      book.pages.forEach((p, i) => {
        if (!first.has(p.event.id)) first.set(p.event.id, i);
        count.set(p.event.id, (count.get(p.event.id) ?? 0) + 1);
      });
      // (page 1 is the book's first page, a right page on its own: the opening event can't help it)
      for (const [id, n] of count) if (n >= 2 && first.get(id)! > 0) expect(first.get(id)! % 2, id).toBe(1);
    }
  });

  it("puts every photo inside the page (with bleed)", () => {
    const B = PAGE.bleed;
    for (const p of books.flatMap((b) => b.pages))
      for (const e of p.elements)
        if (e.type === "photo" && !e.bg) {
          expect(e.x).toBeGreaterThanOrEqual(-B - 0.01);
          expect(e.y).toBeGreaterThanOrEqual(-B - 0.01);
          expect(e.y + e.h).toBeLessThanOrEqual(PAGE.h + B + 0.01);
        }
  });

  it("renders every page", () => {
    for (const p of books.flatMap((b) => b.pages)) expect(pageBody(p, photos, (ph) => ph.thumb)).toContain("<");
  });
});

describe("cover", () => {
  const { plan, photos } = year();
  const [book] = buildBooks(plan, photos, {});
  const { front, back } = coverPages(book.cover, 0);

  it("has 15 letters, all on the page (the 2022 margins)", () => {
    const letters = front.elements.filter((e) => e.type === "photo" && e.shape?.kind === "letter");
    expect(letters).toHaveLength(15);
    for (const l of letters) {
      expect(l.y).toBeGreaterThan(4);
      expect(l.y + (l.type === "photo" ? l.h : 0)).toBeLessThan(PAGE.h - 5);
    }
  });

  it("has four shards on the back", () => {
    expect(back.elements.filter((e) => e.type === "photo" && e.shape?.kind === "poly")).toHaveLength(4);
  });
});

describe("captionFrame", () => {
  it("places a one-line frame by its baseline, right-aligned when asked", () => {
    const f = captionFrame("DEEL 1", 196, 270, 7.3, "donuts", true);
    expect(f.x + f.w).toBeCloseTo(196);
    expect(f.y).toBeLessThan(270);
    expect(f.y + f.h).toBeGreaterThan(270 - 7.3);
  });
});
