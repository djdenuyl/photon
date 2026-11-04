"""Number the year's photos chronologically and draw labelled contact sheets per month.

-> data/<year>/index.json (id -> file, taken, whatsapp, similar-to) and data/<year>/sheets/<YYYY-MM>-<n>.jpg
Duplicates from duplicates.json are left out; WhatsApp photos only carry a date, so they sort
at the start of their day and are marked "WA" on the sheet.
Usage: python tools/contact_sheets.py 2025
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
COLS, ROWS, CELL, LABEL = 6, 5, 260, 22


def main():
    year = sys.argv[1]
    out = ROOT / "data" / year
    photos = json.loads((out / "photos.json").read_text(encoding="utf-8"))["photos"]
    dupes = json.loads((out / "duplicates.json").read_text(encoding="utf-8"))
    dropped = {d["drop"] for d in dupes if d["verdict"] == "duplicate"}
    similar = {}
    for d in dupes:
        if d["verdict"] == "similar":
            similar[d["whatsapp"]] = d["match"]
    keep = [p for p in photos if p["file"] not in dropped]
    # WhatsApp photos have no time of day: sort them first within their day.
    keep.sort(key=lambda p: (p["taken"][:10], 0 if p["whatsapp"] else 1, p["taken"]))
    index = []
    for i, p in enumerate(keep, 1):
        index.append({"id": f"p{i:03d}", "file": p["file"], "taken": p["taken"], "date": p["taken"][:10],
                      "time": None if p["whatsapp"] else p["taken"][11:16], "whatsapp": p["whatsapp"],
                      "thumb": p["thumb"], "w": p["w"], "h": p["h"]})
    by_file = {p["file"]: p["id"] for p in index}
    for p in index:
        if p["file"] in similar:
            p["similarTo"] = by_file.get(similar[p["file"]])
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")

    font = ImageFont.truetype("arialbd.ttf", 15)
    sheets = out / "sheets"
    sheets.mkdir(exist_ok=True)
    months = defaultdict(list)
    for p in index:
        months[p["date"][:7]].append(p)
    for month, items in sorted(months.items()):
        for n in range(0, len(items), COLS * ROWS):
            chunk = items[n:n + COLS * ROWS]
            rows = (len(chunk) + COLS - 1) // COLS
            sheet = Image.new("RGB", (COLS * CELL, rows * (CELL + LABEL)), "white")
            draw = ImageDraw.Draw(sheet)
            for k, p in enumerate(chunk):
                x, y = (k % COLS) * CELL, (k // COLS) * (CELL + LABEL)
                t = Image.open(out / p["thumb"])
                t.thumbnail((CELL - 8, CELL - 8))
                sheet.paste(t, (x + (CELL - t.width) // 2, y + (CELL - t.height) // 2))
                label = f'{p["id"]} {p["date"][5:]} {p["time"] or "WA"}'
                draw.text((x + 6, y + CELL), label, fill=(200, 30, 30) if p["whatsapp"] else (0, 0, 0), font=font)
            sheet.save(sheets / f"{month}-{n // (COLS * ROWS) + 1}.jpg", quality=80)
    print(len(index), "photos;", len(dropped), "duplicates left out;", sum(1 for p in index if "similarTo" in p), "similar;",
          len(list(sheets.glob("*.jpg"))), "sheets")


if __name__ == "__main__":
    main()
