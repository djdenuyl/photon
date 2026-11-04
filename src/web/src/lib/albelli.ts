// Read-only rendering of the earlier books as exported from Albelli (data/albelli/books.json;
// units are inches, origin top-left of the trim box). Pure.

export interface AlbelliElement {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  color?: string | null;
  href?: string;
  photoId?: string;
  crop?: { width: number; height: number; offsetX: number; offsetY: number };
  decoration?: { mask: string | null; frame: string | null };
  content?: string | null;
  font?: string | null;
  fontSize?: string | null;
  bold?: boolean | null;
  color_?: string;
  align?: string | null;
}

export interface AlbelliSurface {
  label: string;
  target: "cover" | "page" | "spread";
  w: number;
  h: number;
  elements: AlbelliElement[];
}

export interface AlbelliBook {
  slug: string;
  name: string;
  surfaces: AlbelliSurface[];
}

export interface AlbelliPhoto {
  thumb: string | null;
  role: string;
  date: string | null;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const uid = () => Math.random().toString(36).slice(2, 8);

/** One surface as SVG; `half` crops a spread to its left or right page (phone view). */
export function renderSurface(s: AlbelliSurface, photos: Record<string, AlbelliPhoto>, half?: "left" | "right"): string {
  const id = `al${uid()}`;
  const defs: string[] = [`<clipPath id="${id}t"><rect width="${s.w}" height="${s.h}"/></clipPath>`];
  const body: string[] = [];
  for (const e of s.elements) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const rot = e.rotation ? ` transform="rotate(${e.rotation} ${cx} ${cy})"` : "";
    if (e.type === "background-color" || e.type === "color") {
      body.push(`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="${e.color ?? "#fff"}"${rot}/>`);
    } else if (e.type === "background-asset" || e.type === "clipart") {
      const fit = e.type === "clipart" ? "xMidYMid meet" : "xMidYMid slice";
      body.push(`<image href="${esc(e.href ?? "")}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="${fit}"${rot}/>`);
    } else if (e.type === "photo" || e.type === "background-photo") {
      const thumb = e.photoId ? photos[e.photoId]?.thumb : null;
      const c = e.crop;
      let mask = "";
      if (e.decoration?.mask) {
        const mid = `${id}m${defs.length}`;
        defs.push(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}"><image href="${esc(e.decoration.mask)}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="none"/></mask>`);
        mask = ` mask="url(#${mid})"`;
      }
      // the photo is scaled to crop.width x crop.height, centred in the frame, and shifted by the offsets
      const img = thumb && c
        ? `<svg x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" overflow="hidden"><image href="/data/albelli/thumbs/300/${thumb}" x="${(e.w - c.width) / 2 + c.offsetX}" y="${(e.h - c.height) / 2 + c.offsetY}" width="${c.width}" height="${c.height}" preserveAspectRatio="none"/></svg>`
        : `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="#ccc"/>`;
      const frame = e.decoration?.frame ? `<image href="${esc(e.decoration.frame)}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="none"/>` : "";
      body.push(`<g${rot}><g${mask}>${img}</g>${frame}</g>`);
    } else if (e.type === "text" && e.content) {
      const k = 100;
      const size = parseFloat(e.fontSize ?? "10") || 10;
      const style = [
        `font-family:'${e.font ?? "Open Sans"}','Open Sans',sans-serif`, `font-size:${(size / 72) * k}px`, "line-height:1.3",
        `color:${e.color ?? "#000"}`, `text-align:${e.align ?? "left"}`, `font-weight:${e.bold ? 700 : 400}`, "white-space:pre-wrap",
      ].join(";");
      body.push(`<g transform="${e.rotation ? `rotate(${e.rotation} ${cx} ${cy}) ` : ""}translate(${e.x} ${e.y}) scale(${1 / k})"><foreignObject width="${e.w * k}" height="${e.h * k}"><div xmlns="http://www.w3.org/1999/xhtml" style="${style}">${esc(e.content)}</div></foreignObject></g>`);
    }
  }
  const fold = s.target === "page" || half ? "" : `<rect x="${s.w / 2 - 0.03}" width="0.06" height="${s.h}" fill="#000" opacity=".08"/>`;
  const vb = half === "left" ? `0 0 ${s.w / 2} ${s.h}` : half === "right" ? `${s.w / 2} 0 ${s.w / 2} ${s.h}` : `0 0 ${s.w} ${s.h}`;
  return `<svg class="spread" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg"><defs>${defs.join("")}</defs><g clip-path="url(#${id}t)"><rect width="${s.w}" height="${s.h}" fill="#fff"/>${body.join("")}${fold}</g></svg>`;
}
