"""Merge the per-batch photo labels (data/<year>/labels/*.json) -> data/<year>/labels.json ({id: label}).
Usage: python tools/merge_labels.py 2025
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    out = ROOT / "data" / sys.argv[1]
    labels = {}
    for f in sorted((out / "labels").glob("*.json")):
        for item in json.loads(f.read_text(encoding="utf-8")):
            labels[item.pop("id")] = item
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    missing = [p["id"] for p in index if p["id"] not in labels]
    (out / "labels.json").write_text(json.dumps(labels, ensure_ascii=False, indent=0), encoding="utf-8")
    print(len(labels), "labelled;", len(missing), "without label")


if __name__ == "__main__":
    main()
