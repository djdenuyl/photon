"""Deploy photon to Cloud Run (one environment).

    uv run python deploy.py setup   # one-time: Firestore DB, bucket, session secret, IAM
    uv run python deploy.py         # build (Cloud Build) + deploy the `photon` service

All non-secret config (GCP project/region, allowed emails, OAuth client ID,
public URL) is read from .env via Settings; secrets are mounted from Secret
Manager via --set-secrets and never passed as env-var values.

PHOTON_GCLOUD_CONFIG names the gcloud configuration to use (the account that
owns the project), so the machine's active configuration can stay on another
account. `gcloud run deploy --source .` builds the Dockerfile in Cloud Build.
The data itself is uploaded separately: scripts/sync_data.py.
"""

from json import dumps
from pathlib import Path
from secrets import token_urlsafe
from shutil import which
from subprocess import run
from sys import argv

from photon.settings import get_settings

SETTINGS = get_settings()
SERVICE = "photon"
SESSION_SECRET = "photon-session-secret"

# env var name -> Secret Manager secret name
SERVICE_SECRETS = {
    # the Google OAuth client is shared with denarius/jumper/stumped (same redirect-URI list)
    "PHOTON_OAUTH_CLIENT_SECRET": "denarius-oauth-client-secret",
    "PHOTON_SESSION_SECRET": SESSION_SECRET,
}

GCLOUD = which("gcloud") or "gcloud"


def gcloud(
    *args: str, capture: bool = False, check: bool = True, stdin: str | None = None
) -> str | None:
    config = ["--configuration", SETTINGS.gcloud_config] if SETTINGS.gcloud_config else []
    result = run(
        [GCLOUD, *args, "--project", SETTINGS.gcp_project, *config],
        check=check,
        capture_output=capture,
        text=True,
        input=stdin,
    )
    if not capture:
        return None
    return result.stdout.strip() or None if result.returncode == 0 else None


def secret_exists(name: str) -> bool:
    return gcloud("secrets", "describe", name, capture=True, check=False) is not None


def existing_secrets(wanted: dict[str, str]) -> dict[str, str]:
    """Only wire up secrets that actually exist, warn about the rest."""
    present: dict[str, str] = {}
    for env_name, secret in wanted.items():
        if secret_exists(secret):
            present[env_name] = secret
        else:
            print(f"WARNING: secret '{secret}' not found in Secret Manager; {env_name} unset")
    return present


def service_url() -> str | None:
    return gcloud(
        "run", "services", "describe", SERVICE, "--region", SETTINGS.gcp_region,
        "--format", "value(status.url)", capture=True, check=False,
    )  # fmt: skip


def project_number() -> str:
    number = gcloud(
        "projects", "describe", SETTINGS.gcp_project, "--format", "value(projectNumber)",
        capture=True,
    )  # fmt: skip
    if number is None:
        raise SystemExit("cannot read the project number")
    return number


def setup() -> None:
    db = SETTINGS.firestore_db
    if (
        gcloud("firestore", "databases", "describe", f"--database={db}", capture=True, check=False)
        is None
    ):
        gcloud(
            "firestore",
            "databases",
            "create",
            f"--database={db}",
            f"--location={SETTINGS.gcp_region}",
        )
        print(f"Created Firestore database {db}")
    bucket = f"gs://{SETTINGS.bucket}"
    if gcloud("storage", "buckets", "describe", bucket, capture=True, check=False) is None:
        gcloud(
            "storage", "buckets", "create", bucket, f"--location={SETTINGS.gcp_region}",
            "--uniform-bucket-level-access", "--public-access-prevention",
        )  # fmt: skip
        print(f"Created bucket {bucket} (private)")
    if not secret_exists(SESSION_SECRET):
        gcloud(
            "secrets", "create", SESSION_SECRET, "--replication-policy", "automatic",
            "--data-file", "-", stdin=token_urlsafe(48), capture=True,
        )  # fmt: skip
        print(f"Created secret {SESSION_SECRET}")
    runtime_sa = f"{project_number()}-compute@developer.gserviceaccount.com"
    gcloud(
        "storage", "buckets", "add-iam-policy-binding", bucket,
        f"--member=serviceAccount:{runtime_sa}", "--role=roles/storage.objectViewer",
        capture=True,
    )  # fmt: skip
    gcloud(
        "storage", "buckets", "add-iam-policy-binding", bucket,
        f"--member=serviceAccount:{runtime_sa}", "--role=roles/storage.objectUser",
        capture=True,
    )  # fmt: skip
    print(f"{runtime_sa} can read {bucket} and add imported photos")


def write_env_file(env_vars: dict[str, str]) -> Path:
    # A file avoids gcloud's K=V,K=V flag parsing entirely: values may contain
    # commas (allowed-emails), and delimiter tricks like "^|^" break on Windows
    # where cmd.exe interprets "|". JSON is valid YAML.
    env_file = Path(".gcloud-env.yaml")
    env_file.write_text(dumps(env_vars), encoding="utf-8")
    return env_file


def ensure_domain_mapping() -> None:
    """Maps the custom domain once the service exists (the *.daviddenuyl.com
    wildcard CNAME already points at ghs.googlehosted.com)."""
    domain = SETTINGS.public_url.removeprefix("https://").rstrip("/")
    if not domain:
        return
    mapped = gcloud(
        "beta", "run", "domain-mappings", "describe", "--domain", domain,
        "--region", SETTINGS.gcp_region, "--format", "value(metadata.name)",
        capture=True, check=False,
    )  # fmt: skip
    if mapped is None:
        gcloud(
            "beta", "run", "domain-mappings", "create", "--service", SERVICE,
            "--domain", domain, "--region", SETTINGS.gcp_region,
        )  # fmt: skip
        print(f"Mapped {domain} (certificate provisioning can take ~15 minutes)")


def deploy() -> None:
    # Prefer the custom domain; otherwise the run.app URL, which doesn't exist
    # before the first deploy and is corrected right after it.
    base_url = SETTINGS.public_url or service_url() or "http://localhost:8080"
    env_vars = {
        "PHOTON_GCP_PROJECT": SETTINGS.gcp_project,
        "PHOTON_FIRESTORE_DB": SETTINGS.firestore_db,
        "PHOTON_BUCKET": SETTINGS.bucket,
        "PHOTON_BASE_URL": base_url,
        "PHOTON_ALLOWED_EMAILS": SETTINGS.allowed_emails,
        "PHOTON_OAUTH_CLIENT_ID": SETTINGS.oauth_client_id,
    }
    secret_flag = ",".join(
        f"{k}={name}:latest" for k, name in existing_secrets(SERVICE_SECRETS).items()
    )
    env_file = write_env_file(env_vars)
    deploy_args = [
        "run", "deploy", SERVICE, "--source", ".", "--region", SETTINGS.gcp_region,
        "--allow-unauthenticated",  # the app enforces its own OAuth + allowlist
        "--memory", "1Gi",  # in-process photo cache
        "--env-vars-file", str(env_file),
    ]  # fmt: skip
    if secret_flag:
        deploy_args += ["--set-secrets", secret_flag]
    print(f"Deploying {SERVICE}...")
    try:
        gcloud(*deploy_args)
    finally:
        env_file.unlink(missing_ok=True)

    url = service_url()
    if not SETTINGS.public_url and url is not None and url != base_url:
        print(f"First deploy: updating PHOTON_BASE_URL to {url}")
        gcloud(
            "run", "services", "update", SERVICE, "--region", SETTINGS.gcp_region,
            "--update-env-vars", f"PHOTON_BASE_URL={url}",
        )  # fmt: skip
    if url is not None:
        ensure_domain_mapping()
    print(f"Deployed: {SETTINGS.public_url or url}")
    print(f"OAuth redirect URI: {SETTINGS.public_url or url}/api/auth/callback")


def main() -> None:
    command = argv[1] if len(argv) > 1 else "deploy"
    if command == "setup":
        setup()
    elif command == "deploy":
        deploy()
    else:
        raise SystemExit("usage: uv run python deploy.py [setup|deploy]")


if __name__ == "__main__":
    main()
