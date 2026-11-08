/**
 * Does a text frame's text not fit? Counted in lines × line height, in screen pixels: the
 * element's own scroll sizes are whole numbers of page units (a millimetre each, far too coarse)
 * and include the font's ascent and descent, which for HAPPY DONUTS are much taller than its
 * letters (so "DEEL 2" looked too big for a frame it fits in).
 */
export function textOverflows(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const scale = box.width / (parseFloat(style.width) || 1);
  const line = parseFloat(style.lineHeight) * scale;
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0);
  if (!rects.length || !line) return false;
  const tops: number[] = [];
  for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) < line / 2)) tops.push(r.top);
  const tooTall = tops.length * line > box.height + 0.5;
  // a space where a line wraps hangs past the edge: only real text (wider than half a line) counts
  const tooWide = rects.some((r) => r.width > line / 2 && r.right > box.right + 1);
  return tooTall || tooWide;
}
