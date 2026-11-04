"""Average colour per photo -> data/<year>/tones.json ({id: "#rrggbb"}).

Used to give a half spread a background colour in the tone of its photos. The colour is the
mean of the thumbnail, ignoring the brightest/darkest 10% of pixels so sky and shadows weigh less.
Usage: python tools/photo_tones.py 2025
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def tone(path):
    img = Image.open(path).convert("RGB").resize((48, 48))
    px = sorted(img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata(), key=sum)
    cut = len(px) // 10
    core = px[cut:-cut]
    r, g, b = (sum(c[i] for c in core) // len(core) for i in range(3))
    return f"#{r:02x}{g:02x}{b:02x}"


def main():
    year = sys.argv[1]
    out = ROOT / "data" / year
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    tones = {p["id"]: tone(out / p["thumb"]) for p in index}
    (out / "tones.json").write_text(json.dumps(tones, indent=0), encoding="utf-8")
    print(len(tones), "tones")


if __name__ == "__main__":
    main()
