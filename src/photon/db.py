"""Typed Firestore access layer. All Firestore reads/writes go through this module.

Layout: `state/{year}-{kind}` with `{data: {key: value}, updated_by, updated_at}`; `years/{year}`.

google-cloud-firestore is not fully typed, so unknown-type diagnostics are
relaxed here (and only here); the public surface of this module is fully typed.
"""
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

from datetime import UTC, datetime
from functools import lru_cache
from json import dumps, loads
from typing import Any

from google.cloud import firestore

from photon.settings import get_settings

STATE = "state"
YEARS = "years"
INTEGRATIONS = "integrations"
IMPORTED_PHOTOS = "imported_photos"


@lru_cache
def client() -> firestore.Client:
    s = get_settings()
    return firestore.Client(project=s.gcp_project, database=s.firestore_db)


def _ref(year: int, kind: str) -> Any:
    return client().collection(STATE).document(f"{year}-{kind}")


def get_state(year: int, kind: str) -> dict[str, str]:
    snap = _ref(year, kind).get()
    if not snap.exists:
        return {}
    data = (snap.to_dict() or {}).get("data") or {}
    return {str(k): str(v) for k, v in data.items()}


def save_state(year: int, kind: str, data: dict[str, str], email: str) -> None:
    _ref(year, kind).set(
        {"data": data, "updated_by": email, "updated_at": datetime.now(UTC).isoformat()}
    )


def patch_state(year: int, kind: str, changes: dict[str, str | None], email: str) -> None:
    """Set (or, for None, remove) single keys, leaving the rest of the map as it is."""
    data = {k: firestore.DELETE_FIELD if v is None else v for k, v in changes.items()}
    _ref(year, kind).set(
        {"data": data, "updated_by": email, "updated_at": datetime.now(UTC).isoformat()},
        merge=True,
    )


def list_years() -> list[dict[str, Any]]:
    return [snap.to_dict() or {} for snap in client().collection(YEARS).stream()]


def save_year(year: dict[str, Any]) -> None:
    client().collection(YEARS).document(str(year["year"])).set(year)


def integration(email: str, name: str) -> dict[str, Any] | None:
    snap = client().collection(INTEGRATIONS).document(f"{email.lower()}-{name}").get()
    return snap.to_dict() if snap.exists else None


def save_integration(email: str, name: str, data: dict[str, Any]) -> None:
    client().collection(INTEGRATIONS).document(f"{email.lower()}-{name}").set(data)


def delete_integration(email: str, name: str) -> None:
    client().collection(INTEGRATIONS).document(f"{email.lower()}-{name}").delete()


def save_imported_photo(year: int, email: str, photo_id: str, data: dict[str, Any]) -> None:
    key = f"{year}-{email.lower()}-{photo_id}"
    client().collection(IMPORTED_PHOTOS).document(key).set(data)


def list_imported_photos(year: int, email: str) -> list[dict[str, Any]]:
    snaps = (
        client()
        .collection(IMPORTED_PHOTOS)
        .where("owner", "==", email.lower())
        .where("year", "==", year)
        .stream()
    )
    return [snap.to_dict() or {} for snap in snaps]


def imported_photo(year: int, email: str, photo_id: str) -> dict[str, Any] | None:
    key = f"{year}-{email.lower()}-{photo_id}"
    snap = client().collection(IMPORTED_PHOTOS).document(key).get()
    return snap.to_dict() if snap.exists else None


def delete_imported_photo(year: int, email: str, photo_id: str) -> None:
    client().collection(IMPORTED_PHOTOS).document(f"{year}-{email.lower()}-{photo_id}").delete()


def remove_photo_references(year: int, photo_id: str, email: str) -> None:
    picks = get_state(year, "picks")
    removed_picks: dict[str, str | None] = {
        key: None for key, value in picks.items() if value == photo_id
    }
    if removed_picks:
        patch_state(year, "picks", removed_picks, email)

    changes: dict[str, str | None] = {}
    for page_key, raw in get_state(year, "edits").items():
        try:
            page = loads(raw)
        except ValueError:
            continue
        if not isinstance(page, dict):
            continue
        changed = False
        for edit in page.values():
            if not isinstance(edit, dict):
                continue
            if edit.get("photo") == photo_id:
                edit["photo"] = ""
                changed = True
            cells = edit.get("cells")
            if isinstance(cells, list) and photo_id in cells:
                edit["cells"] = ["" if cell == photo_id else cell for cell in cells]
                changed = True
        if changed:
            changes[page_key] = dumps(page)
    if changes:
        patch_state(year, "edits", changes, email)
