"""Years started in the app (`years/{year}`): a new year shows up in the year menu before its
photos have gone through the pipeline. Earlier books (Albelli) and years with data are
discovered by the client from the data files."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from photon import db
from photon.api.auth import User

router = APIRouter(prefix="/api/years", tags=["years"])


class Year(BaseModel):
    year: int
    created_by: str
    created_at: str


class NewYear(BaseModel):
    year: int


@router.get("")
def list_years(_user: User) -> list[Year]:
    return [Year.model_validate(y) for y in db.list_years()]


@router.post("")
def create_year(body: NewYear, user: User) -> Year:
    if not 2000 <= body.year <= 2100:
        raise HTTPException(status_code=400, detail="year out of range")
    year = Year(year=body.year, created_by=user.email, created_at=datetime.now(UTC).isoformat())
    db.save_year(year.model_dump())
    return year
