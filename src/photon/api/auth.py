"""Google OAuth (authorization-code flow). Personal photos: only the accounts in
PHOTON_ALLOWED_EMAILS get a session.

Session state lives in a signed cookie (Starlette SessionMiddleware, configured
in app.py). Every other router depends on `require_user`.
"""
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

from typing import Annotated, Any
from urllib.parse import urlsplit

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from starlette.responses import RedirectResponse

from photon.settings import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

_oauth = OAuth()
_oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=get_settings().oauth_client_id,
    client_secret=get_settings().oauth_client_secret,
    client_kwargs={"scope": "openid email profile"},
)


class Me(BaseModel):
    email: str
    name: str | None = None


def allowed(email: str) -> bool:
    return email.lower() in get_settings().allowed_email_set


def require_user(request: Request) -> Me:
    user: dict[str, Any] | None = request.session.get("user")
    if user is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    me = Me.model_validate(user)
    # re-checked per request so removing an address from the list locks it out
    if not allowed(me.email):
        request.session.clear()
        raise HTTPException(status_code=401, detail="not allowed")
    return me


User = Annotated[Me, Depends(require_user)]


@router.get("/login")
async def login(request: Request) -> RedirectResponse:
    base_url = get_settings().base_url
    # The OAuth state lives in the session cookie, which is per host: start on
    # the host Google will send the user back to (e.g. not the run.app URL).
    if request.url.netloc != urlsplit(base_url).netloc:
        return RedirectResponse(url=f"{base_url}/api/auth/login")
    return await _oauth.google.authorize_redirect(request, f"{base_url}/api/auth/callback")


@router.get("/callback")
async def callback(request: Request) -> RedirectResponse:
    try:
        token = await _oauth.google.authorize_access_token(request)
    except OAuthError:
        # stale or missing state (old tab, other host, cookie cleared): back to the login screen
        request.session.clear()
        return RedirectResponse(url="/")
    userinfo: dict[str, Any] = token["userinfo"]
    email = str(userinfo["email"]).lower()
    if not allowed(email):
        request.session.clear()
        return RedirectResponse(url="/?denied=1")
    request.session["user"] = {"email": email, "name": userinfo.get("name")}
    return RedirectResponse(url="/")


@router.get("/me")
def me(user: User) -> Me:
    return user


@router.post("/logout")
def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"ok": True}
