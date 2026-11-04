// Colour suggestions from the photos on a page: the colours that stand out (a red jumper, a blue
// sky), not the average. Pixels from the thumbnails are grouped by hue and lightness; groups score
// by their share of the photo and their saturation, very dark and very light pixels are left out,
// and a pick too close to an earlier one is skipped.
import { useEffect, useState } from "react";
import { pixels } from "./contrast";

export type RGB = [number, number, number];

export function hsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

export const toHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** One group of similar pixels in one photo: its average colour, share and mean saturation. */
export interface Group { color: RGB; share: number; sat: number }

/** Groups of similar pixels (RGBA data). */
export function groupPixels(data: Uint8ClampedArray): Group[] {
  const map = new Map<number, { sum: RGB; n: number; sat: number }>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const c: RGB = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = hsl(c);
    total++;
    if (l < 0.18 || l > 0.93) continue;
    // greys share a bin per lightness band; colours bin by 15° of hue and three lightness bands
    const key = s < 0.12 ? 1000 + Math.floor(l * 3) : Math.floor(h / 15) * 3 + Math.floor(l * 3);
    const g = map.get(key) ?? { sum: [0, 0, 0] as RGB, n: 0, sat: 0 };
    g.sum = [g.sum[0] + c[0], g.sum[1] + c[1], g.sum[2] + c[2]];
    g.n++;
    g.sat += s;
    map.set(key, g);
  }
  return [...map.values()].map((g) => ({ color: [g.sum[0] / g.n, g.sum[1] / g.n, g.sum[2] / g.n], share: g.n / Math.max(1, total), sat: g.sat / g.n }));
}

/** The colours that stand out, most striking first, at most `max`, none too alike. */
export function pickColours(groups: Group[], max = 8): string[] {
  const ranked = groups
    .filter((g) => g.share > 0.015)
    .map((g) => ({ ...g, score: Math.sqrt(g.share) * (0.15 + g.sat) ** 1.5 }))
    .sort((a, b) => b.score - a.score);
  const picks: RGB[] = [];
  for (const g of ranked) {
    if (picks.length >= max) break;
    if (picks.every((p) => dist(p, g.color) > 60)) picks.push(g.color);
  }
  return picks.map(toHex);
}

/** Colour suggestions for the photos at these URLs (thumbnails). */
export function usePalette(urls: string[], max = 8): string[] {
  const [colors, setColors] = useState<string[]>([]);
  const key = urls.join("|");
  useEffect(() => {
    let live = true;
    void Promise.all(urls.map((u) => pixels(u))).then((all) => {
      const groups = all.flatMap((px) => (px ? groupPixels(px.data) : []));
      if (live) setColors(pickColours(groups, max));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, max]);
  return colors;
}
