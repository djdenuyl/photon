"""Contact sheets for labelling people and faces -> data/<year>/label-sheets/NN.jpg.

Twelve photos per sheet in large cells with a faint 4x4 grid (lines at 25/50/75%), so a face
position can be read off as fractions of the photo. Excluded photos are left out.
Usage: python tools/label_sheets.py 2025
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
COLS, ROWS, CELL, LABEL = 4, 3, 380, 26


def main():
    year = sys.argv[1]
    out = ROOT / "data" / year
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    excl_path = out / "excluded.json"
    excluded = json.loads(excl_path.read_text(encoding="utf-8")) if excl_path.exists() else {}
    photos = [p for p in index if p["id"] not in excluded]
    sheets = out / "label-sheets"
    sheets.mkdir(exist_ok=True)
    font = ImageFont.truetype("arialbd.ttf", 18)
    per = COLS * ROWS
    manifest = []
    for n in range(0, len(photos), per):
        chunk = photos[n:n + per]
        sheet = Image.new("RGB", (COLS * CELL, ROWS * (CELL + LABEL)), "white")
        draw = ImageDraw.Draw(sheet, "RGBA")
        for k, p in enumerate(chunk):
            x0, y0 = (k % COLS) * CELL, (k // COLS) * (CELL + LABEL)
            t = Image.open(out / p["thumb"]).convert("RGB")
            t.thumbnail((CELL - 10, CELL - 10))
            px, py = x0 + (CELL - t.width) // 2, y0 + (CELL - t.height) // 2
            sheet.paste(t, (px, py))
            for f in (0.25, 0.5, 0.75):
                draw.line([(px + t.width * f, py), (px + t.width * f, py + t.height)], fill=(255, 255, 255, 90), width=1)
                draw.line([(px, py + t.height * f), (px + t.width, py + t.height * f)], fill=(255, 255, 255, 90), width=1)
            draw.text((x0 + 8, y0 + CELL), f'{p["id"]}  {p["date"][5:]}', fill=(0, 0, 0), font=font)
        name = f"{n // per + 1:02d}.jpg"
        sheet.save(sheets / name, quality=82)
        manifest.append({"sheet": name, "ids": [p["id"] for p in chunk]})
    (sheets / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(len(photos), "photos on", len(manifest), "sheets")


if __name__ == "__main__":
    main()
