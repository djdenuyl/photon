"""Editable state per year: answers to the open questions, the chosen big photos and the
editor's changes per page.

Each is a small string map (edits: page key -> JSON), stored as one Firestore document
(`state/{year}-{kind}`); a PUT replaces the whole map.
"""

from typing import Literal

from fastapi import APIRouter

from photon import db
from photon.api.auth import User

router = APIRouter(prefix="/api/state", tags=["state"])

Kind = Literal["answers", "picks", "edits"]


@router.get("/{year}/{kind}")
def get_state(year: int, kind: Kind, _user: User) -> dict[str, str]:
    return db.get_state(year, kind)


@router.put("/{year}/{kind}")
def put_state(year: int, kind: Kind, body: dict[str, str], user: User) -> dict[str, str]:
    db.save_state(year, kind, body, user.email)
    return body
