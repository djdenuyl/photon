"""Production entrypoint: API + the built React bundle from a single process.

The Docker build copies the Vite output to src/web/dist; anything that isn't an
/api or /data route falls back to index.html (SPA routing).

Run with: uv run python main.py
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from uvicorn import run

from photon.app import create_app

WEB_DIST = Path(__file__).resolve().parent / "src" / "web" / "dist"


def create_prod_app() -> FastAPI:
    app = create_app()
    if WEB_DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str) -> FileResponse:  # pyright: ignore[reportUnusedFunction] — registered via decorator
            candidate = (WEB_DIST / path).resolve()
            if path and candidate.is_file() and candidate.is_relative_to(WEB_DIST):
                return FileResponse(candidate)
            # SPA routes never contain a dot: a dotted path that isn't a file is
            # a crawler or scanner probe (/sitemap.xml, /.env, /wp-login.php)
            if "." in path:
                raise HTTPException(status_code=404)
            return FileResponse(WEB_DIST / "index.html")

    return app


app = create_prod_app()

if __name__ == "__main__":
    run(app, host="0.0.0.0", port=8080)
