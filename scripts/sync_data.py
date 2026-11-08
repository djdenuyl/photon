"""Upload the data the app reads to the private bucket, under gs://<bucket>/data/.

    uv run python scripts/sync_data.py            # json, thumbnails, display photos, originals
    uv run python scripts/sync_data.py --seed     # also copy local answers/picks to Firestore

What the app shows is uploaded, and the year's original photos, which the export renders print
pages from (rsync: only new or changed ones). Raw exports and renders stay local. Uses gcloud under
PHOTON_GCLOUD_CONFIG, like deploy.py. Seeding goes through the Firestore REST API with that
account's token, so it works without application-default credentials.
"""

from json import dumps, loads
from pathlib import Path
from shutil import which
from subprocess import run
from sys import argv
from urllib.request import Request, urlopen

from photon.settings import get_settings

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SETTINGS = get_settings()
GCLOUD = which("gcloud") or "gcloud"
YEAR = "2025"

FILES = [
    "albelli/books.json", "albelli/stats.json", "albelli/photos.json", "albelli/context.json",
    "albelli/graphics.json",
    f"{YEAR}/plan.json", f"{YEAR}/index.json", f"{YEAR}/labels.json", f"{YEAR}/tones.json",
    f"{YEAR}/duplicates.json", "fonts/happy-donuts.otf",
]  # fmt: skip
FOLDERS = ["albelli/thumbs/300", "albelli/graphics-web", f"{YEAR}/thumbs", f"{YEAR}/display"]


def gcloud(*args: str, capture: bool = False) -> str:
    config = ["--configuration", SETTINGS.gcloud_config] if SETTINGS.gcloud_config else []
    result = run([GCLOUD, *args, *config], check=True, capture_output=capture, text=True)
    return result.stdout.strip() if capture else ""


def upload() -> None:
    dest = f"gs://{SETTINGS.bucket}/data"
    for rel in FILES:
        gcloud("storage", "cp", str(DATA / rel), f"{dest}/{rel}")
    for rel in FOLDERS:
        gcloud("storage", "rsync", str(DATA / rel), f"{dest}/{rel}", "--recursive")
    # photos only (the album download also holds the odd video); no "|" in the pattern: gcloud
    # is a .cmd on Windows, and cmd would take it for a pipe
    gcloud(
        "storage", "rsync", str(DATA / YEAR / "originals"), f"{dest}/{YEAR}/originals",
        "--recursive", "--exclude", r".*\.[mM][pPoO][4vV]$",
    )  # fmt: skip


def seed() -> None:
    """Copy answers.json / picks.json to Firestore state docs (overwrites them)."""
    token = gcloud("auth", "print-access-token", capture=True)
    base = (
        f"https://firestore.googleapis.com/v1/projects/{SETTINGS.gcp_project}"
        f"/databases/{SETTINGS.firestore_db}/documents/state"
    )
    for kind in ("answers", "picks"):
        path = DATA / YEAR / f"{kind}.json"
        if not path.exists():
            continue
        data: dict[str, str] = loads(path.read_text(encoding="utf-8"))
        fields = {k: {"stringValue": v} for k, v in data.items()}
        body = {"fields": {"data": {"mapValue": {"fields": fields}}}}
        req = Request(
            f"{base}/{YEAR}-{kind}",
            data=dumps(body).encode(),
            method="PATCH",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        with urlopen(req) as resp:
            print(f"seeded state/{YEAR}-{kind}: {len(data)} entries ({resp.status})")


def main() -> None:
    upload()
    if "--seed" in argv:
        seed()


if __name__ == "__main__":
    main()
