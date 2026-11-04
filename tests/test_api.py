"""API smoke tests: health is open, everything with personal data needs a login."""
# pyright: reportUnknownMemberType=false

from pathlib import Path

from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from photon.app import create_app
from photon.settings import get_settings


def client(monkeypatch: MonkeyPatch, tmp_path: Path) -> TestClient:
    (tmp_path / "2025").mkdir()
    (tmp_path / "2025" / "plan.json").write_text('{"events": []}', encoding="utf-8")
    monkeypatch.setenv("PHOTON_LOCAL_DATA", str(tmp_path))
    monkeypatch.setenv("PHOTON_ALLOWED_EMAILS", "a@example.com")
    get_settings.cache_clear()
    return TestClient(create_app())


def test_health(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    assert client(monkeypatch, tmp_path).get("/api/health").json() == {"status": "ok"}


def test_data_needs_login(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    c = client(monkeypatch, tmp_path)
    assert c.get("/data/2025/plan.json").status_code == 401
    assert c.get("/api/state/2025/picks").status_code == 401
    assert c.get("/api/auth/me").status_code == 401
