"""Local dev entrypoint: API only, auto-reload, CORS open for the Vite server.

Run with: uv run python dev.py
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn import run

from photon.app import create_app


def create_dev_app() -> FastAPI:
    app = create_app()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app


app = create_dev_app()

if __name__ == "__main__":
    run("dev:app", host="127.0.0.1", port=8000, reload=True)
