"""Find WhatsApp copies of photos that are already in the album -> data/<year>/duplicates.json.

Compares a perceptual difference hash (dHash, 16x16) of every WhatsApp photo against all other
photos taken within two days. Pairs at or below SURE are the same photo (drop the copy); up to
MAYBE they are near-identical shots of the same moment (keep both, flag as similar). Thresholds
were checked visually on the 2025 album.
Usage: python tools/dedupe_photos.py 2025
"""
import json
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SURE, MAYBE = 12, 60  # Hamming distance out of 256 bits


def dhash(path, size=16):
    img = Image.open(path).convert("L").resize((size + 1, size))
    px = list(img.get_flattened_data()) if hasattr(img, "get_flattened_data") else list(img.getdata())
    bits = 0
    for row in range(size):
        for col in range(size):
            bits = (bits << 1) | (px[row * (size + 1) + col] > px[row * (size + 1) + col + 1])
    return bits


def main():
    year = sys.argv[1]
    out = ROOT / "data" / year
    photos = json.loads((out / "photos.json").read_text(encoding="utf-8"))["photos"]
    for p in photos:
        p["_hash"] = dhash(out / p["thumb"])
        p["_t"] = datetime.fromisoformat(p["taken"])
        p["_ar"] = p["w"] / p["h"]
    wa = [p for p in photos if p["whatsapp"]]
    pairs = []
    for a in wa:
        best = None
        for b in photos:
            if b is a or abs((a["_t"] - b["_t"]).days) > 2 or abs(a["_ar"] - b["_ar"]) > 0.08:
                continue
            if b["whatsapp"] and b["file"] < a["file"]:
                continue  # each WhatsApp pair once
            d = bin(a["_hash"] ^ b["_hash"]).count("1")
            if best is None or d < best[0]:
                best = (d, b)
        if best and best[0] <= MAYBE:
            d, b = best
            pairs.append({"whatsapp": a["file"], "match": b["file"], "distance": d,
                          "verdict": "duplicate" if d <= SURE else "similar",
                          # keep the camera original; between two WhatsApp copies keep the larger one
                          "drop": a["file"] if not b["whatsapp"] or b["w"] * b["h"] >= a["w"] * a["h"] else b["file"]})
    pairs.sort(key=lambda p: p["distance"])
    (out / "duplicates.json").write_text(json.dumps(pairs, ensure_ascii=False, indent=1), encoding="utf-8")
    sure = sum(p["verdict"] == "duplicate" for p in pairs)
    print(f"{len(wa)} WhatsApp photos: {sure} duplicates, {len(pairs) - sure} similar")
    for p in pairs:
        print(p["distance"], p["verdict"], p["whatsapp"], "<->", p["match"])


if __name__ == "__main__":
    main()
