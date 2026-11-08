"""Labels for imported photos: the stored shape matches labels.json, the reference prefix is
cached at its end, and nothing is sent without an API key."""
# pyright: reportPrivateUsage=false

from asyncio import run
from io import BytesIO

from PIL import Image
from pytest import MonkeyPatch

from photon.labels import PhotoLabel, _prefix, label_photos, tone
from photon.settings import get_settings


def test_label_has_the_pipeline_keys() -> None:
    label = PhotoLabel(
        id="g1",
        family=["Oos", "Anne", "Oos"],
        others=-1,
        faces=2,
        closeup=True,
        face_x=1.4,
        face_y=0.333,
        objects_only=False,
        scenic=False,
        quality="goed",
    ).label()
    assert label == {
        "family": ["Anne", "Oos"],
        "others": 0,
        "faces": 2,
        "closeup": True,
        "face": [1, 0.33],
        "objectsOnly": False,
        "scenic": False,
        "quality": "goed",
    }


def test_no_face_is_null() -> None:
    label = PhotoLabel(
        id="g1",
        family=[],
        others=0,
        faces=0,
        closeup=False,
        face_x=None,
        face_y=0.5,
        objects_only=True,
        scenic=True,
        quality="matig",
    ).label()
    assert label["face"] is None


def test_prefix_caches_only_the_last_reference() -> None:
    blocks = _prefix((("Anne", ("a1", "a2")), ("Lou", ("l1",))))
    cached = [b for b in blocks if "cache_control" in b]
    assert len(cached) == 1 and cached[0] is blocks[-1]
    assert [b["text"] for b in blocks if b["type"] == "text"] == [
        "Reference photos of Anne:",
        "Reference photos of Lou:",
    ]


def test_tone_is_the_trimmed_mean() -> None:
    out = BytesIO()
    Image.new("RGB", (20, 20), (10, 120, 200)).save(out, "PNG")
    assert tone(out.getvalue()) == "#0a78c8"


def test_without_a_key_nothing_is_labelled(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setenv("PHOTON_ANTHROPIC_API_KEY", "")
    get_settings.cache_clear()
    assert run(label_photos(2025, {"g1": b"x"})) == {}
