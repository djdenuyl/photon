// "Automatisch contrast" for text: look at what lies under a text frame (photos, colour areas,
// the page) and pick white or near-black, whichever stands out more. Points on a grid over the
// frame are traced to the topmost element under them; photo pixels come from the thumbnails.
import { useEffect, useState } from "react";
import { photoBox, placement, type CaptionElement, type Element, type Page } from "./layout";
import { pointInPolygon, type Pt } from "./mesh";
import type { Photo, Photos } from "./types";

export const DARK = "#161513";
const WHITE = "#ffffff";

type Pixels = { data: Uint8ClampedArray; w: number; h: number };
const cache = new Map<string, Promise<Pixels | null>>();

export function pixels(url: string): Promise<Pixels | null> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve({ data: ctx.getImageData(0, 0, w, h).data, w, h });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** The topmost element under a point, below the text itself. */
function under(page: Page, z: number, x: number, y: number): Element | null {
  const below = page.elements.filter((e) => (e.z ?? 0) < z).reverse();
  for (const e of below) {
    if (e.type === "fill" && e.color !== "transparent" && pointInPolygon(x, y, e.pts)) return e;
    if (e.type === "photo" && e.id) {
      if (e.shape?.kind === "poly") {
        const pts = e.shape.pts.map(([u, v]): Pt => [e.x + u * e.w, e.y + v * e.h]);
        if (pointInPolygon(x, y, pts)) return e;
      } else if (x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) return e;
    }
  }
  return null;
}

async function colourAt(page: Page, z: number, x: number, y: number, photos: Photos, url: (p: Photo) => string): Promise<[number, number, number]> {
  const e = under(page, z, x, y);
  if (!e) return [255, 255, 255];
  if (e.type === "fill") return hex(e.color);
  if (e.type !== "photo") return [255, 255, 255];
  const photo = photos.get(e.id);
  if (!photo) return [255, 255, 255];
  const px = await pixels(url(photo));
  if (!px) return [128, 128, 128];
  const img = placement(photo, photoBox(e), e.zoom ?? 1, e.focus);
  const u = Math.min(px.w - 1, Math.max(0, Math.floor(((x - img.x) / img.w) * px.w)));
  const v = Math.min(px.h - 1, Math.max(0, Math.floor(((y - img.y) / img.h) * px.h)));
  const i = (v * px.w + u) * 4;
  return [px.data[i], px.data[i + 1], px.data[i + 2]];
}

/** White or near-black for a text frame, from 7 × 4 points under it. */
async function pick(page: Page, c: CaptionElement, photos: Photos, url: (p: Photo) => string): Promise<string> {
  const samples: Promise<[number, number, number]>[] = [];
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 4; j++) samples.push(colourAt(page, c.z ?? 0, c.x + ((i + 0.5) / 7) * c.w, c.y + ((j + 0.5) / 4) * c.h, photos, url));
  const lums = (await Promise.all(samples)).map(luminance);
  const l = lums.reduce((a, b) => a + b, 0) / lums.length;
  const dark = luminance(hex(DARK));
  return 1.05 / (l + 0.05) >= (l + 0.05) / (dark + 0.05) ? WHITE : DARK;
}

/** The colour for every text with color "auto" on these pages, keyed `pageKey|slot`. */
export function useAutoColors(pages: Page[], photos: Photos | undefined, url: (p: Photo) => string): Map<string, string> {
  const [colors, setColors] = useState<Map<string, string>>(new Map());
  const relevant = pages.filter((p) => p.elements.some((e) => e.type === "caption" && e.color === "auto"));
  // recompute only when those pages change (their elements, not the colours set from here)
  const signature = JSON.stringify(relevant.map((p) => [p.event.id, p.k, p.elements.map((e) => (e.type === "caption" ? { ...e, autoColor: undefined } : e))]));
  useEffect(() => {
    if (!photos || !relevant.length) return;
    let live = true;
    const jobs = relevant.flatMap((p) =>
      p.elements.flatMap((e) => (e.type === "caption" && e.color === "auto" ? [pick(p, e, photos, url).then((c) => [`${p.event.id}:${p.k}|${e.slot ?? ""}`, c] as const)] : [])),
    );
    void Promise.all(jobs).then((pairs) => live && setColors(new Map(pairs)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, photos]);
  return colors;
}
