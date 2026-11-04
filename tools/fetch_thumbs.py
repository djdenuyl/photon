"""Download thumbnails for every photo in data/albelli/uploads.json.

uploads.json comes from Albelli's getuploads API (exported from a logged-in browser tab);
its signed URLs expire after about a week, so re-export when downloads start failing.
Usage: python tools/fetch_thumbs.py [size=300]
"""
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SIZE = sys.argv[1] if len(sys.argv) > 1 else "300"
OUT = ROOT / "data" / "albelli" / "thumbs" / SIZE


def fetch(upload):
    url = upload["thumbs"].get(SIZE)
    if not url:
        return "no-size"
    if any(OUT.glob(f'{upload["uploadId"]}.*')):
        return "cached"
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            # Edited photos come from an image-edit service whose URL has no file extension.
            ext = "png" if "png" in r.headers.get("Content-Type", "") else "jpg"
            (OUT / f'{upload["uploadId"]}.{ext}').write_bytes(r.read())
        return "ok"
    except Exception:
        return "failed"


def main():
    uploads = json.loads((ROOT / "data" / "albelli" / "uploads.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(16) as pool:
        results = list(pool.map(fetch, uploads))
    print({k: results.count(k) for k in set(results)}, "of", len(uploads))


if __name__ == "__main__":
    main()
