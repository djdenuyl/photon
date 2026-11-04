"""Web-sized covers and month titles + a manifest -> data/albelli/graphics-web/, data/albelli/graphics.json.

Sources: the originals downloaded from Albelli (data/albelli/graphics/<slug>/) and, where they
exist, the Inkscape sources on disk (SOURCES). Placement of month titles comes from books.json.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "albelli"
MM = 25.4
MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]

# Inkscape sources found on this machine (cover only; month-title sources were not found).
SOURCES = {
    "hetjaarrond2020v2": [r"E:\personal\Photos\Het Jaar Rond - 2020\kaft\kaft.svg", r"E:\personal\Photos\Het Jaar Rond - 2020\kaft\kast_back.svg"],
    "hetjaarrond2022deel1": [r"E:\personal\Projects\hetjaarrond2022\kaft\kaft_front_deel1.svg", r"E:\personal\Projects\hetjaarrond2022\kaft\kaft_back_deel1.svg"],
    "hetjaarrond2022deel2": [r"E:\personal\Projects\hetjaarrond2022\kaft\kaft_front_deel2.svg", r"E:\personal\Projects\hetjaarrond2022\kaft\kaft_back_deel2.svg"],
}


def kind(name):
    stem = Path(name).stem.lower()
    if stem in MONTHS:
        return "month"
    if stem.startswith(("front", "kaft")):
        return "front"
    if stem.startswith(("back", "kast_back")):
        return "back"
    return "other"


def main():
    books = json.loads((DATA / "books.json").read_text(encoding="utf-8"))
    photos = json.loads((DATA / "photos.json").read_text(encoding="utf-8"))
    out_dir = DATA / "graphics-web"
    manifest = {"books": []}
    for book in books:
        src_dir = DATA / "graphics" / book["slug"]
        if not src_dir.exists():
            continue
        placements = {}
        for s in book["surfaces"]:
            for e in s["elements"]:
                p = photos.get(e.get("photoId") or "")
                if p and p["role"] == "month":
                    page_w = s["w"] / 2 if s["target"] == "spread" else s["w"]
                    x = e["x"] - (page_w if s["target"] == "spread" and e["x"] + e["w"] / 2 > page_w else 0)
                    placements.setdefault(Path(p["name"]).stem.lower(), {
                        "widthMm": round(e["w"] * MM), "heightMm": round(e["h"] * MM),
                        "xMm": round(x * MM), "yMm": round(e["y"] * MM), "surface": s["label"]})
        entry = {"slug": book["slug"], "name": book["name"], "sources": SOURCES.get(book["slug"], []), "items": []}
        for f in sorted(src_dir.glob("*.png")):
            k = kind(f.name)
            if k == "other":
                continue
            im = Image.open(f)
            target = out_dir / book["slug"] / (f.stem + (".png" if k == "month" else ".jpg"))
            target.parent.mkdir(parents=True, exist_ok=True)
            small = im.copy()
            small.thumbnail((900, 900) if k == "month" else (700, 933))
            if k == "month":
                small.save(target, optimize=True)
            else:
                small.convert("RGB").save(target, quality=82)
            entry["items"].append({
                "kind": k, "name": f.stem.lower(), "file": target.relative_to(DATA).as_posix(),
                "px": [im.width, im.height], "placement": placements.get(f.stem.lower()),
            })
        entry["items"].sort(key=lambda i: (i["kind"] != "front", i["kind"] != "back", MONTHS.index(i["name"]) if i["name"] in MONTHS else 99))
        manifest["books"].append(entry)
    (DATA / "graphics.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print({b["name"]: len(b["items"]) for b in manifest["books"]})


if __name__ == "__main__":
    main()
