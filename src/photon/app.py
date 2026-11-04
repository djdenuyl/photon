"""FastAPI app factory. dev.py and main.py both build on this."""

from collections.abc import Awaitable, Callable
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse, Response

from photon.api import auth, data, state, years
from photon.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="photon", version="0.1.0")
    # the book data is a few MB of JSON; it compresses well
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        https_only=settings.secure_cookies,
        same_site="lax",
        max_age=90 * 24 * 3600,  # stay logged in on the phone
    )
    canonical = urlsplit(settings.base_url)

    @app.middleware("http")
    async def canonical_host(  # pyright: ignore[reportUnusedFunction] — registered via decorator
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # One origin only: the session cookie and the installed PWA are both
        # per origin, so the run.app URL would mean logged out + browser chrome.
        host = request.url.hostname or ""
        if host.endswith(".run.app") and canonical.scheme == "https":
            target = request.url.replace(scheme="https", netloc=canonical.netloc)
            return RedirectResponse(str(target), status_code=308)
        return await call_next(request)

    app.include_router(auth.router)
    app.include_router(data.router)
    app.include_router(state.router)
    app.include_router(years.router)

    @app.get("/api/health")
    def health() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction] — registered via decorator
        return {"status": "ok"}

    return app
