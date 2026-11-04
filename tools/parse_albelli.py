"""Normalise the yearbook projects in data/albelli/raw/*.xml into data/albelli/books.json."""
import base64
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "albelli" / "raw"
OUT = ROOT / "data" / "albelli" / "books.json"
XSI_TYPE = "{http://www.w3.org/2001/XMLSchema-instance}type"


def local(tag):
    return tag.split("}")[-1]


def b64json(value):
    try:
        return json.loads(base64.b64decode(value + "=" * (-len(value) % 4)).decode("utf-8"))
    except Exception:
        return None


def b64text(value):
    try:
        return base64.b64decode(value).decode("utf-8")
    except Exception:
        return value


def fix_cp1252(text):
    """Albelli stores some Windows-1252 punctuation as C1 control characters."""
    if not text:
        return text
    return re.sub("[-]", lambda m: m.group(0).encode("latin-1").decode("cp1252", "replace"), text)


def num(e, key):
    return round(float(e.get(key, 0)), 4)


def child(e, name):
    for c in e:
        if local(c.tag) == name:
            return c
    return None


def parse_element(e):
    kind = local(e.tag)
    item = {
        # Albelli stores the centre point; convert to top-left for easy rendering.
        "x": round(num(e, "x") - num(e, "width") / 2, 4),
        "y": round(num(e, "y") - num(e, "height") / 2, 4),
        "w": num(e, "width"),
        "h": num(e, "height"),
        "rotation": num(child(e, "rotation"), "angle") if child(e, "rotation") is not None else 0,
        "restriction": e.get("restriction"),
    }
    if kind == "colorContainer":
        brush = child(e, "solidBrush")
        item.update(type="color", color=brush.get("color") if brush is not None else None)
        if item["restriction"] == "background":
            item["type"] = "background-color"
        return item

    photo = child(e, "photoOrganizerPhoto")
    asset = child(e, "imageAsset")
    deco = child(e, "decorations")
    if photo is not None:
        item.update(
            type="photo",
            photoId=photo.get("photoID"),
            crop={k: num(photo, k) for k in ("width", "height", "offsetX", "offsetY")},
            alpha=int(photo.get("alpha", 255)),
        )
        if item["restriction"] == "background":
            item["type"] = "background-photo"
    elif asset is not None:
        atype = asset.get("assetType")
        if atype == "textarea":
            t = b64json(asset.get("text", "")) or {}
            item.update(
                type="text",
                content=fix_cp1252(t.get("content")),
                font=t.get("fontSrc"),
                fontSize=t.get("fontSize"),
                bold=t.get("bold"),
                italic=t.get("italic"),
                color=t.get("color"),
                align=t.get("horizontalAlignment"),
            )
        else:
            item.update(type="background-asset" if atype == "background" else atype, href=asset.get("href"),
                        assetId=asset.get("assetId"))
    else:
        item["type"] = "empty"
    if deco is not None:
        mask, frame = child(deco, "mask"), child(deco, "frame")
        item["decoration"] = {
            "assetId": deco.get("assetId"),
            "assetType": deco.get("assetType"),
            "mask": mask.get("href") if mask is not None else None,
            "frame": frame.get("href") if frame is not None else None,
        }
    return item


YEARBOOKS = {
    "hetjaarrond2020v2": "2020",
    "hetjaarrond2021": "2021 · deel 1",
    "hetjaarrond2021deel2": "2021 · deel 2",
    "hetjaarrond2022deel1": "2022 · deel 1",
    "hetjaarrond2022deel2": "2022 · deel 2",
    "hetjaarrond2023deel1": "2023 · deel 1",
    "hetjaarrond2023deel2": "2023 · deel 2",
    "het-jaar-rond-2024-deel-1": "2024 · deel 1",
    "het-jaar-rond-2024-deel-2": "2024 · deel 2",
}


def parse_book(path):
    root = ET.parse(path).getroot()
    meta = json.loads(path.with_suffix("").with_suffix(".meta.json").read_text(encoding="utf-8"))
    surfaces = []
    for s in root.iter():
        if local(s.tag) != "printSurface":
            continue
        bleed = child(s, "bleed")
        content = child(s, "content")
        surfaces.append({
            "label": s.get("label"),
            "target": s.get("target"),
            "w": num(s, "width"),
            "h": num(s, "height"),
            "bleed": num(bleed, "top") if bleed is not None else 0,
            "elements": [parse_element(e) for e in (content if content is not None else [])],
        })
    return {
        "slug": path.stem,
        "name": YEARBOOKS[path.stem],
        "title": meta.get("title"),
        "created": meta.get("timestampCreated"),
        "changed": meta.get("timestampChanged"),
        "articleId": root.get("articleId"),
        "productTitle": b64text(root.get("productTitle", "")),
        "surfaces": surfaces,
    }


def main():
    books = [parse_book(RAW / f"{slug}.xml") for slug in YEARBOOKS]
    OUT.write_text(json.dumps(books, ensure_ascii=False, indent=1), encoding="utf-8")
    for b in books:
        print(f'{b["name"]:14} {b["articleId"]:8} {len(b["surfaces"]):3} surfaces')


if __name__ == "__main__":
    main()
