"""Render every yearbook surface to a JPEG with the real thumbnails -> data/albelli/renders/<slug>/NN.jpg.

Meant for looking at the books (by a person or a model); text boxes are drawn as outlined
areas with the caption printed, so placement stays visible without font rendering.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "albelli"
WIDTH = int(sys.argv[1]) if len(sys.argv) > 1 else 1400


def load_thumb(photo, cache={}):
    if not photo or not photo.get("thumb"):
        return None
    path = DATA / "thumbs" / "300" / photo["thumb"]
    if path not in cache:
        # Keep transparency: month titles are transparent PNGs with photo-filled letters.
        cache[path] = Image.open(path).convert("RGBA")
    return cache[path]


def render(surface, photos, font):
    scale = WIDTH / surface["w"]
    H = round(surface["h"] * scale)
    img = Image.new("RGB", (WIDTH, H), "white")
    draw = ImageDraw.Draw(img, "RGBA")
    px = lambda v: round(v * scale)
    for e in surface["elements"]:
        box = (px(e["x"]), px(e["y"]), px(e["x"] + e["w"]), px(e["y"] + e["h"]))
        w, h = max(1, box[2] - box[0]), max(1, box[3] - box[1])
        if e["type"] in ("background-color", "color"):
            draw.rectangle(box, fill=e.get("color") or "#ffffff")
        elif e["type"] in ("photo", "background-photo"):
            src = load_thumb(photos.get(e["photoId"]))
            if src is None:
                draw.rectangle(box, fill="#999999")
                continue
            crop = e["crop"]
            # The photo is scaled to crop.width x crop.height and centred in the frame; the
            # offsets shift the photo (not the window). Verified against the Albelli editor.
            iw, ih = max(1, px(crop["width"])), max(1, px(crop["height"]))
            full = src.resize((iw, ih))
            ox = px((crop["width"] - e["w"]) / 2 - crop["offsetX"])
            oy = px((crop["height"] - e["h"]) / 2 - crop["offsetY"])
            tile = full.crop((ox, oy, ox + w, oy + h))
            if e["rotation"]:
                tile = tile.rotate(-e["rotation"], expand=True)
                cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
                img.paste(tile, (cx - tile.width // 2, cy - tile.height // 2), tile)
            else:
                img.paste(tile, box[:2], tile)
        elif e["type"] == "text" and e.get("content"):
            draw.rectangle(box, outline=(230, 40, 40, 255), width=2)
            draw.multiline_text((box[0] + 4, box[1] + 2), wrap(e["content"], w, font), fill=e.get("color") or "#000", font=font)
        elif e["type"] in ("clipart", "background-asset"):
            draw.rectangle(box, outline=(40, 120, 230, 160), width=2)
    if surface["target"] in ("spread", "cover"):
        draw.line([(WIDTH // 2, 0), (WIDTH // 2, H)], fill=(0, 0, 0, 60), width=1)
    return img


def wrap(text, width, font):
    lines = []
    for para in text.split("\n"):
        line = ""
        for word in para.split():
            trial = f"{line} {word}".strip()
            if font.getlength(trial) > width - 8 and line:
                lines.append(line)
                line = word
            else:
                line = trial
        lines.append(line)
    return "\n".join(lines)


def main():
    books = json.loads((DATA / "books.json").read_text(encoding="utf-8"))
    photos = json.loads((DATA / "photos.json").read_text(encoding="utf-8"))
    try:
        font = ImageFont.truetype("arial.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    for book in books:
        out = DATA / "renders" / book["slug"]
        out.mkdir(parents=True, exist_ok=True)
        for i, s in enumerate(book["surfaces"]):
            render(s, photos, font).save(out / f"{i:02d}.jpg", quality=82)
        print(book["name"], len(book["surfaces"]))


if __name__ == "__main__":
    main()
