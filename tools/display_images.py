"""Web-sized versions of the year's photos -> data/<year>/display/<id>.jpg (1600 px, upright).

The app shows these in the big view; the originals (several MB each) stay for print/export.
Usage: python tools/display_images.py 2025
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SIZE = 1600

try:  # iPhone photos arrive as HEIC; optional dependency.
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass


def make(src: Path, target: Path) -> str:
    if target.exists():
        return "cached"
    with Image.open(src) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((SIZE, SIZE))
        img.save(target, quality=80, optimize=True, progressive=True)
    return "ok"


def main():
    year = sys.argv[1]
    out = ROOT / "data" / year
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    target = out / "display"
    target.mkdir(exist_ok=True)
    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(lambda p: make(out / "originals" / p["file"], target / f'{p["id"]}.jpg'), index))
    print({k: results.count(k) for k in set(results)}, "of", len(index))


if __name__ == "__main__":
    main()
