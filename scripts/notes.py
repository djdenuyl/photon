"""Notes from the editor, for the agent: read them, change the page, answer them.

    uv run python scripts/notes.py list            # open notes for the agent, with page context
    uv run python scripts/notes.py list --all      # every note (also "voor mezelf" and done ones)
    uv run python scripts/notes.py edits <page>    # the editor's changes on a page (JSON)
    uv run python scripts/notes.py set-edits <page> <file.json>   # replace them (see edits.ts)
    uv run python scripts/notes.py reply <id> "text"              # answer, keep the note open
    uv run python scripts/notes.py done <id> ["text"]             # answer and mark it done

A note is on a page (`eventId:k`, k = page within the event; the cover `omslagN-front:0`) and
maybe one element of it (its slot: the photo id, "cap0", "month", "letter3", "fill…"). Page edits
are the ElementEdit map of src/web/src/lib/edits.ts, keyed by slot. Writes go to single keys of
the Firestore state documents (the open editor merges them in on its next save), through the REST
API with the token of the gcloud configuration in PHOTON_GCLOUD_CONFIG.
"""

from json import dumps, loads
from pathlib import Path
from shutil import which
from subprocess import run
from sys import argv, exit
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

from photon.settings import get_settings

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = get_settings()
YEAR = "2025"
BASE = (
    f"https://firestore.googleapis.com/v1/projects/{SETTINGS.gcp_project}"
    f"/databases/{SETTINGS.firestore_db}/documents/state"
)


def token() -> str:
    config = ["--configuration", SETTINGS.gcloud_config] if SETTINGS.gcloud_config else []
    gcloud = which("gcloud") or "gcloud"
    cmd = [gcloud, "auth", "print-access-token", *config]
    return run(cmd, check=True, capture_output=True, text=True).stdout.strip()


def call(url: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    req = Request(
        url,
        data=dumps(body).encode() if body is not None else None,
        method="PATCH" if body is not None else "GET",
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
    )
    with urlopen(req) as resp:
        return loads(resp.read())


def read(kind: str) -> dict[str, str]:
    try:
        doc = call(f"{BASE}/{YEAR}-{kind}")
    except HTTPError as e:
        if e.code == 404:  # nothing stored yet
            return {}
        raise
    fields = doc.get("fields", {}).get("data", {}).get("mapValue", {}).get("fields", {})
    return {k: v.get("stringValue", "") for k, v in fields.items()}


def write(kind: str, key: str, value: str) -> None:
    """Set one key of the map, leaving the others as they are."""
    path = quote(f"data.`{key}`", safe="")
    body = {"fields": {"data": {"mapValue": {"fields": {key: {"stringValue": value}}}}}}
    call(f"{BASE}/{YEAR}-{kind}?updateMask.fieldPaths={path}", body)


def context(page: str) -> str:
    """The event behind a page key, from the local plan (if it's there)."""
    event_id = page.rsplit(":", 1)[0]
    plan_file = ROOT / "data" / YEAR / "plan.json"
    if event_id.startswith("omslag") or not plan_file.exists():
        return event_id
    plan = loads(plan_file.read_text(encoding="utf-8"))
    for e in plan["events"]:
        if e["id"] == event_id:
            k = int(page.rsplit(":", 1)[1])
            photos = " ".join(e["photoIds"])
            return f"{e['title']} ({e['start']}), page {k + 1} of the event; photos: {photos}"
    return event_id


def main() -> None:
    args = argv[1:]
    cmd = args[0] if args else "list"
    if cmd == "list":
        notes = {k: loads(v) for k, v in read("notes").items()}
        edits = read("edits")
        shown = 0
        for nid, n in sorted(notes.items(), key=lambda kv: str(kv[1].get("created", ""))):
            if "--all" not in args and (n.get("to") != "agent" or n.get("status") != "open"):
                continue
            shown += 1
            target = n["page"] + (f" / {n['slot']}" if n.get("slot") else "")
            print(f"[{nid}] {n.get('status')} · for {n.get('to')} · {target}")
            print(f"  {n.get('text', '').strip()}")
            print(f"  page: {context(n['page'])}")
            if n["page"] in edits:
                print(f"  edits: {edits[n['page']]}")
            if n.get("reply"):
                print(f"  reply: {n['reply']}")
        if not shown:
            print("No open notes for the agent.")
    elif cmd == "edits" and len(args) == 2:
        print(read("edits").get(args[1], "{}"))
    elif cmd == "set-edits" and len(args) == 3:
        value = loads(Path(args[2]).read_text(encoding="utf-8"))
        write("edits", args[1], dumps(value))
        print(f"edits for {args[1]} replaced")
    elif cmd in ("reply", "done") and len(args) >= 2:
        notes = read("notes")
        if args[1] not in notes:
            exit(f"no note {args[1]}")
        n = loads(notes[args[1]])
        if len(args) >= 3:
            n["reply"] = args[2]
        if cmd == "done":
            n["status"] = "done"
        write("notes", args[1], dumps(n))
        print(f"note {args[1]} {'done' if cmd == 'done' else 'answered'}")
    else:
        exit(__doc__)


if __name__ == "__main__":
    main()
