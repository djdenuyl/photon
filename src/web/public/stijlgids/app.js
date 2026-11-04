const MM = 25.4;
const RECENT = /^202[234]/;

const KINDS = {
  "raster": { label: "Raster met marge", group: "raster", info: "Foto's in een strak raster met 10 mm buitenmarge en 5 mm tussenruimte op een witte pagina." },
  "paginavullend": { label: "Paginavullende foto", group: "groot", info: "Eén foto vult een hele pagina tot in de afloop." },
  "grote-foto": { label: "Grote foto", group: "groot", info: "Eén foto beslaat minstens de helft van de pagina, de rest is raster." },
  "over-de-rug": { label: "Over de rug", group: "groot", info: "Een foto loopt door over beide pagina's, als panorama of als achtergrond voor de spread." },
  "zonder-marge": { label: "Zonder marge", group: "rand", info: "Alle foto's lopen tot de paginarand; geen wit kader rond de pagina." },
  "gemengde-bleed": { label: "Gemengde bleed", group: "rand", info: "Sommige foto's lopen van de pagina af, andere houden marge. Doorbreekt het raster bewust." },
  "overlap": { label: "Overlappende foto's", group: "collage", info: "Foto's liggen (deels) over elkaar heen." },
  "vormen": { label: "Vormen en frames", group: "collage", info: "Foto's in een masker of frame: cirkels, letters, polaroids." },
  "gedraaid": { label: "Gedraaide foto's", group: "collage", info: "Foto's licht scheef geplaatst, als losse afdrukken op tafel." },
  "foto-achtergrond": { label: "Foto als achtergrond", group: "achtergrond", info: "Een foto is de achtergrond van de pagina, met kleinere foto's erop." },
  "gekleurde-achtergrond": { label: "Kleur of patroon", group: "achtergrond", info: "Een effen kleur of Albelli-achtergrond in plaats van wit." },
  "clipart": { label: "Clipart", group: "collage", info: "Decoratieve elementen uit Albelli." },
};
const GROUPS = {
  raster: { label: "Raster", color: "var(--g-raster)" },
  groot: { label: "Groot / paginavullend", color: "var(--g-groot)" },
  collage: { label: "Collage (overlap, vormen)", color: "var(--g-collage)" },
  rand: { label: "Zonder marge / gemengde bleed", color: "var(--g-rand)" },
  achtergrond: { label: "Foto- of kleurachtergrond", color: "var(--g-achtergrond)" },
};
const GROUP_PRIORITY = ["groot", "collage", "rand", "achtergrond", "raster"];

// Content themes for the rhythm view; colours reuse the categorical slots in fixed order.
const THEMES = {
  vakantie: { label: "Vakantie en weekend weg", color: "var(--g-groot)", cats: ["zomervakantie", "korte-vakantie", "weekendje-weg"] },
  traditie: { label: "Traditie en feestdag", color: "var(--g-rand)", cats: ["sinterklaas", "kerst", "oud-en-nieuw", "verjaardag", "familieweekend", "feestdag"] },
  uitje: { label: "Uitje, bezoek, feest", color: "var(--g-collage)", cats: ["dagje-uit", "bezoek-vrienden-familie", "logeren", "feest-bruiloft", "werk-hobby"] },
  kind: { label: "Mijlpaal kind", color: "var(--g-achtergrond)", cats: ["mijlpaal-kind"] },
  dagelijks: { label: "Dagelijks leven, huis, seizoen", color: "var(--g-raster)", cats: ["dagelijks-leven", "seizoen-natuur", "huis-tuin-klussen"] },
};
const CATEGORY_LABELS = {
  "familieweekend": "Familieweekend", "sinterklaas": "Sinterklaas", "kerst": "Kerst", "oud-en-nieuw": "Oud en nieuw", "verjaardag": "Verjaardag",
  "zomervakantie": "Zomervakantie", "korte-vakantie": "Korte vakantie", "weekendje-weg": "Weekendje weg", "dagje-uit": "Dagje uit", "logeren": "Logeren",
  "mijlpaal-kind": "Mijlpaal kind", "feestdag": "Feestdag", "feest-bruiloft": "Feest / bruiloft", "huis-tuin-klussen": "Huis en tuin",
  "bezoek-vrienden-familie": "Bezoek", "dagelijks-leven": "Dagelijks leven", "seizoen-natuur": "Seizoen / natuur", "werk-hobby": "Werk / hobby",
  "titel-omslag": "Omslag / titel", "anders": "Anders",
};

function themeOf(a) {
  if (!a) return null;
  return Object.keys(THEMES).find((t) => THEMES[t].cats.includes(a.category)) || null;
}

const state = { books: [], stats: null, list: [], viewerIndex: 0, filterBook: "all", filterKind: null, filterIds: null, filterLabel: null, rhythmMode: "technique" };
const $ = (s) => document.querySelector(s);
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/* ---------- data ---------- */

async function load() {
  const [books, stats, photos] = await Promise.all([
    fetch("../data/albelli/books.json").then((r) => r.json()),
    fetch("../data/albelli/stats.json").then((r) => r.json()),
    fetch("../data/albelli/photos.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  state.photos = photos;
  state.ctx = await fetch("../data/albelli/context.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  state.graphics = await fetch("../data/albelli/graphics.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  state.books = books;
  state.stats = stats;
  state.spreads = [];
  books.forEach((book, bi) => {
    book.surfaces.forEach((surface, si) => {
      const feat = stats.books[bi].surfaces[si];
      const analysis = state.ctx?.books[book.slug]?.surfaces[si] || null;
      state.spreads.push({ book, bookIndex: bi, surface, feat, analysis, group: groupOf(feat), theme: themeOf(analysis), id: `${bi}-${si}` });
    });
  });
}

function groupOf(feat) {
  const groups = new Set(feat.kinds.map((k) => KINDS[k]?.group).filter(Boolean));
  return GROUP_PRIORITY.find((g) => groups.has(g)) || "raster";
}

/* ---------- rendering a surface as SVG ---------- */

let uid = 0;

function tone(id) {
  let h = 0;
  for (const c of id || "x") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} ${10 + (h % 9)}% ${50 + ((h >> 8) % 18)}%)`;
}

function renderSurface(surface, opts = {}) {
  const W = surface.w, H = surface.h;
  const id = `s${uid++}`;
  const vb = opts.viewBox || [0, 0, W, H];
  const defs = [`<clipPath id="${id}-trim"><rect width="${W}" height="${H}"/></clipPath>`];
  const body = [];

  for (const e of surface.elements) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const rot = e.rotation ? ` transform="rotate(${e.rotation} ${cx} ${cy})"` : "";
    if (e.type === "background-color" || e.type === "color") {
      body.push(`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="${e.color || "#fff"}"${rot}/>`);
    } else if (e.type === "background-asset") {
      body.push(`<image href="${e.href}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="xMidYMid slice"${rot}/>`);
    } else if (e.type === "clipart") {
      body.push(`<image href="${e.href}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="xMidYMid meet"${rot}/>`);
    } else if (e.type === "photo" || e.type === "background-photo") {
      const fill = tone(e.photoId);
      const thumb = state.photos[e.photoId]?.thumb;
      const c = e.crop;
      const content = thumb && c
        ? `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="${fill}"/><svg x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" overflow="hidden"><image href="../data/albelli/thumbs/300/${thumb}" x="${(e.w - c.width) / 2 + c.offsetX}" y="${(e.h - c.height) / 2 + c.offsetY}" width="${c.width}" height="${c.height}" preserveAspectRatio="none"/></svg>`
        : `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="${fill}"/>`;
      let mask = "";
      if (e.decoration?.mask) {
        const mid = `${id}-m${defs.length}`;
        defs.push(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}"><image href="${e.decoration.mask}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="none"/></mask>`);
        mask = ` mask="url(#${mid})"`;
      }
      body.push(`<g${rot}><g${mask}>${content}</g>` +
        (e.decoration?.frame ? `<image href="${e.decoration.frame}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="none"/>` : "") +
        `</g>`);
    } else if (e.type === "text") {
      const k = 100;
      const size = parseFloat(e.fontSize) || 10;
      const style = [
        `font-family:'${e.font || "Open Sans"}','Open Sans',sans-serif`,
        `font-size:${(size / 72) * k}px`,
        `line-height:1.3`,
        `color:${e.color || "#000"}`,
        `text-align:${e.align || "left"}`,
        `font-weight:${e.bold ? 700 : 400}`,
        `white-space:pre-wrap`,
        `overflow-wrap:break-word`,
      ].join(";");
      body.push(`<g transform="${e.rotation ? `rotate(${e.rotation} ${cx} ${cy}) ` : ""}translate(${e.x} ${e.y}) scale(${1 / k})">` +
        `<foreignObject width="${e.w * k}" height="${e.h * k}"><div xmlns="http://www.w3.org/1999/xhtml" style="${style}">${esc(e.content)}</div></foreignObject></g>`);
    }
  }

  const fold = [];
  if (surface.target === "spread" || surface.target === "cover") {
    const gid = `${id}-fold`;
    defs.push(`<linearGradient id="${gid}"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`);
    fold.push(`<rect x="${W / 2 - 0.25}" y="0" width="0.5" height="${H}" fill="url(#${gid})"/>`);
  }

  const guides = [];
  if (opts.guides) {
    const m = 10 / MM;
    const pages = surface.target === "page" ? [[0, W]] : [[0, W / 2], [W / 2, W]];
    for (const [x0, x1] of pages) {
      guides.push(`<rect x="${x0 + m}" y="${m}" width="${x1 - x0 - 2 * m}" height="${H - 2 * m}" fill="none" stroke="#e5484d" stroke-width="1.25" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`);
    }
  }

  return `<svg class="spread" viewBox="${vb.join(" ")}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(surface.label)}">
    <defs>${defs.join("")}</defs>
    <g clip-path="url(#${id}-trim)"><rect width="${W}" height="${H}" fill="#fff"/>${body.join("")}${fold.join("")}</g>${guides.join("")}
  </svg>`;
}

/* ---------- small UI helpers ---------- */

function bars(el, rows, opts = {}) {
  const max = opts.max ?? Math.max(...rows.map((r) => r.value), 0.0001);
  el.innerHTML = rows.map((r) => `
    <div class="bar" ${r.kind ? `data-kind="${r.kind}"` : ""} data-tip="${esc(r.tip || "")}">
      <span class="name">${esc(r.name)}</span>
      <span class="track"><span class="fill" style="width:${(r.value / max) * 100}%;${r.color ? `background:${r.color}` : ""}"></span></span>
      <span class="val">${r.label ?? pct(r.value)}</span>
    </div>`).join("");
}

function tooltips() {
  const tip = $("#tooltip");
  document.addEventListener("pointermove", (ev) => {
    const t = ev.target.closest?.("[data-tip]");
    const text = t?.dataset.tip;
    if (!text) { tip.hidden = true; return; }
    tip.textContent = text;
    tip.hidden = false;
    const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${ev.clientY + 16}px`;
  });
}

function dateRange(s) {
  const dates = s.surface.elements.map((e) => state.photos[e.photoId]).filter((p) => p?.role === "photo" && p.date).map((p) => p.date).sort();
  if (!dates.length) return "";
  const fmt = (d) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  const days = new Set(dates).size;
  return dates[0] === dates.at(-1) ? fmt(dates[0]) : `${fmt(dates[0])} – ${fmt(dates.at(-1))} · ${days} ${days === 1 ? "dag" : "dagen"}`;
}

function spreadName(s) {
  return s.surface.target === "cover" ? "Omslag" : s.surface.target === "page" ? `Pagina ${s.surface.label}` : `Spread ${s.surface.label}`;
}

/* ---------- sections ---------- */

function renderHero() {
  const a = state.stats.all;
  const captions = a.textCount;
  $("#hero-stats").innerHTML = [
    [state.books.length, "jaarboeken"],
    [a.spreads, "spreads"],
    [a.photos.toLocaleString("nl-NL"), "foto's geplaatst"],
    [captions, "teksten"],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
}

function renderBasis() {
  const a = state.stats.all;
  const gaps = a.gapHistogramMm;
  const gapShare = ((gaps["5"] || 0) + (gaps["4"] || 0) + (gaps["6"] || 0)) / sum(gaps);
  const positive = Object.entries(a.minMarginMm).filter(([k]) => +k > 0).reduce((n, [, v]) => n + v, 0);
  const tenMm = (a.minMarginMm["10"] || 0) / positive;
  const perPage = Object.entries(a.photosPerPage).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => +k).sort((x, y) => x - y);
  const white = a.pageBackground.white / a.pages;
  const specs = [
    ["21 × 28 cm", "Staand L, harde kaft. Spread 42 × 28 cm, 4,5 mm afloop."],
    ["10 mm", `Buitenmarge rondom. ${pct(tenMm)} van de pagina's met marge gebruikt precies 10 mm.`],
    ["5 mm", `Tussenruimte tussen foto's (${pct(gapShare)} van alle naden).`],
    ["2 × 10 mm", "Rond de rug: foto's blijven 10 mm van de vouw, dus 20 mm tussen de pagina's."],
    [`${a.medianPhotosPerSpread}`, `Foto's per spread (mediaan). Meestal ${perPage.join(", ")} per pagina.`],
    [pct(a.medianCoverage), "Mediaan van het pagina-oppervlak dat met foto's gevuld is."],
    [pct(white), "Van de pagina's heeft een witte achtergrond."],
  ];
  $("#spec-grid").innerHTML = specs.map(([b, s]) => `<div class="spec"><b>${b}</b><span>${s}</span></div>`).join("");

  const examples = state.spreads.filter((s) => RECENT.test(s.book.name) && s.surface.target === "spread" && s.feat.kinds.join() === "raster" && s.feat.photos >= 9 && s.feat.photos <= 11);
  const pick = [examples[3], examples[Math.floor(examples.length / 2)], examples[examples.length - 4]].filter(Boolean);
  $("#basis-example").innerHTML = pick.map((s) => `<div class="card" data-open="${s.id}">${renderSurface(s.surface, { guides: true })}<div class="label"><span>${esc(s.book.name)}</span><span>${spreadName(s)}</span></div></div>`).join("");
}

function renderVariatie() {
  const a = state.stats.all;
  const kindRows = Object.entries(a.kinds).map(([k, v]) => ({
    kind: k, name: KINDS[k]?.label || k, value: v / a.spreads, color: GROUPS[KINDS[k]?.group]?.color,
    tip: `${v} van ${a.spreads} spreads`,
  }));
  bars($("#kind-bars"), kindRows);

  const p = a.pages;
  const pageRows = [
    ["Foto als achtergrond", a.pageBackground.photo || 0],
    ["Paginavullende foto", a.pagesFullPhoto],
    ["Grote foto (≥ ½ pagina)", a.pagesBigPhoto],
    ["Zonder marge", a.pageMargin["no-margin"] || 0],
    ["Gemengde bleed", a.pageMargin.mixed || 0],
    ["Overlap", a.pagesOverlap],
    ["Vormen en frames", a.pagesShaped],
    ["Gedraaid", a.pagesRotated],
  ].map(([name, v]) => ({ name, value: v / p, tip: `${v} van ${p} pagina's` }));
  bars($("#page-bars"), pageRows);

  $("#kind-bars").addEventListener("click", (ev) => {
    const row = ev.target.closest("[data-kind]");
    if (!row) return;
    document.querySelectorAll("#kind-bars .bar").forEach((b) => b.classList.toggle("active", b === row));
    showKindExamples(row.dataset.kind);
  });

  // heat table
  const kinds = Object.keys(a.kinds);
  const cells = state.stats.books.map((b) => kinds.map((k) => (b.summary.kinds[k] || 0) / b.summary.spreads));
  const max = Math.max(...cells.flat());
  $("#heat").innerHTML = `<thead><tr><th></th>${kinds.map((k) => `<th>${esc(KINDS[k]?.label || k)}</th>`).join("")}</tr></thead><tbody>` +
    state.stats.books.map((b, i) => `<tr><th>${esc(b.name)}</th>${cells[i].map((v, j) => {
      const alpha = v / max;
      return `<td style="background:rgb(var(--heat) / ${(0.06 + alpha * 0.94).toFixed(2)});color:${alpha > 0.5 ? "#fff" : "var(--ink)"}" data-tip="${esc(b.name)} · ${esc(KINDS[kinds[j]]?.label)}: ${b.summary.kinds[kinds[j]] || 0} van ${b.summary.spreads} spreads">${Math.round(v * 100)}</td>`;
    }).join("")}</tr>`).join("") + `</tbody>`;
}

function showKindExamples(kind) {
  const matches = state.spreads.filter((s) => s.feat.kinds.includes(kind) && s.surface.target !== "cover");
  // spread the picks across books
  const byBook = new Map();
  for (const s of matches) (byBook.get(s.bookIndex) || byBook.set(s.bookIndex, []).get(s.bookIndex)).push(s);
  const picks = [];
  for (let round = 0; picks.length < 6 && round < 10; round++) {
    for (const list of byBook.values()) if (list[round] && picks.length < 6) picks.push(list[round]);
  }
  $("#kind-examples").innerHTML = `
    <div class="head"><h3>${esc(KINDS[kind].label)}</h3><button class="ghost" data-gallery-kind="${kind}">Alle ${matches.length} in de galerij →</button></div>
    <p>${esc(KINDS[kind].info)}</p>
    <div class="example-row">${picks.map((s) => `<div class="card" data-open="${s.id}">${renderSurface(s.surface)}<div class="label"><span>${esc(s.book.name)}</span><span>${spreadName(s)}</span></div></div>`).join("")}</div>`;
}

function renderRitme() {
  const byTheme = state.rhythmMode === "theme";
  const legend = byTheme ? Object.values(THEMES) : GROUP_PRIORITY.map((g) => GROUPS[g]);
  $("#rhythm-legend").innerHTML = legend.map((g) => `<span><i style="background:${g.color}"></i>${g.label}</span>`).join("");
  $("#rhythm").innerHTML = state.books.map((book, bi) => {
    const cells = state.spreads.filter((s) => s.bookIndex === bi).map((s) => {
      const color = byTheme ? (THEMES[s.theme]?.color || "var(--hair)") : GROUPS[s.group].color;
      const tip = `${spreadName(s)} · ${s.analysis?.event || ""} · ${s.feat.kinds.map((k) => KINDS[k]?.label || k).join(", ") || "leeg"}`;
      return `<span class="cell" data-open="${s.id}" style="background:${color}" data-tip="${esc(tip)}"></span>`;
    }).join("");
    return `<div class="rhythm-row"><span class="name">${esc(book.name)}</span><div class="cells">${cells}</div></div>`;
  }).join("");
}

$("#rhythm-mode").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  state.rhythmMode = chip.dataset.mode;
  document.querySelectorAll("#rhythm-mode .chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
  renderRitme();
});

function textElements() {
  const out = [];
  for (const s of state.spreads) {
    const photos = s.surface.elements.filter((e) => e.type === "photo" || e.type === "background-photo");
    for (const t of s.surface.elements.filter((e) => e.type === "text" && e.content)) {
      const area = t.w * t.h;
      const over = Math.max(0, ...photos.map((p) =>
        Math.max(0, Math.min(t.x + t.w, p.x + p.w) - Math.max(t.x, p.x)) * Math.max(0, Math.min(t.y + t.h, p.y + p.h) - Math.max(t.y, p.y)) / area));
      out.push({ s, t, onPhoto: over > 0.5 });
    }
  }
  return out;
}

function renderTekst() {
  const a = state.stats.all;
  const fonts = a.textFonts;
  const caption = (fonts["Open Sans 10pt"] || 0) / a.textCount;
  const onPhoto = (a.textPlacement["on-photo"] || 0) / a.textCount;
  const align = a.textAlign;
  const pagesWithText = a.pagesWithText / a.pages;
  $("#text-specs").innerHTML = [
    ["Open Sans 10pt", `${pct(caption)} van alle teksten. Titels in Open Sans bold, 18–28pt.`],
    [pct(onPhoto), "van de teksten staat op een foto, niet in het wit."],
    [`${a.captionChars.median} tekens`, `Mediane lengte van een onderschrift: één korte zin. Langste: ${a.captionChars.max}.`],
    [`${Math.round(a.captionWidthMm)} mm`, "Mediane breedte van een tekstvak: ongeveer een kwart van de spread."],
    [pct(pagesWithText), "van de pagina's heeft tekst, bijna altijd één vak per pagina."],
    [`${pct(align.left / sum(align))} links`, `${pct(align.right / sum(align))} rechts, ${pct(align.center / sum(align))} gecentreerd uitgelijnd.`],
  ].map(([b, s]) => `<div class="spec"><b>${b}</b><span>${s}</span></div>`).join("");

  const placementNames = { "on-photo": "Op een foto", "between-photos": "In het wit tussen foto's", "in-margin": "In de buitenmarge" };
  bars($("#text-placement"), Object.entries(a.textPlacement).map(([k, v]) => ({ name: placementNames[k] || k, value: v / a.textCount, tip: `${v} teksten` })));
  const colorNames = { "#ffffff": "Wit", "#000000": "Zwart", "#ffffd8": "Crème (#ffffd8)" };
  const colorRows = Object.entries(a.textColor).slice(0, 4).map(([k, v]) => ({ name: colorNames[k] || k, value: v / a.textCount, tip: `${v} teksten` }));
  const other = a.textCount - colorRows.reduce((n, r) => n + Math.round(r.value * a.textCount), 0);
  if (other > 0) colorRows.push({ name: "Overig", value: other / a.textCount, tip: `${other} teksten` });
  bars($("#text-color"), colorRows);

  const texts = textElements().filter((x) => RECENT.test(x.s.book.name));
  const pick = (fn, n) => texts.filter(fn).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / n)) === 0).slice(0, n);
  const groups = [
    ["Wit op foto", pick((x) => x.onPhoto && x.t.color === "#ffffff" && x.t.fontSize === "10pt", 2)],
    ["Zwart op foto", pick((x) => x.onPhoto && x.t.color === "#000000" && x.t.fontSize === "10pt", 2)],
    ["Crème op foto", pick((x) => x.onPhoto && x.t.color === "#ffffd8", 1)],
    ["In het wit", pick((x) => !x.onPhoto && x.t.fontSize === "10pt", 2)],
    ["Titel", pick((x) => parseFloat(x.t.fontSize) >= 18, 1)],
  ];
  $("#text-examples").innerHTML = groups.flatMap(([label, list]) => list.map(({ s, t }) => {
    const pad = 22 / MM;
    const x = Math.max(0, t.x - pad), y = Math.max(0, t.y - pad);
    const w = Math.min(s.surface.w - x, t.w + 2 * pad), h = Math.min(s.surface.h - y, t.h + 2 * pad);
    return `<div class="text-example" data-open="${s.id}">${renderSurface(s.surface, { viewBox: [x, y, w, h] })}<p><b>${esc(label)}</b> · ${esc(t.fontSize)}, ${esc(t.align)} · ${esc(s.book.name)}</p></div>`;
  })).join("");
}

function renderRegels() {
  const recent = state.stats.books.filter((b) => RECENT.test(b.name));
  const spreads = recent.reduce((n, b) => n + b.summary.spreads, 0);
  const k = (kind) => recent.reduce((n, b) => n + (b.summary.kinds[kind] || 0), 0) / spreads;
  const per10 = (v) => (v * 10).toFixed(1).replace(".", ",");

  // Rhythm: how often is a deviating spread followed by a plain grid spread?
  let dev = 0, devThenRaster = 0, longest = 0;
  for (const b of recent) {
    const seq = b.surfaces.filter((s) => s.target === "spread").map((s) => groupOf(s) !== "raster");
    let run = 0;
    seq.forEach((d, i) => {
      run = d ? run + 1 : 0;
      longest = Math.max(longest, run);
      if (d && i + 1 < seq.length) { dev++; if (!seq[i + 1]) devThenRaster++; }
    });
  }
  const rasterShare = k("raster");
  const a = state.stats.all;
  const onPhotoShare = (a.textPlacement["on-photo"] || 0) / a.textCount;

  const rules = [
    [`Begin bij het raster`, `10 mm buitenmarge, 5 mm tussenruimte, 10 mm van de rug, witte achtergrond. ${pct(rasterShare)} van de recente spreads is precies dit.`],
    [`Wissel af`, `Per 10 spreads ongeveer ${per10(k("paginavullend") + k("grote-foto"))} met een paginavullende of grote foto, ${per10(k("overlap"))} met overlappende foto's, ${per10(k("zonder-marge") + k("gemengde-bleed"))} zonder marge of met gemengde bleed, ${per10(k("foto-achtergrond"))} met een foto als achtergrond en ${per10(k("gekleurde-achtergrond"))} met een kleur of patroon.`],
    [`Doseer de afwijkingen`, `Na een afwijkende spread volgt in ${pct(devThenRaster / dev)} van de gevallen weer een rasterspread. Hoogstens ${longest} afwijkende spreads achter elkaar.`],
    [`Vul de pagina`, `Ongeveer ${a.medianPhotosPerSpread} foto's per spread, meestal 4–6 per pagina, ~${pct(a.medianCoverage)} van het oppervlak.`],
    [`Tekst op de foto`, `Open Sans 10pt, ${pct(onPhotoShare)} op een foto, in wit of zwart (soms crème). Eén korte zin (~${a.captionChars.median} tekens), ongeveer ${Math.round(a.captionWidthMm)} mm breed, links of rechts uitgelijnd.`],
    [`Omslag en titel`, `Voorkant in HAPPY DONUTS-fotoletters op een paginavullende foto, achterkant als scherven-collage met pastel-tint, beide uit Inkscape op 300 dpi. Titel op rug en eerste pagina in Open Sans bold: "Het Jaar Rond <jaar> - deel <n>".`],
  ];
  const ctx = state.ctx;
  if (ctx) {
    const recentEv = ctx.events.filter((e) => e.year !== "2020" && !["zomervakantie", "dagelijks-leven", "titel-omslag", "mijlpaal-kind", "anders"].includes(e.category));
    const oneDay = recentEv.filter((e) => Number(e.photoDays) <= 1);
    const upToOne = oneDay.filter((e) => Number(e.spreads) <= 1).length / oneDay.length;
    const heroes = ctx.heroes.filter((h) => !h.book.startsWith("2020") && h.category !== "titel-omslag");
    const hk = countBy(heroes.map(heroKind));
    rules.splice(1, 0,
      ["Eén gebeurtenis, één spread", `${pct(upToOne)} van de gebeurtenissen van één dag krijgt een halve of hele spread. Meerdaagse dingen (weekend weg, festival) krijgen ruwweg één spread per dag; alleen de zomervakantie loopt door tot 16–22 spreads.`],
      ["Klein spul bundelen", "Losse dagelijkse momenten gaan samen op een verzamelspread per maand. Twee kleine gebeurtenissen uit dezelfde week mogen links en rechts op één spread, elk met een eigen onderschrift."],
      ["Wat groot mag", `Een grote foto is een portret van een kind met oogcontact of een lach (${pct((hk.kind || 0) / heroes.length)}), een sfeerbeeld van de plek (${pct((hk.plek || 0) / heroes.length)}) of de groepsfoto van een familiemoment (${pct((hk.groep || 0) / heroes.length)}). Soms staat dezelfde scène ook klein op de spread: de favoriet wordt uitvergroot.`],
      ["Speels met een reden", "Overlap, foto-achtergronden, frames en schuine foto's horen bij uitjes, feesten, vakanties en maandopeners. Dagelijks leven en stadsbezoeken staan in een rustig wit raster."],
    );
    rules.push(["Tekst vertelt wat de foto niet laat zien", "Wie, waar en waarom; een uitspraak van een kind; of een vaste formule ('Hoera! … jarig', 'Sint met de …'). Bij een reeks alleen op de eerste spread."]);
  }
  $("#rules").innerHTML = rules.map(([b, s]) => `<li><b>${esc(b)}.</b> <span>${esc(s)}</span></li>`).join("");
}


/* ---------- context (content analysis) ---------- */

const MONTH_NAMES = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : 0; };
const fmtSpreads = (v) => `${String(v).replace(".", ",")} ${v === 1 ? "spread" : "spreads"}`;
const spreadBy = (slug, index) => state.byId.get(`${state.books.findIndex((b) => b.slug === slug)}-${index}`);
const slugOf = (bookName) => state.books.find((b) => b.name === bookName)?.slug;

function countBy(xs) {
  const c = {};
  for (const x of xs) c[x] = (c[x] || 0) + 1;
  return c;
}

function spreadDates(s) {
  return s.surface.elements.map((e) => state.photos[e.photoId]).filter((p) => p?.role === "photo" && p.date).map((p) => p.date).sort();
}

function heroKind(h) {
  const t = `${h.what} ${h.whyChosen}`.toLowerCase();
  if (/landschap|sfeerbeeld/.test(t)) return "plek";
  if (/groep|familiefoto|familieportret|selfie|gezinsfoto|gezinsportret|allemaal/.test(t)) return "groep";
  if (/landschap|strand|zee|lucht|bos|sneeuw|uitzicht|sfeer|meer|berg|polder|wolk|zonsondergang|plek|stad|gebouw|kasteel|veld|heide/.test(t) && !/portret|close-up/.test(t)) return "plek";
  if (/mijlpaal|eerste|geboorte|zwanger|buik|fiets/.test(t)) return "mijlpaal";
  return "kind";
}
const HERO_KINDS = {
  kind: { label: "Portret van een kind", color: "var(--g-groot)" },
  plek: { label: "Plek of sfeer", color: "var(--g-collage)" },
  groep: { label: "Groep of gezin", color: "var(--g-rand)" },
  mijlpaal: { label: "Mijlpaal", color: "var(--g-achtergrond)" },
};

function renderContext() {
  const ctx = state.ctx;
  if (!ctx) { $("#context").hidden = true; return; }
  const recent = ctx.events.filter((e) => e.year !== "2020");

  // Structure: synthesised from the per-book analyses; numbers computed where possible.
  const pairs = Object.entries(ctx.pageRelation).filter(([b]) => !b.startsWith("2020"));
  const pairTotal = pairs.reduce((n, [, c]) => n + sum(c), 0);
  const collect = pairs.reduce((n, [, c]) => n + (c["verzamelpagina losse momenten"] || 0), 0);
  const insights = [
    ["Twee boeken per jaar", "Vanaf 2021: deel 1 loopt van januari tot de zomer, deel 2 van juli tot oud en nieuw. De grens volgt het aantal pagina's; de zomervakantie kan over beide delen lopen (2022)."],
    ["Maanden als hoofdstukken", "Elke maand opent met de maandnaam in fotoletters (zelf gemaakt, als afbeelding geplaatst). Die staat waar de eerste foto's van de maand vallen, ook midden in een gebeurtenis. 2020 gebruikte nog tekstkoppen."],
    ["Chronologisch, met ruimte voor verhaal", "Strikt op datum, behalve waar het verhaal het vraagt: 'ondertussen…'-spreads bij gelijktijdige gebeurtenissen, themaspreads met foto's van een hele maand (badtijd, dutjes), en in 2024 themasecties achterin."],
    ["Verzamelspreads", `${pct(collect / pairTotal)} van de spreads bundelt losse dagelijkse momenten (10–24 foto's, meestal zonder tekst). Zo krijgen kleine dingen een plek zonder een eigen spread.`],
    ["Verhaallijn per jaar", "Elk jaar heeft een rode draad die op het omslag terugkomt: 2020 huis en zwangerschap, 2021 het babyjaar, 2023 opnieuw zwanger, 2024 de geboorte en een gezin van vier."],
    ["Omslag buiten Albelli", "Het omslag (front/back) wordt als kant-en-klare afbeelding geüpload, met de titel in letters gevuld met foto's van het jaar."],
  ];
  $("#structure").innerHTML = insights.map(([b, t]) => `<div class="insight"><b>${esc(b)}</b><span>${esc(t)}</span></div>`).join("");

  // Space budget.
  const skip = new Set(["zomervakantie", "dagelijks-leven", "titel-omslag", "mijlpaal-kind", "anders"]);
  const oneDay = recent.filter((e) => !skip.has(e.category) && Number(e.photoDays) <= 1);
  const bucket = (v) => (v <= 0.5 ? "½ spread" : v <= 1 ? "1 spread" : v <= 2 ? "2 spreads" : "meer");
  const buckets = countBy(oneDay.map((e) => bucket(Number(e.spreads))));
  bars($("#budget-bars"), ["½ spread", "1 spread", "2 spreads", "meer"].map((k) => ({ name: k, value: (buckets[k] || 0) / oneDay.length, tip: `${buckets[k] || 0} van ${oneDay.length} gebeurtenissen` })));
  const multi = recent.filter((e) => !skip.has(e.category) && Number(e.photoDays) >= 2).sort((a, b) => b.spreads - a.spreads).slice(0, 14);
  $("#budget-multi").innerHTML = multi.map((e) => {
    const ids = (e.surfaceIndexes || []).map((i) => spreadBy(slugOf(e.book), i)?.id).filter(Boolean);
    return `<div class="multi-row" data-ids="${esc(JSON.stringify(ids))}" data-label="${esc(e.event)}"><span>${esc(e.event)} <span class="tag">${esc(e.year)}</span></span><span>${fmtSpreads(Number(e.spreads))} · ${e.photoDays} dagen</span></div>`;
  }).join("");

  const summer = state.books.filter((b) => !b.name.startsWith("2020")).map((b) => {
    const list = state.spreads.filter((s) => s.book === b && s.surface.target === "spread");
    const n = list.filter((s) => s.analysis?.category === "zomervakantie").length;
    return { name: b.name, value: n / list.length, label: `${n} sp.`, tip: `${n} van ${list.length} spreads` };
  }).filter((r) => r.value > 0);
  bars($("#summer-bars"), summer, { max: 1 });

  const pairKeys = ["één gebeurtenis over beide pagina's", "links en rechts verschillende gebeurtenissen", "deel van meerdaagse reeks over meerdere spreads", "verzamelpagina losse momenten"];
  const pairNames = ["Eén gebeurtenis", "Links en rechts verschillend", "Deel van een reeks", "Verzamelpagina"];
  const pairColors = ["var(--g-groot)", "var(--g-rand)", "var(--g-collage)", "var(--g-achtergrond)"];
  $("#pair-legend").innerHTML = pairNames.map((n, i) => `<span><i style="background:${pairColors[i]}"></i>${n}</span>`).join("");
  $("#pair-bars").innerHTML = Object.entries(ctx.pageRelation).map(([book, c]) => {
    const total = pairKeys.reduce((n, k) => n + (c[k] || 0), 0);
    return `<div class="stack"><span>${esc(book)}</span><div class="seg">${pairKeys.map((k, i) => `<span style="width:${((c[k] || 0) / total) * 100}%;background:${pairColors[i]}" data-tip="${esc(pairNames[i])}: ${c[k] || 0} spreads"></span>`).join("")}</div></div>`;
  }).join("");

  // Traditions heat table.
  const years = ctx.years;
  const shown = ctx.traditions.filter((t) => t.yearsPresent >= 3);
  const max = Math.max(...shown.flatMap((t) => years.map((y) => t.spreadsPerYear[y])));
  $("#traditions").innerHTML = `<thead><tr><th></th>${years.map((y) => `<th style="writing-mode:horizontal-tb;transform:none;height:auto">${y}</th>`).join("")}</tr></thead><tbody>` +
    shown.map((t) => `<tr><th>${esc(t.name)}</th>${years.map((y) => {
      const v = t.spreadsPerYear[y];
      const ids = t.surfaces.map(([slug, idx]) => spreadBy(slug, idx)).filter((s) => s && s.book.name.startsWith(y)).map((s) => s.id);
      const alpha = v / max;
      return `<td data-surfaces="${esc(JSON.stringify(ids))}" data-label="${esc(t.name)} ${y}" style="background:rgb(var(--heat) / ${(0.06 + alpha * 0.94).toFixed(2)});color:${alpha > 0.5 ? "#fff" : "var(--ink)"}" data-tip="${esc(t.name)} ${y}: ${v} spreads">${v || "·"}</td>`;
    }).join("")}</tr>`).join("") + `</tbody>`;

  // Hero photos.
  const heroes = ctx.heroes.filter((h) => !h.book.startsWith("2020") && h.category !== "titel-omslag" && spreadBy(h.slug, h.index)?.surface.target !== "cover" && state.photos[h.photoId]?.thumb);
  const kinds = countBy(heroes.map(heroKind));
  $("#hero-legend").innerHTML = Object.entries(HERO_KINDS).map(([k, v]) => `<span><i style="background:${v.color}"></i>${v.label} · ${pct((kinds[k] || 0) / heroes.length)}</span>`).join("");
  const picks = [];
  for (const k of Object.keys(HERO_KINDS)) picks.push(...heroes.filter((h) => heroKind(h) === k).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 4)) === 0).slice(0, 4));
  $("#heroes").innerHTML = picks.map((h) => {
    const s = spreadBy(h.slug, h.index);
    return `<div class="hero" ${s ? `data-open="${s.id}"` : ""}><img loading="lazy" src="../data/albelli/thumbs/300/${state.photos[h.photoId].thumb}" alt="">
      <p><span class="kind" style="background:${HERO_KINDS[heroKind(h)].color}"></span><b>${esc(h.event)}</b> · ${esc(h.book)}<br>${esc(h.whyChosen)}</p></div>`;
  }).join("");

  // Playful spreads.
  const playful = ctx.playful.filter((p) => !p.book.startsWith("2020"));
  const pPicks = playful.filter((_, i) => i % Math.max(1, Math.floor(playful.length / 6)) === 0).slice(0, 6);
  $("#playful").innerHTML = pPicks.map((p) => {
    const s = spreadBy(p.slug, p.index);
    return s ? `<div class="play card" data-open="${s.id}">${renderSurface(s.surface)}<p><b>${esc(p.event)}</b> · ${esc(p.book)}<br>${esc(p.technique)}: ${esc(p.context)}</p></div>` : "";
  }).join("");

  // Per-book notes.
  const fields = [["chapterStructure", "Opbouw"], ["spaceBudget", "Ruimte"], ["heroPhotoPatterns", "Grote foto's"], ["playfulnessPatterns", "Speelsheid"], ["pagePairing", "Paginaparen"], ["textPatterns", "Tekst"], ["other", "Overig"]];
  $("#book-notes").innerHTML = state.books.map((b) => {
    const sm = ctx.books[b.slug]?.summary;
    if (!sm) return "";
    return `<details class="book-note"><summary>${esc(b.name)}</summary><dl>${fields.filter(([k]) => sm[k]).map(([k, l]) => `<dt>${l}</dt><dd>${esc(sm[k])}</dd>`).join("")}
      <dt>Terugkerend</dt><dd>${esc((sm.recurringEvents || []).join(" · "))}</dd></dl></details>`;
  }).join("");
}

function renderPlaybook() {
  const ctx = state.ctx;
  if (!ctx) { $("#draaiboek").hidden = true; return; }
  const recentYears = ctx.years.filter((y) => y !== "2020");
  const items = ctx.traditions.filter((t) => t.yearsPresent >= 3 && t.name !== "Zomervakantie (reis)").map((t) => {
    const spreads = t.surfaces.map(([slug, idx]) => spreadBy(slug, idx)).filter(Boolean);
    const months = countBy(spreads.flatMap((s) => spreadDates(s).map((d) => +d.slice(5, 7) - 1)));
    const month = +(Object.entries(months).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
    const perYear = recentYears.map((y) => t.spreadsPerYear[y]).filter(Boolean);
    return { name: t.name, month, typical: median(perYear), years: t.yearsPresent };
  });
  const notes = {
    "Kerst": "Per familie of per kerstdag een eigen spread.",
    "Sinterklaas": "Vaak twee vieringen, bij beide families.",
    "Zomer in Voissant": "Onderdeel van de zomervakantie: ruwweg één spread per dag.",
    "Familieweekend": "De groepsfoto is vaak de grote foto.",
    "Verjaardag kind": "Soms met een grote titel ('Lou 3!').",
    "Oud en nieuw": "Opent deel 1 of sluit deel 2 af.",
    "Met opa en oma": "Uitjes en logeren, onder meer als bedankje voor het oppassen.",
    "DTRH-festival": "Vaak met een 'ondertussen…'-spread over het logeren van de kinderen.",
    "Uylendag": "Soms gecombineerd met een babyshower.",
    "Pasen": "Paaseieren zoeken plus familiebrunch.",
    "Herfstwandeling": "Sfeerfoto's van het bos; landschap als grote foto.",
  };
  const zomer = { name: "Zomervakantie", typical: "16–22", years: recentYears.length, note: "Ongeveer één spread per dag; hoogtepunten krijgen er twee. Zo'n 30–40% van deel 2." };
  const item = (i) => `<div class="pb-item"><div><b>${esc(i.name)}</b><br><span>${esc(i.note || notes[i.name] || "")} In ${i.years} van ${i === zomer ? recentYears.length : ctx.years.length} jaar.</span></div><span class="n">${typeof i.typical === "number" ? fmtSpreads(i.typical) : `${i.typical} spreads`}<br><span>per jaar (mediaan)</span></span></div>`;
  $("#playbook").innerHTML = `<div class="playbook">
    <div class="pb-month"><b>Elke maand</b><div class="pb-items">
      <div class="pb-item"><div><b>Maandopener</b><br><span>Maandnaam in fotoletters, op de spread waar de maand begint.</span></div><span class="n">—</span></div>
      <div class="pb-item"><div><b>Verzamelspread dagelijks leven</b><br><span>Losse momenten van de maand, 10–24 foto's, meestal zonder tekst.</span></div><span class="n">1–2 spreads</span></div>
      <div class="pb-item"><div><b>Gebeurtenis van één dag</b><br><span>Uitje, bezoek, feest: één spread, kleine dingen een halve.</span></div><span class="n">½–1 spread</span></div>
    </div></div>` +
    MONTH_NAMES.map((name, m) => {
      const list = items.filter((i) => i.month === m);
      if (name === "juli") list.push(zomer);
      if (!list.length) return "";
      return `<div class="pb-month"><b>${name[0].toUpperCase() + name.slice(1)}</b><div class="pb-items">${list.map(item).join("")}</div></div>`;
    }).join("") + `</div>`;
}


/* ---------- cover and month titles ---------- */

function renderOmslag() {
  const g = state.graphics;
  if (!g) { $("#omslag").hidden = true; return; }
  const items = g.books.flatMap((b) => b.items.map((i) => ({ ...i, book: b.name })));
  const months = items.filter((i) => i.kind === "month");
  const early = months.filter((m) => /^202[12]/.test(m.book) && m.placement);
  const late = months.filter((m) => /^202[34]/.test(m.book) && m.placement);
  const med = (xs) => Math.round(median(xs.map((m) => m.placement.widthMm)));
  const inMargin = late.filter((m) => [10, 11].includes(m.placement.xMm) || m.placement.yMm <= 11 || m.placement.yMm >= 230).length;

  $("#cover-specs").innerHTML = [
    ["Voorkant", "Elk jaar dezelfde stijl. ‘HET JAAR ROND 20XX’ in HAPPY DONUTS, drie letters per regel, vijf regels, letters uitgerekt (×1,2 breed, ×0,83 hoog). Elke letter is een uitsnede van een eigen foto, met een donkere schaduwlaag. Achtergrond: één paginavullende foto. ‘DEEL n’ klein in wit, rechtsonder."],
    ["Achterkant", "Een collage van schuine scherven (5–9 polygonen) die elk een foto bijsnijden, met daarover een pastelkleur op 20% dekking (cyaan, geel, roze, groen, rood, blauw). Vooral selfies en portretten van het gezin."],
    ["Formaat", "210 × 280 mm per kant, geëxporteerd op 300 dpi (2480 × 3307 px) en in Albelli als paginavullende foto op de voor- en achterkant gezet. Rug: Albelli-tekst ‘Het Jaar Rond <jaar> - deel <n>’ in Open Sans bold."],
    ["Maandopener", "De maandnaam in hoofdletters, gevuld met één foto uit die maand, als transparante PNG. Geplaatst op de spread waar de maand begint. Font vanaf 2025: League Spartan Black (Google Fonts, open licentie); het oude font is onbekend."],
    ["Sjabloon 2025", "Hergebruik de kaft van 2022 (kaft_front_deel2.svg / kaft_back_deel2.svg): foto per letter en per scherf vervangen, ‘2022’ → ‘2025’, ‘DEEL n’ aanpassen, exporteren op 300 dpi."],
    [`${med(early)} → ${med(late)} mm`, `Mediane breedte van de maandopener in 2021–22 en 2023–24: eerst een band over de hele pagina, later compact. ${inMargin} van de ${late.length} openers in 2023–24 staan op de 10 mm-marge, boven- of onderaan.`],
  ].map(([b, s]) => `<div class="spec"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("");

  $("#covers").innerHTML = g.books.map((b) => {
    const front = b.items.find((i) => i.kind === "front");
    const back = b.items.find((i) => i.kind === "back");
    return `<div><div class="cover-pair">${[back, front].map((i) => i ? `<img loading="lazy" src="../data/albelli/${i.file}" alt="${esc(i.kind)} ${esc(b.name)}" data-tip="${i.kind === "front" ? "Voorkant" : "Achterkant"} · ${i.px.join(" × ")} px">` : "<span></span>").join("")}</div><p>${esc(b.name)}</p></div>`;
  }).join("");

  $("#month-lede").textContent = "Per boek de maandopeners op schaal (zelfde hoogte). Hover voor de afmeting en plek op de pagina.";
  $("#months").innerHTML = g.books.filter((b) => b.items.some((i) => i.kind === "month")).map((b) => `
    <div class="month-row"><span class="name">${esc(b.name)}</span><div class="month-strip">${b.items.filter((i) => i.kind === "month").map((m) =>
      `<span class="m" data-tip="${esc(m.name)} · ${m.placement ? `${m.placement.widthMm} × ${m.placement.heightMm} mm, ${m.placement.xMm} mm van links, ${m.placement.yMm} mm van boven (${m.placement.surface})` : "niet geplaatst"}"><img loading="lazy" src="../data/albelli/${m.file}" alt="${esc(m.name)}"></span>`).join("")}</div></div>`).join("");

  const sources = g.books.flatMap((b) => b.sources.map((s) => `${b.name}: ${s}`));
  $("#cover-sources").innerHTML = sources.map((s) => `<li>${esc(s)}</li>`).join("") +
    `<li>Overige jaren en alle maandopeners: alleen de geüploade PNG's uit Albelli (data/albelli/graphics/). De Inkscape-bronnen daarvan zijn niet gevonden.</li>`;
}

/* ---------- gallery & viewer ---------- */

function renderFilters() {
  $("#f-book").innerHTML = `<option value="all">Alle boeken</option>` + state.books.map((b, i) => `<option value="${i}">${esc(b.name)}</option>`).join("");
  $("#f-book").addEventListener("change", (e) => { state.filterBook = e.target.value; renderGallery(); });
  const kinds = Object.keys(state.stats.all.kinds);
  $("#f-kinds").innerHTML = kinds.map((k) => `<button class="chip" type="button" data-kind="${k}" aria-pressed="false">${esc(KINDS[k]?.label || k)}</button>`).join("");
  $("#f-kinds").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    setKindFilter(state.filterKind === chip.dataset.kind ? null : chip.dataset.kind);
  });
}

function setKindFilter(kind) {
  state.filterKind = kind;
  document.querySelectorAll("#f-kinds .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.kind === kind)));
  renderGallery();
}

const lazy = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const card = en.target;
    const s = state.byId.get(card.dataset.open);
    card.querySelector(".slot").innerHTML = renderSurface(s.surface);
    lazy.unobserve(card);
  }
}, { rootMargin: "400px" });

function renderGallery() {
  state.list = state.spreads.filter((s) =>
    (!state.filterIds || state.filterIds.has(s.id)) &&
    (state.filterBook === "all" || String(s.bookIndex) === state.filterBook) &&
    (!state.filterKind || s.feat.kinds.includes(state.filterKind)));
  $("#gallery-count").innerHTML = `${state.list.length} ${state.list.length === 1 ? "spread" : "spreads"}` +
    (state.filterIds ? ` · ${esc(state.filterLabel)} <button class="ghost" type="button" id="clear-ids">filter wissen</button>` : "");
  $("#clear-ids")?.addEventListener("click", () => { state.filterIds = null; renderGallery(); });
  const g = $("#gallery");
  g.innerHTML = state.list.map((s) => {
    const ratio = s.surface.h / s.surface.w;
    return `<div class="card" data-open="${s.id}">
      <div class="slot" style="aspect-ratio:${1 / ratio}"></div>
      <div class="label"><span>${esc(s.book.name)} · ${spreadName(s)}</span><span>${dateRange(s)}</span></div>
      <div class="tags">${s.feat.kinds.map((k) => `<span class="tag">${esc(KINDS[k]?.label || k)}</span>`).join("")}</div>
    </div>`;
  }).join("");
  g.querySelectorAll(".card").forEach((c) => lazy.observe(c));
}

function openViewer(id) {
  if (!state.list.some((s) => s.id === id)) state.list = state.spreads;
  state.viewerIndex = state.list.findIndex((s) => s.id === id);
  drawViewer();
  if (!$("#viewer").open) $("#viewer").showModal();
}

function drawViewer() {
  const s = state.list[state.viewerIndex];
  $("#viewer-book").textContent = s.book.name;
  $("#viewer-title").textContent = `${spreadName(s)} · ${s.feat.kinds.map((k) => KINDS[k]?.label || k).join(", ") || "leeg"}`;
  $("#viewer-book").textContent = `${s.book.name} · ${dateRange(s)}`;
  $("#viewer-svg").innerHTML = renderSurface(s.surface, { guides: $("#viewer-guides").checked });
  const marginNames = { margin: "met marge", "no-margin": "zonder marge", mixed: "gemengde bleed", "full-bleed": "volledig afgelopen", empty: "leeg" };
  const pageNames = { left: "Links", right: "Rechts", single: "Pagina", back: "Achterkant", front: "Voorkant" };
  const an = s.analysis;
  const analysisBox = an ? `
    <div class="box wide"><b>${esc(an.event || "")}</b> <span class="tag">${esc(CATEGORY_LABELS[an.category] || an.category || "")}</span>${an.recurringCandidate ? ` <span class="tag">terugkerend</span>` : ""}
      <dl>
        <dt>Paginaparen</dt><dd>${esc(an.pageRelation || "")}${an.leftTheme ? ` — links: ${esc(an.leftTheme)}; rechts: ${esc(an.rightTheme || "")}` : ""}</dd>
        ${an.people ? `<dt>Wie</dt><dd>${esc(an.people)}${an.mood ? ` · ${esc(an.mood)}` : ""}</dd>` : ""}
        ${an.heroPhoto ? `<dt>Grote foto</dt><dd>${esc(an.heroPhoto.what)} — <i>${esc(an.heroPhoto.whyChosen)}</i></dd>` : ""}
        ${an.playfulness ? `<dt>Speels</dt><dd>${esc(an.playfulness.technique)}: ${esc(an.playfulness.context)}</dd>` : ""}
        ${an.backgroundChoice ? `<dt>Achtergrond</dt><dd>${esc(an.backgroundChoice)}</dd>` : ""}
        ${an.textRole ? `<dt>Tekst</dt><dd>${esc(typeof an.textRole === "string" ? an.textRole : JSON.stringify(an.textRole))}</dd>` : ""}
        ${an.notes ? `<dt>Notitie</dt><dd>${esc(an.notes)}</dd>` : ""}
        <dt>Zekerheid</dt><dd>${esc(an.confidence || "")}</dd>
      </dl>
    </div>` : "";
  $("#viewer-meta").innerHTML = analysisBox + s.feat.pages.map((p) => `
    <div class="box"><b>${pageNames[p.page] || p.page}</b>
      <dl>
        <dt>Foto's</dt><dd>${p.photos}${p.bigPhoto ? `, grootste ${pct(p.largestShare)} van de pagina` : ""}</dd>
        <dt>Achtergrond</dt><dd>${esc(p.background)}</dd>
        <dt>Rand</dt><dd>${marginNames[p.margin] || p.margin}${p.minMarginMm != null && p.margin === "margin" ? ` (${p.minMarginMm} mm)` : ""}</dd>
        ${p.overlaps ? `<dt>Overlap</dt><dd>${p.overlaps}×</dd>` : ""}
        ${p.shaped ? `<dt>Vormen</dt><dd>${p.shaped}</dd>` : ""}
        ${p.texts.map((t) => `<dt>Tekst</dt><dd>${esc(t.font)} ${esc(t.size)}, ${esc(t.color)}, ${t.placement === "on-photo" ? "op foto" : "in het wit"}: “${esc(t.content.slice(0, 90))}${t.content.length > 90 ? "…" : ""}”</dd>`).join("")}
      </dl>
    </div>`).join("");
}

function wire() {
  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) return openViewer(open.dataset.open);
    const ids = e.target.closest("[data-surfaces], [data-ids]");
    if (ids) {
      state.filterIds = new Set(JSON.parse(ids.dataset.surfaces || ids.dataset.ids));
      state.filterLabel = ids.dataset.label;
      state.filterBook = "all";
      $("#f-book").value = "all";
      setKindFilter(null);
      $("#galerij").scrollIntoView();
      return;
    }
    const gk = e.target.closest("[data-gallery-kind]");
    if (gk) {
      $("#f-book").value = "all";
      state.filterBook = "all";
      setKindFilter(gk.dataset.galleryKind);
      $("#galerij").scrollIntoView();
    }
  });
  $("#viewer-close").addEventListener("click", () => $("#viewer").close());
  $("#viewer-guides").addEventListener("change", drawViewer);
  const step = (d) => { state.viewerIndex = (state.viewerIndex + d + state.list.length) % state.list.length; drawViewer(); };
  $("#viewer-prev").addEventListener("click", () => step(-1));
  $("#viewer-next").addEventListener("click", () => step(1));
  $("#viewer").addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
  $("#viewer").addEventListener("click", (e) => { if (e.target === $("#viewer")) $("#viewer").close(); });

  const root = document.documentElement;
  try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch {}
  $("#theme-toggle").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch {}
  });
}

await load();
state.byId = new Map(state.spreads.map((s) => [s.id, s]));
wire();
tooltips();
renderHero();
renderBasis();
renderOmslag();
renderVariatie();
renderRitme();
renderContext();
renderTekst();
renderRegels();
renderPlaybook();
renderFilters();
renderGallery();
