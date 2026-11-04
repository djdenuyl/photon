"""Typed Firestore access layer. All Firestore reads/writes go through this module.

Layout: `state/{year}-{kind}` with `{data: {key: value}, updated_by, updated_at}`.

google-cloud-firestore is not fully typed, so unknown-type diagnostics are
relaxed here (and only here); the public surface of this module is fully typed.
"""
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

from google.cloud import firestore

from photon.settings import get_settings

STATE = "state"


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
