"""Merge the per-book content analyses (context/*.analysis.json) -> data/albelli/context.json.

Adds cross-year views: recurring traditions per year, space budget per event, hero photos
and playful spreads (with the photo ids so the web app can show them).
"""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "albelli"

# Traditions to track across years; matched against event labels, themes and captions.
TRADITIONS = [
    ("Familieweekend", r"familieweekend|lunteren|dijksma.?s.*weekend|weekend.*familie"),
    ("Pasen", r"pasen|paas"),
    ("Koningsdag", r"koningsdag"),
    ("Verjaardag kind", r"lou \d|lou (wordt|is) \d|\d jaar.*lou|verjaardag lou|lou jarig|hoera lou|ilias|oos.*jarig"),
    ("Uylendag", r"uylendag|uylen"),
    ("DTRH-festival", r"dtrh"),
    ("Zomer in Voissant", r"voissant|franse huis"),
    ("Zomervakantie (reis)", r"zomervakantie|vakantie"),
    ("De Tuinkamer", r"tuinkamer"),
    ("Herfstwandeling", r"herfst.*(bos|wandel)|bos.*herfst"),
    ("Sinterklaas", r"sinterklaas|sint\b|pakjesavond"),
    ("Kerst", r"kerst"),
    ("Oud en nieuw", r"oud en nieuw|oud & nieuw|oudejaar|nieuwjaar"),
    ("Met opa en oma", r"opa en oma|oppas"),
]


def year_of(book_name):
    return book_name.split(" ")[0]


def hero_element(surface):
    photos = [e for e in surface["elements"] if e["type"] in ("photo", "background-photo")]
    return max(photos, key=lambda e: e["w"] * e["h"], default=None)


def playful_element(surface):
    rotated = [e for e in surface["elements"] if e["type"] == "photo" and e["rotation"] and abs(e["rotation"]) % 90]
    shaped = [e for e in surface["elements"] if e["type"] == "photo" and "decoration" in e]
    return (rotated or shaped or [hero_element(surface)])[0]


def main():
    books = json.loads((DATA / "books.json").read_text(encoding="utf-8"))
    stats = json.loads((DATA / "stats.json").read_text(encoding="utf-8"))
    out = {"books": {}, "traditions": [], "events": [], "heroes": [], "playful": [], "pageRelation": {}, "categories": {}}
    trad_hits = defaultdict(lambda: defaultdict(set))

    for book, bstats in zip(books, stats["books"]):
        path = DATA / "context" / f"{book['slug']}.analysis.json"
        if not path.exists():
            continue
        analysis = json.loads(path.read_text(encoding="utf-8"))
        year = year_of(book["name"])
        surfaces = {s["index"]: s for s in analysis["surfaces"]}
        out["books"][book["slug"]] = {"name": book["name"], "surfaces": surfaces, "summary": analysis["summary"]}
        out["pageRelation"][book["name"]] = Counter(s.get("pageRelation") for s in analysis["surfaces"] if s.get("category") != "titel-omslag")
        out["categories"][book["name"]] = Counter(s.get("category") for s in analysis["surfaces"])

        for idx, a in surfaces.items():
            surface = book["surfaces"][idx]
            captions = " ".join(e.get("content") or "" for e in surface["elements"] if e["type"] == "text")
            hay = " ".join(str(a.get(k) or "") for k in ("event", "leftTheme", "rightTheme")) + " " + captions
            for name, pattern in TRADITIONS:
                if re.search(pattern, hay, re.I):
                    trad_hits[name][year].add((book["slug"], idx))
            if a.get("heroPhoto"):
                el = hero_element(surface)
                if el:
                    out["heroes"].append({"book": book["name"], "slug": book["slug"], "index": idx, "photoId": el["photoId"],
                                          "event": a.get("event"), "category": a.get("category"), **a["heroPhoto"]})
            if a.get("playfulness"):
                el = playful_element(surface)
                out["playful"].append({"book": book["name"], "slug": book["slug"], "index": idx,
                                       "photoId": el["photoId"] if el else None, "event": a.get("event"),
                                       "techniques": bstats["surfaces"][idx]["kinds"], **a["playfulness"]})

        for ev in analysis["summary"].get("events", []):
            out["events"].append({"book": book["name"], "year": year, **ev})

    years = sorted({year_of(b["name"]) for b in books})
    for name, _ in TRADITIONS:
        per_year = {y: len(trad_hits[name][y]) for y in years}
        out["traditions"].append({"name": name, "spreadsPerYear": per_year,
                                  "yearsPresent": sum(1 for y in years if per_year[y]),
                                  "surfaces": sorted([list(x) for y in years for x in trad_hits[name][y]])})
    out["traditions"].sort(key=lambda t: (-t["yearsPresent"], t["name"]))
    out["years"] = years

    (DATA / "context.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(out["books"]), "books;", len(out["events"]), "events;", len(out["heroes"]), "heroes;", len(out["playful"]), "playful")
    for t in out["traditions"]:
        print(f'{t["name"]:24}', t["spreadsPerYear"])


if __name__ == "__main__":
    main()
