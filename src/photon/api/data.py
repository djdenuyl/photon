"""The book data and photos: JSON files and images under /data, from the private
bucket (or a local folder in dev, PHOTON_LOCAL_DATA). Login required: these are
personal photos.

Small objects are kept in an in-process LRU cache; images get a day of private
browser caching (the service worker caches them too), JSON is revalidated.
"""
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false, reportMissingTypeStubs=false

from collections import OrderedDict
from functools import lru_cache
from mimetypes import guess_type
from pathlib import Path
from threading import Lock

from fastapi import APIRouter, HTTPException
from google.cloud.storage import Client
from starlette.responses import Response

from photon.api.auth import User
from photon.settings import get_settings

router = APIRouter(tags=["data"])

CACHE_BYTES = 120 * 1024 * 1024
CACHE_MAX_ITEM = 2 * 1024 * 1024
_cache: OrderedDict[str, bytes] = OrderedDict()
_cache_size = 0
_lock = Lock()


@lru_cache
def _bucket():
    s = get_settings()
    return Client(project=s.gcp_project).bucket(s.bucket)


def _read(path: str) -> bytes | None:
    local = get_settings().local_data
    if local:
        root = Path(local).resolve()
        target = (root / path).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            return None
        return target.read_bytes()
    blob = _bucket().blob(f"data/{path}")
    try:
        return blob.download_as_bytes()
    except Exception:  # NotFound and transient errors look the same to the client
        return None


def _cached(path: str) -> bytes | None:
    global _cache_size
    with _lock:
        if path in _cache:
            _cache.move_to_end(path)
            return _cache[path]
    data = _read(path)
    if data is not None and len(data) <= CACHE_MAX_ITEM and not path.endswith(".json"):
        with _lock:
            _cache[path] = data
            _cache_size += len(data)
            while _cache_size > CACHE_BYTES and _cache:
                _, old = _cache.popitem(last=False)
                _cache_size -= len(old)
    return data


@router.get("/data/{path:path}", include_in_schema=False)
def data(path: str, _user: User) -> Response:
    if ".." in path.split("/"):
        raise HTTPException(status_code=400, detail="bad path")
    body = _cached(path)
    if body is None:
        raise HTTPException(status_code=404, detail="not found")
    media = guess_type(path)[0] or "application/octet-stream"
    cache = "no-cache" if path.endswith(".json") else "private, max-age=86400"
    return Response(content=body, media_type=media, headers={"Cache-Control": cache})
