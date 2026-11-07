"""Google Photos Picker integration and durable imports into Photon's private catalog."""
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false, reportMissingTypeStubs=false

from base64 import urlsafe_b64encode
from contextlib import suppress
from datetime import UTC, datetime
from hashlib import sha256
from json import dumps, loads
from re import fullmatch
from typing import Annotated, Any
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

from authlib.integrations.starlette_client import OAuth
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, HTTPException, Query, Request
from google.api_core.exceptions import NotFound
from google.cloud.storage import Client
from httpx import AsyncClient, HTTPError
from pydantic import BaseModel
from starlette.responses import RedirectResponse, Response

from photon import db
from photon.api.auth import User, allowed
from photon.settings import get_settings

router = APIRouter(prefix="/api/google-photos", tags=["Google Photos"])
PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
PICKER_API = "https://photospicker.googleapis.com/v1"
_oauth = OAuth()
_oauth.register(
    name="google_photos",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=get_settings().oauth_client_id,
    client_secret=get_settings().oauth_client_secret,
    client_kwargs={"scope": f"openid email profile {PICKER_SCOPE}"},
)


def _fernet() -> Fernet:
    settings = get_settings()
    material = f"{settings.session_secret}\0{settings.oauth_client_secret}".encode()
    return Fernet(urlsafe_b64encode(sha256(material).digest()))


def _save_token(email: str, token: dict[str, Any]) -> None:
    encrypted = _fernet().encrypt(dumps(token).encode()).decode()
    db.save_integration(email, "google-photos", {"token": encrypted})


def _read_token(email: str) -> dict[str, Any] | None:
    record = db.integration(email, "google-photos")
    if not record or not isinstance(record.get("token"), str):
        return None
    try:
        value = loads(_fernet().decrypt(record["token"].encode()))
    except (InvalidToken, ValueError):
        return None
    return value if isinstance(value, dict) else None


async def _access_token(email: str) -> str:
    token = _read_token(email)
    if token is None:
        raise HTTPException(status_code=409, detail="Google Photos is not connected")
    if float(token.get("expires_at", 0)) < datetime.now(UTC).timestamp() + 60:
        refresh = token.get("refresh_token")
        if not isinstance(refresh, str):
            db.delete_integration(email, "google-photos")
            raise HTTPException(status_code=409, detail="Reconnect Google Photos")
        async with AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": get_settings().oauth_client_id,
                    "client_secret": get_settings().oauth_client_secret,
                    "refresh_token": refresh,
                    "grant_type": "refresh_token",
                },
            )
        if response.is_error:
            db.delete_integration(email, "google-photos")
            raise HTTPException(status_code=409, detail="Reconnect Google Photos")
        token.update(response.json())
        token["refresh_token"] = refresh
        token["expires_at"] = datetime.now(UTC).timestamp() + float(token.get("expires_in", 3600))
        _save_token(email, token)
    access = token.get("access_token")
    if not isinstance(access, str):
        raise HTTPException(status_code=409, detail="Reconnect Google Photos")
    return access


def _api_error(response: Any) -> None:
    if response.is_error:
        detail = "Google Photos request failed"
        with suppress(ValueError, AttributeError):
            detail = str(response.json().get("error", {}).get("message", detail))
        raise HTTPException(status_code=502, detail=detail)


@router.get("/connect")
async def connect(request: Request, next: Annotated[str, Query()] = "/") -> RedirectResponse:
    user = request.session.get("user")
    if not isinstance(user, dict) or not allowed(str(user.get("email", ""))):
        raise HTTPException(status_code=401, detail="not authenticated")
    safe_next = next if next.startswith("/") and not next.startswith("//") else "/"
    base_url = get_settings().base_url
    client_host = request.client.host if request.client else ""
    local_vite_proxy = urlsplit(base_url).hostname == "localhost" and client_host in {
        "127.0.0.1",
        "::1",
    }
    if request.url.netloc != urlsplit(base_url).netloc and not local_vite_proxy:
        return RedirectResponse(
            url=f"{base_url}/api/google-photos/connect?next={quote(safe_next, safe='')}"
        )
    request.session["google_photos_next"] = safe_next
    return await _oauth.google_photos.authorize_redirect(
        request,
        f"{base_url}/api/google-photos/callback",
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )


@router.get("/callback")
async def callback(request: Request) -> RedirectResponse:
    user = request.session.get("user")
    if not isinstance(user, dict) or not allowed(str(user.get("email", ""))):
        raise HTTPException(status_code=401, detail="not authenticated")
    email = str(user.get("email", "")).lower()
    try:
        token = await _oauth.google_photos.authorize_access_token(request)
        response = await _oauth.google_photos.get(
            "https://openidconnect.googleapis.com/v1/userinfo", token=token
        )
        identity = response.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Google Photos authorization failed") from exc
    if str(identity.get("email", "")).lower() != email or not identity.get("email_verified"):
        raise HTTPException(status_code=403, detail="Connect the Google account used to sign in")
    token["expires_at"] = datetime.now(UTC).timestamp() + float(token.get("expires_in", 3600))
    _save_token(email, token)
    next_path = request.session.pop("google_photos_next", "/")
    safe_next = (
        next_path
        if isinstance(next_path, str)
        and next_path.startswith("/")
        and not next_path.startswith("//")
        else "/"
    )
    # lets the tab that drove the OAuth round trip tell its opener it's done and close itself
    parts = urlsplit(safe_next)
    query = [*parse_qsl(parts.query), ("gp", "connected")]
    return RedirectResponse(urlunsplit(parts._replace(query=urlencode(query))))


@router.get("/status")
def status(user: User) -> dict[str, bool]:
    return {"connected": _read_token(user.email) is not None}


@router.delete("/connection")
async def disconnect(user: User) -> dict[str, bool]:
    token = _read_token(user.email)
    db.delete_integration(user.email, "google-photos")
    if token:
        access = token.get("access_token")
        if isinstance(access, str):
            try:
                async with AsyncClient(timeout=20) as client:
                    await client.post(
                        "https://oauth2.googleapis.com/revoke", data={"token": access}
                    )
            except HTTPError:
                pass
    return {"ok": True}


@router.post("/sessions")
async def create_session(user: User) -> dict[str, str]:
    access = await _access_token(user.email)
    async with AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{PICKER_API}/sessions",
            headers={"Authorization": f"Bearer {access}"},
            json={"pickingConfig": {"maxItemCount": "50"}},
        )
    _api_error(response)
    result = response.json()
    return {"sessionId": str(result["id"]), "pickerUri": str(result["pickerUri"])}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: User) -> dict[str, Any]:
    if not fullmatch(r"[A-Za-z0-9_-]{8,200}", session_id):
        raise HTTPException(status_code=400, detail="invalid session")
    access = await _access_token(user.email)
    async with AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{PICKER_API}/sessions/{session_id}", headers={"Authorization": f"Bearer {access}"}
        )
    _api_error(response)
    return response.json()


@router.delete("/sessions/{session_id}")
async def cancel_session(session_id: str, user: User) -> dict[str, bool]:
    """Cancel a picker session the user backed out of before finishing their selection."""
    if not fullmatch(r"[A-Za-z0-9_-]{8,200}", session_id):
        raise HTTPException(status_code=400, detail="invalid session")
    access = await _access_token(user.email)
    async with AsyncClient(timeout=20) as client:
        with suppress(HTTPError):
            await client.delete(
                f"{PICKER_API}/sessions/{session_id}", headers={"Authorization": f"Bearer {access}"}
            )
    return {"ok": True}


class ImportRequest(BaseModel):
    year: int
    event_id: str
    session_id: str


def _owner_key(email: str) -> str:
    return sha256(email.lower().encode()).hexdigest()[:16]


def _store_asset(
    year: int, email: str, photo_id: str, variant: str, content: bytes, mime: str
) -> None:
    settings = get_settings()
    blob = (
        Client(project=settings.gcp_project)
        .bucket(settings.bucket)
        .blob(f"data/{year}/imports/{_owner_key(email)}/{photo_id}/{variant}.bin")
    )
    if not blob.exists():
        blob.upload_from_string(content, content_type=mime)


def _load_asset(year: int, email: str, photo_id: str, variant: str) -> tuple[bytes, str] | None:
    meta = db.imported_photo(year, email, photo_id)
    if not meta:
        return None
    mime = str(meta.get("mime", "image/jpeg"))
    settings = get_settings()
    blob = (
        Client(project=settings.gcp_project)
        .bucket(settings.bucket)
        .blob(f"data/{year}/imports/{_owner_key(email)}/{photo_id}/{variant}.bin")
    )
    try:
        return blob.download_as_bytes(), mime
    except Exception:
        return None


@router.post("/import")
async def import_selected(body: ImportRequest, user: User) -> dict[str, int]:
    if (
        not 2000 <= body.year <= 2100
        or not fullmatch(r"[A-Za-z0-9_-]{1,120}", body.event_id)
        or not fullmatch(r"[A-Za-z0-9_-]{8,200}", body.session_id)
    ):
        raise HTTPException(status_code=400, detail="invalid year or event")
    access = await _access_token(user.email)
    headers = {"Authorization": f"Bearer {access}"}
    async with AsyncClient(timeout=90) as client:
        status_response = await client.get(
            f"{PICKER_API}/sessions/{body.session_id}", headers=headers
        )
        _api_error(status_response)
        if not status_response.json().get("mediaItemsSet"):
            raise HTTPException(status_code=409, detail="Photo selection is not finished")
        page_token = ""
        media_items: list[dict[str, Any]] = []
        while True:
            params: dict[str, str] = {"sessionId": body.session_id, "pageSize": "100"}
            if page_token:
                params["pageToken"] = page_token
            listed = await client.get(f"{PICKER_API}/mediaItems", headers=headers, params=params)
            _api_error(listed)
            page = listed.json()
            media_items.extend(page.get("mediaItems", []))
            page_token = str(page.get("nextPageToken", ""))
            if not page_token:
                break
        imported = 0
        duplicates = 0
        for item in media_items:
            media = item.get("mediaFile", {})
            if not str(media.get("mimeType", "")).startswith("image/"):
                continue
            source_id = str(item.get("id", ""))
            base_url = str(media.get("baseUrl", ""))
            if not source_id or not base_url:
                continue
            media_url = urlsplit(base_url)
            if media_url.scheme != "https" or not (media_url.hostname or "").endswith(
                ".googleusercontent.com"
            ):
                continue
            photo_id = "g" + sha256(source_id.encode()).hexdigest()[:15]
            if db.imported_photo(body.year, user.email, photo_id):
                duplicates += 1
                continue
            files: dict[str, tuple[bytes, str]] = {}
            for variant, suffix in (("thumb", "w300-h300-c"), ("display", "w2048-h2048")):
                downloaded = await client.get(f"{base_url}={suffix}", headers=headers)
                _api_error(downloaded)
                files[variant] = (
                    downloaded.content,
                    downloaded.headers.get("content-type", "image/jpeg").split(";")[0],
                )
            mime = files["display"][1]
            _store_asset(body.year, user.email, photo_id, "thumb", *files["thumb"])
            _store_asset(body.year, user.email, photo_id, "display", *files["display"])
            metadata = media.get("mediaMetadata", {})
            taken = str(metadata.get("creationTime", datetime.now(UTC).isoformat()))
            try:
                stamp = datetime.fromisoformat(taken.replace("Z", "+00:00"))
            except ValueError:
                stamp = datetime.now(UTC)
            width = int(metadata.get("width", 1600))
            height = int(metadata.get("height", 1200))
            db.save_imported_photo(
                body.year,
                user.email,
                photo_id,
                {
                    "id": photo_id,
                    "year": body.year,
                    "owner": user.email.lower(),
                    "source_id": source_id,
                    "event_id": body.event_id,
                    "taken": taken,
                    "date": stamp.date().isoformat(),
                    "time": stamp.strftime("%H:%M:%S"),
                    "file": f"imports/{photo_id}",
                    "mime": mime,
                    "w": width,
                    "h": height,
                    "whatsapp": False,
                    "thumb": f"/api/google-photos/assets/{body.year}/{photo_id}/thumb",
                    "display": f"/api/google-photos/assets/{body.year}/{photo_id}/display",
                },
            )
            imported += 1
        with suppress(HTTPError):
            await client.delete(f"{PICKER_API}/sessions/{body.session_id}", headers=headers)
    return {"imported": imported, "duplicates": duplicates}


@router.get("/{year}")
def imported(year: int, user: User) -> list[dict[str, Any]]:
    fields = (
        "id",
        "event_id",
        "taken",
        "date",
        "time",
        "file",
        "w",
        "h",
        "whatsapp",
        "thumb",
        "display",
    )
    return [
        {key: photo[key] for key in fields if key in photo}
        for photo in db.list_imported_photos(year, user.email)
    ]


@router.delete("/{year}/{photo_id}")
def delete_import(year: int, photo_id: str, user: User) -> dict[str, bool]:
    if not 2000 <= year <= 2100 or not fullmatch(r"g[a-f0-9]{15}", photo_id):
        raise HTTPException(status_code=404, detail="not found")
    if db.imported_photo(year, user.email, photo_id) is None:
        raise HTTPException(status_code=404, detail="not found")
    db.remove_photo_references(year, photo_id, user.email)
    bucket = Client(project=get_settings().gcp_project).bucket(get_settings().bucket)
    for variant in ("thumb", "display"):
        blob = bucket.blob(f"data/{year}/imports/{_owner_key(user.email)}/{photo_id}/{variant}.bin")
        with suppress(NotFound):
            blob.delete()
    db.delete_imported_photo(year, user.email, photo_id)
    return {"ok": True}


@router.get("/assets/{year}/{photo_id}/{variant}")
def asset(year: int, photo_id: str, variant: str, user: User) -> Response:
    if variant not in {"thumb", "display"} or not fullmatch(r"g[a-f0-9]{15}", photo_id):
        raise HTTPException(status_code=404, detail="not found")
    found = _load_asset(year, user.email, photo_id, variant)
    if found is None:
        raise HTTPException(status_code=404, detail="not found")
    body, mime = found
    return Response(
        content=body, media_type=mime, headers={"Cache-Control": "private, max-age=86400"}
    )
