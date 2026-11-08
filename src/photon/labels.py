"""Labels and tones for photos imported from Google Photos: the same fields the local pipeline
makes for the album photos (tones: tools/photo_tones.py; labels: Claude, from contact sheets).

Claude gets a few labelled photos of each family member as references (a cached prefix, the
same for every request), then a batch of new photos, and returns their labels as structured
output. Without PHOTON_ANTHROPIC_API_KEY nothing is labelled; the import still works.
"""
# pyright: reportUnknownMemberType=false

from asyncio import Semaphore, gather, to_thread
from base64 import standard_b64encode
from functools import lru_cache
from io import BytesIO
from json import loads
from logging import getLogger
from typing import Any, Literal

from anthropic import APIError, AsyncAnthropic
from anthropic.types.beta import BetaImageBlockParam, BetaTextBlockParam
from PIL import Image
from pydantic import BaseModel, Field

from photon.api.data import read
from photon.settings import get_settings

FAMILY = ("Anne", "David", "Lou", "Oos")
MODEL = "claude-opus-5"
REFERENCES_PER_PERSON = 3
BATCH = 8
REFERENCE_PX = 512
PHOTO_PX = 768

log = getLogger(__name__)

SYSTEM = """You label photos for a family photo book ("Het Jaar Rond") with the same fields as \
the rest of the year's photos. The family is Anne, David, Lou and Oos; the reference photos show \
each of them. For every photo you are given:
- family: which of Anne, David, Lou and Oos are recognisably in it. Only them; leave someone out \
when you can't tell.
- others: how many other people are in it.
- faces: how many faces are visible in total.
- closeup: true when one or two faces fill a large part of the frame (a portrait), false when \
people are small in the scene.
- face_x, face_y: the centre of the main face or faces, as fractions of the photo's width and \
height (0 = left/top, 1 = right/bottom); null when there is no face.
- objects_only: true when there are no people at all (food, a toy, a building).
- scenic: true for an atmospheric shot that could fill a page behind other photos: a landscape, \
the sea, a street, with no person as its subject.
- quality: "matig" when the photo is blurry, too dark, badly cut off or otherwise weak; \
otherwise "goed".
Return one entry per photo, with the id written above it."""


class PhotoLabel(BaseModel):
    id: str
    family: list[Literal["Anne", "David", "Lou", "Oos"]]
    others: int
    faces: int
    closeup: bool
    face_x: float | None = Field(description="0..1, null when there is no face")
    face_y: float | None = Field(description="0..1, null when there is no face")
    objects_only: bool
    scenic: bool
    quality: Literal["goed", "matig"]

    def label(self) -> dict[str, Any]:
        """The label as the app stores it (the keys of labels.json)."""
        face = None
        if self.face_x is not None and self.face_y is not None:
            face = [round(min(1, max(0, self.face_x)), 2), round(min(1, max(0, self.face_y)), 2)]
        return {
            "family": sorted(set(self.family), key=FAMILY.index),
            "others": max(0, self.others),
            "faces": max(0, self.faces),
            "closeup": self.closeup,
            "face": face,
            "objectsOnly": self.objects_only,
            "scenic": self.scenic,
            "quality": self.quality,
        }


class Labels(BaseModel):
    photos: list[PhotoLabel]


def tone(image: bytes) -> str:
    """The photo's tone: its mean colour without the brightest and darkest 10% (photo_tones.py)."""
    raw = Image.open(BytesIO(image)).convert("RGB").resize((48, 48)).tobytes()
    px = sorted((tuple(raw[i : i + 3]) for i in range(0, len(raw), 3)), key=sum)
    cut = len(px) // 10
    core = px[cut:-cut]
    r, g, b = (sum(c[i] for c in core) // len(core) for i in range(3))
    return f"#{r:02x}{g:02x}{b:02x}"


def _jpeg(image: bytes, size: int) -> str:
    img = Image.open(BytesIO(image)).convert("RGB")
    img.thumbnail((size, size))
    out = BytesIO()
    img.save(out, "JPEG", quality=85)
    return standard_b64encode(out.getvalue()).decode()


Block = BetaImageBlockParam | BetaTextBlockParam


def _image(data: str, cache: bool = False) -> BetaImageBlockParam:
    block: BetaImageBlockParam = {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg", "data": data},
    }
    if cache:
        block["cache_control"] = {"type": "ephemeral"}
    return block


@lru_cache(maxsize=4)
def _references(year: int) -> tuple[tuple[str, tuple[str, ...]], ...]:
    """Per family member a few clear photos of only them (close-ups first, the latest first),
    from this year's labels, else last year's."""
    for y in (year, year - 1):
        labels: dict[str, dict[str, Any]] = loads(read(f"{y}/labels.json") or b"{}")
        if not labels:
            continue
        index: list[dict[str, Any]] = loads(read(f"{y}/index.json") or b"[]")
        dates = {str(p["id"]): str(p.get("date") or "") for p in index}
        refs: list[tuple[str, tuple[str, ...]]] = []
        for person in FAMILY:
            ids = [
                pid
                for pid, label in labels.items()
                if label.get("family") == [person]
                and label.get("others") == 0
                and label.get("faces") == 1
                and label.get("quality") == "goed"
            ]
            ids.sort(
                key=lambda pid: (bool(labels[pid].get("closeup")), dates.get(pid, "")),
                reverse=True,
            )
            found: list[str] = []
            for pid in ids:
                image = read(f"{y}/display/{pid}.jpg")
                if image:
                    found.append(_jpeg(image, REFERENCE_PX))
                if len(found) == REFERENCES_PER_PERSON:
                    break
            if found:
                refs.append((person, tuple(found)))
        return tuple(refs)
    return ()


def _prefix(refs: tuple[tuple[str, tuple[str, ...]], ...]) -> list[Block]:
    """The reference photos; the cache breakpoint sits on the very last one."""
    blocks: list[Block] = []
    for n, (person, images) in enumerate(refs):
        blocks.append({"type": "text", "text": f"Reference photos of {person}:"})
        last_person = n == len(refs) - 1
        blocks.extend(
            _image(i, cache=last_person and k == len(images) - 1) for k, i in enumerate(images)
        )
    return blocks


async def _label_batch(
    client: AsyncAnthropic, prefix: list[Block], batch: list[tuple[str, bytes]]
) -> dict[str, dict[str, Any]]:
    content: list[Block] = list(prefix)
    for photo_id, image in batch:
        content.append({"type": "text", "text": f"Photo {photo_id}:"})
        content.append(_image(await to_thread(_jpeg, image, PHOTO_PX)))
    content.append({"type": "text", "text": f"Label these {len(batch)} photos."})
    try:
        response = await client.beta.messages.parse(
            model=MODEL,
            max_tokens=8000,
            system=SYSTEM,
            messages=[{"role": "user", "content": content}],
            output_format=Labels,
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except APIError as exc:
        log.warning("labelling %d photos failed: %s", len(batch), exc)
        return {}
    if response.stop_reason == "refusal" or response.parsed_output is None:
        log.warning("labelling %d photos: no labels (%s)", len(batch), response.stop_reason)
        return {}
    wanted = {photo_id for photo_id, _ in batch}
    return {p.id: p.label() for p in response.parsed_output.photos if p.id in wanted}


async def label_photos(year: int, photos: dict[str, bytes]) -> dict[str, dict[str, Any]]:
    """Labels for the given photos ({id: image bytes}), by id; the ones that failed are missing."""
    key = get_settings().anthropic_api_key
    if not key or not photos:
        return {}
    refs = await to_thread(_references, year)
    if not refs:
        log.warning("no reference photos to label with for %d", year)
        return {}
    client = AsyncAnthropic(api_key=key)
    prefix = _prefix(refs)
    items = list(photos.items())
    batches = [items[i : i + BATCH] for i in range(0, len(items), BATCH)]
    # the first batch alone writes the cached reference prefix the others then read
    labels = await _label_batch(client, prefix, batches[0])
    limit = Semaphore(3)

    async def one(batch: list[tuple[str, bytes]]) -> dict[str, dict[str, Any]]:
        async with limit:
            return await _label_batch(client, prefix, batch)

    for result in await gather(*(one(b) for b in batches[1:])):
        labels.update(result)
    return labels
