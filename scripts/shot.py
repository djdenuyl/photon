"""For the agent: sign in to the live app and take screenshots, to check its own work.

    uv run --group tools python scripts/shot.py "/boek/2025?s=19"            # desktop 1440x1000
    uv run --group tools python scripts/shot.py "/boek/2025?s=39" --phone    # a phone, 390x844
    uv run --group tools python scripts/shot.py /boek/2025 --click "[aria-label^='Pagina bewerken']"
    uv run --group tools python scripts/shot.py --link "/boek/2025"          # only a sign-in link

The sign-in link (see /api/auth/agent) is signed with the session secret from Secret Manager, so
only someone with David's gcloud access (PHOTON_GCLOUD_CONFIG) can make one; it is valid for two
minutes and gives a two-hour session. Screenshots use Playwright with the installed Edge (or
Chrome), in a throwaway profile; --phone emulates a phone (size, touch, device pixels). --click
clicks CSS selectors (in order) before the screenshot.
"""

from argparse import ArgumentParser
from pathlib import Path
from shutil import which
from subprocess import run
from urllib.parse import urlencode

from itsdangerous import URLSafeTimedSerializer
from playwright.sync_api import sync_playwright

from photon.settings import get_settings

SETTINGS = get_settings()


def session_secret() -> str:
    gcloud = which("gcloud") or "gcloud"
    config = ["--configuration", SETTINGS.gcloud_config] if SETTINGS.gcloud_config else []
    cmd = [gcloud, "secrets", "versions", "access", "latest", "--secret=photon-session-secret"]
    cmd += [f"--project={SETTINGS.gcp_project}", *config]
    return run(cmd, check=True, capture_output=True, text=True).stdout.strip()


def sign_in_link(path: str) -> str:
    email = sorted(SETTINGS.allowed_email_set)[0]
    signer = URLSafeTimedSerializer(session_secret(), salt="photon-agent-login")
    token = signer.dumps({"email": email})
    base = SETTINGS.public_url or SETTINGS.base_url
    return f"{base}/api/auth/agent?{urlencode({'t': token, 'next': path})}"


def main() -> None:
    ap = ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("path", nargs="?", default="/boek/2025")
    ap.add_argument("--out", default="shot.png")
    ap.add_argument("--size", default="1440x1000")
    ap.add_argument("--phone", action="store_true", help="emulate a phone (390x844, touch)")
    ap.add_argument("--click", action="append", default=[], help="CSS selector to click first")
    ap.add_argument("--wait", type=int, default=4000, help="ms to wait for the photos")
    ap.add_argument("--link", action="store_true", help="only print the sign-in link")
    args = ap.parse_args()
    link = sign_in_link(args.path)
    if args.link:
        print(link)
        return
    w, h = (390, 844) if args.phone else map(int, args.size.split("x"))
    out = Path(args.out).resolve()
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="msedge")
        except Exception:
            browser = p.chromium.launch(channel="chrome")
        page = browser.new_page(
            viewport={"width": w, "height": h},
            device_scale_factor=2 if args.phone else 1,
            is_mobile=args.phone,
            has_touch=args.phone,
        )
        page.goto(link, wait_until="networkidle")
        for sel in args.click:
            page.click(sel)
            page.wait_for_timeout(600)
        page.wait_for_timeout(args.wait)
        page.screenshot(path=str(out))
        browser.close()
    print(out)


if __name__ == "__main__":
    main()
