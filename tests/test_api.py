"""API smoke tests: health is open, everything with personal data needs a login."""
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false

from pathlib import Path

from fastapi.testclient import TestClient
from itsdangerous import URLSafeTimedSerializer
from pytest import MonkeyPatch

from photon.api.auth import agent_signer
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


def test_agent_link(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:

    from photon.api.auth import agent_signer

    c = client(monkeypatch, tmp_path)
    # a valid link signs in the first allowed account and goes to the page asked for
    r = c.get(
        "/api/auth/agent",
        params={"t": agent_signer().dumps({"email": "a@example.com"}), "next": "/boek/2025"},
        follow_redirects=False,
    )
    assert r.status_code == 307 and r.headers["location"] == "/boek/2025"
    assert c.get("/api/auth/me").json()["email"] == "a@example.com"


def test_agent_link_refused(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    c = client(monkeypatch, tmp_path)
    forged = URLSafeTimedSerializer("some-other-secret", salt="photon-agent-login").dumps(
        {"email": "a@example.com"}
    )
    other = agent_signer().dumps({"email": "b@example.com"})
    for t in (forged, other, "garbage"):
        assert c.get("/api/auth/agent", params={"t": t}, follow_redirects=False).status_code == 401
    assert c.get("/api/auth/me").status_code == 401
    # off-site redirects are not followed
    ok = agent_signer().dumps({"email": "a@example.com"})
    r = c.get("/api/auth/agent", params={"t": ok, "next": "//evil.example"}, follow_redirects=False)
    assert r.headers["location"] == "/"
