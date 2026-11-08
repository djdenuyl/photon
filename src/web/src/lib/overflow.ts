/**
 * Does a text frame's text not fit? Measured on its letters in screen pixels: the lines they sit
 * on × the line height against the frame's height, and whether any letter reaches past a side.
 * Not the element's own scroll sizes (whole page units, a millimetre each, and they count the
 * font's ascent and descent, which for HAPPY DONUTS are much taller than its letters), and not the
 * line boxes either: browsers differ in where they put the spaces around a wrap or at the end of
 * a right-aligned line, which made right-aligned text look too wide. Turned text is measured with
 * the turn taken off for a moment (its screen boxes would be the turned ones).
 */
export function textOverflows(el: HTMLElement): boolean {
  const turned = el.closest("g[data-rot]");
  const turn = turned?.getAttribute("transform") ?? null;
  if (turned && turn) turned.removeAttribute("transform");
  try {
    return measure(el);
  } finally {
    if (turned && turn) turned.setAttribute("transform", turn);
  }
}

/** The screen box of every letter (not spaces or line breaks). */
function letterRects(el: HTMLElement): DOMRect[] {
  const out: DOMRect[] = [];
  const range = document.createRange();
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const text = node.nodeValue ?? "";
    for (let i = 0; i < text.length; ) {
      const size = (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
      if (!/\s/.test(text.slice(i, i + size))) {
        range.setStart(node, i);
        range.setEnd(node, i + size);
        const r = range.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) out.push(r);
      }
      i += size;
    }
  }
  return out;
}

function measure(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const scale = box.width / (parseFloat(style.width) || 1);
  const line = parseFloat(style.lineHeight) * scale;
  const letters = letterRects(el);
  if (!letters.length || !line) return false;
  const tops: number[] = [];
  for (const r of letters) if (!tops.some((t) => Math.abs(t - r.top) < line / 2)) tops.push(r.top);
  const tooTall = tops.length * line > box.height + 0.5;
  const tooWide = letters.some((r) => r.right > box.right + 1 || r.left < box.left - 1);
  return tooTall || tooWide;
}
