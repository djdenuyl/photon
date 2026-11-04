"""Composition statistics per page / spread for the yearbooks -> data/albelli/stats.json.

All Albelli geometry is in inches with the origin at the top-left of the trim box;
elements may extend into the bleed (negative x/y or beyond the trim size).
"""
import json
from collections import Counter
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
BOOKS = ROOT / "data" / "albelli" / "books.json"
OUT = ROOT / "data" / "albelli" / "stats.json"
MM = 25.4
EDGE = 1 / MM  # within 1 mm of the trim edge counts as "touching"
BIG = 0.5  # a photo covering half a page or more is "big"


def mm(v):
    return round(v * MM, 1)


def rect(e):
    return e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]


def inter(a, b):
    ax0, ay0, ax1, ay1 = rect(a)
    bx0, by0, bx1, by1 = rect(b)
    return max(0, min(ax1, bx1) - max(ax0, bx0)) * max(0, min(ay1, by1) - max(ay0, by0))


def page_boxes(surface):
    """Trim boxes of the pages on this surface as (name, x0, x1)."""
    W = surface["w"]
    if surface["target"] == "spread":
        return [("left", 0, W / 2), ("right", W / 2, W)]
    if surface["target"] == "cover":
        return [("back", 0, W / 2), ("front", W / 2, W)]
    return [("single", 0, W)]


def edges_touched(e, x0, x1, H):
    """Which trim edges of the page this element reaches (or bleeds over)."""
    ex0, ey0, ex1, ey1 = rect(e)
    out = []
    if ex0 <= x0 + EDGE:
        out.append("l")
    if ex1 >= x1 - EDGE:
        out.append("r")
    if ey0 <= EDGE:
        out.append("t")
    if ey1 >= H - EDGE:
        out.append("b")
    return out


def page_features(surface, name, x0, x1):
    H = surface["h"]
    pw = x1 - x0
    area = pw * H
    els = surface["elements"]

    def on_page(e):
        cx = e["x"] + e["w"] / 2
        crosses = e["x"] < x0 + pw * 0.9 and e["x"] + e["w"] > x0 + pw * 0.1
        return x0 <= cx < x1 or (crosses and e["w"] > pw * 0.5)

    photos = [e for e in els if e["type"] == "photo" and on_page(e)]
    texts = [e for e in els if e["type"] == "text" and on_page(e)]
    bgs = [e for e in els if e["type"].startswith("background") and on_page(e)]

    page = {"page": name, "x0": x0, "x1": x1}
    bg = "none"
    for b in bgs:
        if b["type"] == "background-photo":
            bg = "photo"
        elif b["type"] == "background-asset":
            bg = "asset"
        elif b["type"] == "background-color" and bg in ("none", "white"):
            bg = "white" if (b.get("color") or "").lower() in ("#ffffff", "#fff") else "color:" + b["color"]
    page["background"] = "white" if bg == "none" else bg
    page["photos"] = len(photos)

    clipped = lambda e: max(0, min(e["x"] + e["w"], x1) - max(e["x"], x0)) * max(0, min(e["y"] + e["h"], H) - max(e["y"], 0))
    shares = sorted((clipped(p) / area for p in photos), reverse=True)
    page["largestShare"] = round(shares[0], 3) if shares else 0
    page["bigPhoto"] = bool(shares) and shares[0] >= BIG
    page["fullPagePhoto"] = any(set(edges_touched(p, x0, x1, H)) >= {"l", "r", "t", "b"} for p in photos)
    page["coverage"] = round(min(sum(shares), 1.5), 3)

    touching = [p for p in photos if edges_touched(p, x0, x1, H)]
    page["bleedPhotos"] = len(touching)
    if not photos:
        page["margin"] = "empty"
    elif page["fullPagePhoto"] or page["background"] == "photo":
        page["margin"] = "full-bleed"
    elif len(touching) == len(photos):
        page["margin"] = "no-margin"
    elif touching:
        page["margin"] = "mixed"
    else:
        page["margin"] = "margin"
    margins = [min(p["x"] - x0, p["y"], x1 - p["x"] - p["w"], H - p["y"] - p["h"]) for p in photos if not p["rotation"]]
    page["minMarginMm"] = mm(min(margins)) if margins else None

    page["overlaps"] = sum(1 for i, a in enumerate(photos) for b in photos[i + 1:] if inter(a, b) > 0.05)
    page["rotated"] = sum(1 for p in photos if 0.5 < abs(p["rotation"]) % 360 < 359.5 and abs(p["rotation"]) % 90 > 0.5)
    page["shaped"] = sum(1 for p in photos if "decoration" in p)
    page["clipart"] = sum(1 for e in els if e["type"] == "clipart" and on_page(e))
    page["texts"] = [text_features(t, photos, x0, x1, H) for t in texts]
    return page


def text_features(t, photos, x0, x1, H):
    pw = x1 - x0
    cx = (t["x"] + t["w"] / 2 - x0) / pw
    cy = (t["y"] + t["h"] / 2) / H
    over = max((inter(t, p) / (t["w"] * t["h"]) for p in photos), default=0)
    # Closest photo edge, to see whether captions hug a photo.
    dist = None
    for p in photos:
        dx = max(p["x"] - (t["x"] + t["w"]), t["x"] - (p["x"] + p["w"]), 0)
        dy = max(p["y"] - (t["y"] + t["h"]), t["y"] - (p["y"] + p["h"]), 0)
        d = (dx ** 2 + dy ** 2) ** 0.5
        dist = d if dist is None else min(dist, d)
    content = t.get("content") or ""
    return {
        "content": content,
        "chars": len(content),
        "font": t.get("font"),
        "size": t.get("fontSize"),
        "bold": t.get("bold"),
        "color": t.get("color"),
        "align": t.get("align"),
        "rotation": t["rotation"],
        "widthMm": mm(t["w"]),
        "heightMm": mm(t["h"]),
        "pos": ("top" if cy < 0.33 else "bottom" if cy > 0.67 else "middle") + "-" + ("left" if cx < 0.33 else "right" if cx > 0.67 else "center"),
        "placement": "on-photo" if over > 0.5 else "in-margin" if (t["y"] < 12 / MM or t["y"] + t["h"] > H - 12 / MM) else "between-photos",
        "gapToPhotoMm": mm(dist) if dist is not None else None,
    }


def gaps(surface):
    """Spacing between neighbouring, non-overlapping, axis-aligned photos."""
    photos = [e for e in surface["elements"] if e["type"] == "photo" and not e["rotation"]]
    out = []
    for i, a in enumerate(photos):
        for b in photos[i + 1:]:
            ax0, ay0, ax1, ay1 = rect(a)
            bx0, by0, bx1, by1 = rect(b)
            if min(ay1, by1) - max(ay0, by0) > 0.3:
                g = max(bx0 - ax1, ax0 - bx1)
                if 0 <= g < 1:
                    out.append(mm(g))
            if min(ax1, bx1) - max(ax0, bx0) > 0.3:
                g = max(by0 - ay1, ay0 - by1)
                if 0 <= g < 1:
                    out.append(mm(g))
    return out


def surface_features(surface, index):
    W = surface["w"]
    pages = [page_features(surface, *box) for box in page_boxes(surface)]
    photos = [e for e in surface["elements"] if e["type"] == "photo"]
    across = [p for p in photos if surface["target"] == "spread" and p["x"] < W / 2 - 0.2 and p["x"] + p["w"] > W / 2 + 0.2]
    kinds = set()
    for p in pages:
        if p["background"] == "photo":
            kinds.add("foto-achtergrond")
        elif p["background"] not in ("white",):
            kinds.add("gekleurde-achtergrond")
        if p["fullPagePhoto"]:
            kinds.add("paginavullend")
        elif p["bigPhoto"]:
            kinds.add("grote-foto")
        if p["margin"] == "no-margin":
            kinds.add("zonder-marge")
        if p["margin"] == "mixed":
            kinds.add("gemengde-bleed")
        if p["overlaps"]:
            kinds.add("overlap")
        if p["rotated"]:
            kinds.add("gedraaid")
        if p["shaped"]:
            kinds.add("vormen")
        if p["clipart"]:
            kinds.add("clipart")
    if across:
        kinds.add("over-de-rug")
    if not kinds - {"clipart"} and pages and all(p["margin"] in ("margin", "empty") for p in pages):
        kinds.add("raster")
    return {
        "index": index,
        "label": surface["label"],
        "target": surface["target"],
        "photos": len(photos),
        "acrossGutter": len(across),
        "gaps": gaps(surface),
        "pages": pages,
        "kinds": sorted(kinds),
    }


def summarise(rows):
    inner = [r for r in rows if r["target"] != "cover"]
    pages = [p for r in inner for p in r["pages"]]
    spreads = [r for r in inner if r["target"] == "spread"]
    texts = [t for r in rows for p in r["pages"] for t in p["texts"]]
    captions = [t for t in texts if t["chars"] and (t["size"] or "").startswith("10")]
    gaps_all = [g for r in inner for g in r["gaps"]]
    return {
        "spreads": len(spreads),
        "pages": len(pages),
        "photos": sum(r["photos"] for r in inner),
        "photosPerSpread": Counter(r["photos"] for r in spreads),
        "photosPerPage": Counter(p["photos"] for p in pages),
        "medianPhotosPerSpread": median([r["photos"] for r in spreads] or [0]),
        "kinds": Counter(k for r in spreads for k in r["kinds"]),
        "pageBackground": Counter(p["background"] for p in pages),
        "pageMargin": Counter(p["margin"] for p in pages),
        "pagesBigPhoto": sum(p["bigPhoto"] for p in pages),
        "pagesFullPhoto": sum(p["fullPagePhoto"] for p in pages),
        "pagesOverlap": sum(1 for p in pages if p["overlaps"]),
        "pagesShaped": sum(1 for p in pages if p["shaped"]),
        "pagesRotated": sum(1 for p in pages if p["rotated"]),
        "spreadsAcrossGutter": sum(1 for r in spreads if r["acrossGutter"]),
        "gapHistogramMm": Counter(round(g) for g in gaps_all),
        "minMarginMm": Counter(round(p["minMarginMm"]) for p in pages if p["minMarginMm"] is not None),
        "medianCoverage": median([p["coverage"] for p in pages] or [0]),
        "textCount": len(texts),
        "pagesWithText": sum(1 for p in pages if p["texts"]),
        "textsPerPage": Counter(len(p["texts"]) for p in pages),
        "textFonts": Counter(f'{t["font"]} {t["size"]}{" bold" if t["bold"] else ""}' for t in texts),
        "textPlacement": Counter(t["placement"] for t in texts),
        "textPos": Counter(t["pos"] for t in captions),
        "textAlign": Counter(t["align"] for t in captions),
        "textColor": Counter(t["color"] for t in texts),
        "captionChars": {"median": median([t["chars"] for t in captions] or [0]), "max": max([t["chars"] for t in captions] or [0])},
        "captionGapToPhotoMm": Counter(round(t["gapToPhotoMm"]) for t in captions if t["gapToPhotoMm"] is not None),
        "captionWidthMm": median([t["widthMm"] for t in captions] or [0]),
    }


def jsonable(o):
    if isinstance(o, Counter):
        return {str(k): v for k, v in o.most_common()}
    if isinstance(o, dict):
        return {k: jsonable(v) for k, v in o.items()}
    if isinstance(o, list):
        return [jsonable(v) for v in o]
    return o


def main():
    books = json.loads(BOOKS.read_text(encoding="utf-8"))
    result = {"books": []}
    all_rows = []
    for b in books:
        rows = [surface_features(s, i) for i, s in enumerate(b["surfaces"])]
        all_rows += rows
        result["books"].append({"slug": b["slug"], "name": b["name"], "surfaces": rows, "summary": summarise(rows)})
    result["all"] = summarise(all_rows)
    OUT.write_text(json.dumps(jsonable(result), ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(jsonable(result["all"]), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
