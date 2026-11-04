"""Index a folder of photos (e.g. the Google Photos album download) -> data/<year>/photos.json + thumbs.

Capture time: EXIF DateTimeOriginal, else a date in the file name, else the file's mtime.
Usage: python tools/ingest_photos.py 2025 [source-folder]   (default source: data/<year>/originals)
"""
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps

try:  # iPhone photos arrive as HEIC; optional dependency.
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parents[1]
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}
VIDEO_EXT = {".mp4", ".mov", ".3gp", ".m4v"}
NAME_DATE = re.compile(r"(?<!\d)(20\d{2})[-_]?(\d{2})[-_]?(\d{2})(?:[-_ ]?(\d{2})[.\-_]?(\d{2})[.\-_]?(\d{2}))?")


def capture_time(path, img):
    try:
        exif = img.getexif()
        raw = exif.get_ifd(0x8769).get(36867) or exif.get(306)
        if raw:
            return datetime.strptime(raw.strip()[:19], "%Y:%m:%d %H:%M:%S"), "exif"
    except Exception:
        pass
    m = NAME_DATE.search(path.name)
    if m and 1 <= int(m[2]) <= 12 and 1 <= int(m[3]) <= 31:
        h, mi, s = (int(m[4]), int(m[5]), int(m[6])) if m[4] and int(m[4]) < 24 else (12, 0, 0)
        return datetime(int(m[1]), int(m[2]), int(m[3]), h, mi, s), "filename"
    return datetime.fromtimestamp(path.stat().st_mtime), "mtime"


def index(path, src, thumbs):
    rel = path.relative_to(src).as_posix()
    try:
        with Image.open(path) as img:
            when, how = capture_time(path, img)
            img = ImageOps.exif_transpose(img)
            w, h = img.size
            thumb = thumbs / (re.sub(r"[^\w.-]", "_", rel) + ".jpg")
            if not thumb.exists():
                t = img.convert("RGB")
                t.thumbnail((400, 400))
                t.save(thumb, quality=82)
    except Exception as e:
        return {"file": rel, "error": str(e)[:120]}
    return {"file": rel, "taken": when.isoformat(timespec="minutes"), "dateSource": how, "w": w, "h": h,
            "thumb": thumb.relative_to(thumbs.parent).as_posix(), "whatsapp": "-WA" in path.name}


def main():
    year = sys.argv[1]
    out = ROOT / "data" / year
    src = Path(sys.argv[2]) if len(sys.argv) > 2 else out / "originals"
    thumbs = out / "thumbs"
    thumbs.mkdir(parents=True, exist_ok=True)
    files = [p for p in src.rglob("*") if p.is_file()]
    images = [p for p in files if p.suffix.lower() in IMAGE_EXT]
    videos = [p for p in files if p.suffix.lower() in VIDEO_EXT]
    with ThreadPoolExecutor(8) as pool:
        photos = list(pool.map(lambda p: index(p, src, thumbs), images))
    ok = sorted((p for p in photos if "taken" in p), key=lambda p: p["taken"])
    errors = [p for p in photos if "error" in p]
    (out / "photos.json").write_text(json.dumps({"source": str(src), "photos": ok, "errors": errors,
                                                  "videos": [v.relative_to(src).as_posix() for v in videos]},
                                                 ensure_ascii=False, indent=1), encoding="utf-8")
    by = {}
    for p in ok:
        by[p["dateSource"]] = by.get(p["dateSource"], 0) + 1
    print(f"{len(ok)} photos ({by}), {len(errors)} errors, {len(videos)} videos skipped")
    if ok:
        print("range:", ok[0]["taken"], "->", ok[-1]["taken"])


if __name__ == "__main__":
    main()
