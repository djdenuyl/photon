"""App configuration. All config flows through this module — no os.environ elsewhere.

One environment: a single Cloud Run service, Firestore database and bucket.
Local development talks to the same database (there is no dev copy)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PHOTON_", env_file=".env", extra="ignore")

    gcp_project: str = "arctic-sound-380822"
    gcp_region: str = "europe-west4"
    firestore_db: str = "photon"
    bucket: str = "arctic-sound-380822-photon"
    """Private bucket with the data files and photos (served through /data)."""
    local_data: str = ""
    """Local folder to serve /data from instead of the bucket (dev); empty = the bucket."""
    base_url: str = "http://localhost:5173"
    """Public URL of the app (OAuth redirect)."""
    public_url: str = ""
    """Deployed URL (custom domain), used by deploy.py; empty = the run.app URL."""
    gcloud_config: str = ""
    """gcloud configuration deploy.py runs under (empty = the active one)."""

    allowed_emails: str = ""
    """Comma-separated accounts that may log in (personal photos: nobody else)."""
    oauth_client_id: str = ""
    oauth_client_secret: str = ""
    session_secret: str = "dev-only-secret-change-me"
    anthropic_api_key: str = ""
    """Labels photos imported from Google Photos (Claude); empty = they stay unlabelled."""

    @property
    def secure_cookies(self) -> bool:
        return self.base_url.startswith("https://")

    @property
    def allowed_email_set(self) -> frozenset[str]:
        return frozenset(e.strip().lower() for e in self.allowed_emails.split(",") if e.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
