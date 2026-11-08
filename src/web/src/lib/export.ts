// Print files for Albelli: every page (and the two cover halves) as a 300 dpi JPEG with the bleed
// around it, drawn from the same SVG the editor shows (`pageBody`), with the full-size originals.
//
// The page SVG is drawn as an image, which may not load anything itself: the photos go in as data
// URLs (each scaled to the pixels its frame needs, never above the original) and the fonts as
// embedded @font-face rules.
import { Zip, ZipPassThrough } from "fflate";
import { displayUrl, originalUrl } from "./data";
import { PAGE, pageBody, photoBox, placement, renderPage, type Book, type Page } from "./layout";
import { textOverflows } from "./overflow";
import { PRINT_DPI, PRINT_PX, photoIdOf } from "./print";
import type { Photo, Photos } from "./types";

const NO_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/** Text frames (`pageKey|slot`) whose text doesn't fit, measured like the editor does, on each
 * page drawn off-screen without its photos. */
export async function overflowingText(pages: Page[], photos: Photos): Promise<Set<string>> {
  await document.fonts.ready;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:840px;visibility:hidden;pointer-events:none";
  document.body.append(host);
  const over = new Set<string>();
  try {
    for (const page of pages) {
      if (!page.elements.some((e) => e.type === "caption")) continue;
      host.innerHTML = renderPage(pageBody(page, photos, () => NO_IMAGE));
      const svg = host.firstElementChild as SVGSVGElement;
      svg.style.width = "840px";
      svg.style.height = `${(840 * PAGE.h) / PAGE.w}px`;
      for (const el of host.querySelectorAll<HTMLElement>("[data-cap]")) if (textOverflows(el)) over.add(el.dataset.cap ?? "");
    }
  } finally {
    host.remove();
  }
  return over;
}

const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&family=League+Spartan:wght@900&display=block";
const DONUTS = "/data/fonts/happy-donuts.otf";
const JPEG_QUALITY = 0.92;

export interface PrintFile {
  name: string;
  page: Page;
}

/** The files of one book in print order: the back and front cover, then the pages. */
export function printFiles(book: Book): PrintFile[] {
  const n = (i: number) => String(i + 1).padStart(3, "0");
  return [
    { name: "000-omslag-achterkant.jpg", page: book.covers.back },
    { name: "000-omslag-voorkant.jpg", page: book.covers.front },
    ...book.pages.map((page, i) => ({ name: `${n(i)}.jpg`, page })),
  ];
}

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });

const toBlob = (canvas: HTMLCanvasElement, quality = JPEG_QUALITY) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", quality));

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res;
}

let fonts: Promise<string> | null = null;

/** @font-face rules with the font files inlined (only the latin subsets Google serves). */
export function embeddedFonts(): Promise<string> {
  fonts ??= (async () => {
    const css = await (await fetchOk(GOOGLE_FONTS)).text();
    const blocks = [...css.matchAll(/\/\* ([\w-]+) \*\/\s*(@font-face\s*{[^}]*})/g)].filter((m) => m[1] === "latin" || m[1] === "latin-ext").map((m) => m[2]);
    const inlined = await Promise.all(
      blocks.map(async (block) => {
        const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
        if (!url) return block;
        return block.replace(url, await asDataUrl(await (await fetchOk(url)).blob()));
      }),
    );
    const donuts = await asDataUrl(await (await fetchOk(DONUTS)).blob());
    inlined.push(`@font-face{font-family:"HAPPY DONUTS";src:url(${donuts}) format("opentype");}`);
    return inlined.join("\n");
  })();
  fonts.catch(() => (fonts = null));
  return fonts;
}

/** A photo as a data URL, `width` pixels wide (its original, else its display version). */
async function photoData(photo: Photo, width: number): Promise<{ url: string; fallback: boolean }> {
  let fallback = false;
  let res: Response;
  try {
    res = await fetchOk(originalUrl(photo));
  } catch {
    fallback = true;
    res = await fetchOk(displayUrl(photo));
  }
  const bitmap = await createImageBitmap(await res.blob());
  const w = Math.max(1, Math.min(width, bitmap.width));
  const h = Math.max(1, Math.round((w * bitmap.height) / bitmap.width));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return { url: await asDataUrl(await toBlob(canvas)), fallback };
}

/** Draws the SVG on the canvas. From a data: URL: Chrome marks a canvas as tainted (unreadable)
 * after drawing an SVG with HTML text (the captions) from a blob: URL, not from a data: URL. */
async function drawSvg(svg: string, canvas: HTMLCanvasElement): Promise<void> {
  const img = new Image();
  img.src = await asDataUrl(new Blob([svg], { type: "image/svg+xml" }));
  await img.decode();
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

export interface Rendered {
  blob: Blob;
  /** Photos without an original in the bucket, printed from their 1600 px version. */
  fallbacks: string[];
}

let warmed = false;

/** One page as a print file. */
export async function renderPrintPage(page: Page, photos: Photos, fontCss: string): Promise<Rendered> {
  // the pixels each photo needs: its widest placement on the page at 300 dpi
  const need = new Map<string, number>();
  for (const el of page.elements) {
    const id = photoIdOf(el);
    const photo = id ? photos.get(id) : undefined;
    if (!photo || (el.type !== "photo" && el.type !== "month")) continue;
    const img = placement(photo, photoBox(el), el.zoom ?? 1, el.focus);
    need.set(photo.id, Math.max(need.get(photo.id) ?? 0, Math.ceil((img.w / 25.4) * PRINT_DPI)));
  }
  const urls = new Map<string, string>();
  const fallbacks: string[] = [];
  for (const [id, width] of need) {
    const { url, fallback } = await photoData(photos.get(id)!, width);
    urls.set(id, url);
    if (fallback) fallbacks.push(id);
  }
  const B = PAGE.bleed;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PRINT_PX.w}" height="${PRINT_PX.h}" viewBox="${-B} ${-B} ${PAGE.w + 2 * B} ${PAGE.h + 2 * B}"><style>${fontCss}</style>${pageBody(page, photos, (p) => urls.get(p.id) ?? "")}</svg>`;
  const canvas = document.createElement("canvas");
  canvas.width = PRINT_PX.w;
  canvas.height = PRINT_PX.h;
  // the first SVG image can be drawn before its embedded fonts are ready: draw it once to warm up
  if (!warmed) {
    await drawSvg(svg, canvas);
    await new Promise((r) => setTimeout(r, 400));
    warmed = true;
  }
  await drawSvg(svg, canvas);
  return { blob: await toBlob(canvas), fallbacks };
}

/** Where the files go: a folder the user picks (Chrome, Edge), else one zip download. */
export interface Target {
  write: (name: string, blob: Blob) => Promise<void>;
  finish: () => Promise<void>;
}

interface DirectoryPicker {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
}

export const canPickFolder = () => typeof (window as unknown as DirectoryPicker).showDirectoryPicker === "function";

/** Asks for a folder (null when the user cancels). */
export async function folderTarget(): Promise<Target | null> {
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await (window as unknown as DirectoryPicker).showDirectoryPicker!({ id: "photon-export", mode: "readwrite" });
  } catch {
    return null;
  }
  return {
    write: async (name, blob) => {
      const file = await dir.getFileHandle(name, { create: true });
      const out = await file.createWritable();
      await out.write(blob);
      await out.close();
    },
    finish: async () => {},
  };
}

/** A zip, offered as a download when it's complete (JPEGs are stored, not compressed again). */
export function zipTarget(zipName: string): Target {
  const chunks: BlobPart[] = [];
  let done!: () => void;
  let failed!: (e: unknown) => void;
  const finished = new Promise<void>((resolve, reject) => {
    done = resolve;
    failed = reject;
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) return failed(err);
    chunks.push(chunk as Uint8Array<ArrayBuffer>);
    if (final) done();
  });
  return {
    write: async (name, blob) => {
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      entry.push(new Uint8Array(await blob.arrayBuffer()), true);
    },
    finish: async () => {
      zip.end();
      await finished;
      const url = URL.createObjectURL(new Blob(chunks, { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  };
}
