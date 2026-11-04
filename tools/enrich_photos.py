"""Join Albelli upload metadata to the photos used in the yearbooks -> data/albelli/photos.json.

Per photo: thumbnail file, capture date/time parsed from the original file name, and a role
(photo, month title graphic, cover artwork or other graphic).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "albelli"
THUMBS = DATA / "thumbs" / "300"

MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]
DATE = re.compile(r"(?<!\d)(20\d{2})[-_]?(\d{2})[-_]?(\d{2})(?:[-_ ]?(\d{2})[.\-_]?(\d{2})[.\-_]?(\d{2}))?")


def parse_date(name):
    m = DATE.search(name or "")
    if not m or not (1 <= int(m[2]) <= 12 and 1 <= int(m[3]) <= 31):
        return None, None
    date = f"{m[1]}-{m[2]}-{m[3]}"
    time = f"{m[4]}:{m[5]}" if m[4] and int(m[4]) < 24 else None
    return date, time


def role(name):
    stem = Path(name or "").stem.lower()
    if stem in MONTHS:
        return "month"
    if re.match(r"^(front|back)(_deel\d)?$", stem):
        return "cover-art"
    if name and name.lower().endswith(".png") and not DATE.search(name):
        return "graphic"
    return "photo"


def main():
    uploads = json.loads((DATA / "uploads.json").read_text(encoding="utf-8"))
    thumbs = {p.stem: p.name for p in THUMBS.iterdir()} if THUMBS.exists() else {}
    photos = {}
    for u in uploads:
        date, time = parse_date(u["localFileName"])
        photos[u["uploadId"]] = {
            "thumb": thumbs.get(u["uploadId"]),
            "name": u["localFileName"],
            "date": date,
            "time": time,
            "role": role(u["localFileName"]),
            "whatsapp": "-WA" in (u["localFileName"] or ""),
            "w": int(u["w"] or 0),
            "h": int(u["h"] or 0),
        }
    (DATA / "photos.json").write_text(json.dumps(photos, ensure_ascii=False, indent=0), encoding="utf-8")
    roles = {}
    for p in photos.values():
        roles[p["role"]] = roles.get(p["role"], 0) + 1
    print(len(photos), "photos;", sum(1 for p in photos.values() if p["date"]), "dated;", roles)


if __name__ == "__main__":
    main()
