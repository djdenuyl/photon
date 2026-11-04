"""Per-book context for the content analysis -> data/albelli/context/<slug>.json.

For every surface: techniques (from stats.json), capture dates, month-title graphics,
captions and which photos are big / rotated / on a photo background.
"""
import json
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "albelli"


def days_between(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def main():
    books = json.loads((DATA / "books.json").read_text(encoding="utf-8"))
    stats = json.loads((DATA / "stats.json").read_text(encoding="utf-8"))
    photos = json.loads((DATA / "photos.json").read_text(encoding="utf-8"))
    out_dir = DATA / "context"
    out_dir.mkdir(exist_ok=True)
    for book, bstats in zip(books, stats["books"]):
        surfaces = []
        for i, (s, f) in enumerate(zip(book["surfaces"], bstats["surfaces"])):
            area = s["w"] * s["h"] / (2 if s["target"] != "page" else 1)
            items = [e for e in s["elements"] if e.get("photoId")]
            meta = [photos.get(e["photoId"], {}) for e in items]
            dates = sorted(m["date"] for m in meta if m.get("role") == "photo" and m.get("date"))
            counts = Counter(dates)
            notable = []
            for e, m in zip(items, meta):
                share = e["w"] * e["h"] / area
                tags = []
                if e["type"] == "background-photo":
                    tags.append("achtergrond")
                if share >= 0.5:
                    tags.append(f"groot {share:.0%} van pagina")
                if e["rotation"] and abs(e["rotation"]) % 90:
                    tags.append(f"gedraaid {e['rotation']:.0f}°")
                if "decoration" in e:
                    tags.append("vorm/frame")
                if tags:
                    notable.append({"file": m.get("name"), "date": m.get("date"), "tags": tags})
            surfaces.append({
                "index": i,
                "render": f"renders/{book['slug']}/{i:02d}.jpg",
                "label": s["label"],
                "target": s["target"],
                "techniques": f["kinds"],
                "photos": f["photos"],
                "months": [m["name"].split(".")[0] for m in meta if m.get("role") == "month"],
                "otherGraphics": [m["name"] for m in meta if m.get("role") in ("graphic", "cover-art")],
                "dates": {"first": dates[0], "last": dates[-1], "spanDays": days_between(dates[0], dates[-1]) + 1,
                          "distinctDays": len(counts), "perDay": dict(counts)} if dates else None,
                "pages": [{"page": p["page"], "background": p["background"], "margin": p["margin"], "photos": p["photos"]} for p in f["pages"]],
                "notablePhotos": notable,
                "captions": [{"page": p["page"], "text": t["content"], "size": t["size"], "placement": t["placement"]}
                             for p in f["pages"] for t in p["texts"] if t["content"]],
            })
        (out_dir / f"{book['slug']}.json").write_text(
            json.dumps({"book": book["name"], "slug": book["slug"], "surfaces": surfaces}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(book["name"], len(surfaces))


if __name__ == "__main__":
    main()
