# Deployment

One environment:

| | |
|---|---|
| Cloud Run service | `photon` (`europe-west4`, 1 GiB: in-process photo cache) |
| Domain | `photon.daviddenuyl.com` (domain mapping; `*.daviddenuyl.com` CNAME → ghs.googlehosted.com) |
| Firestore named DB | `photon` (answers to the open questions, chosen big photos) |
| Bucket | `arctic-sound-380822-photon` (private, public access prevented; the runtime service account reads it) |
| gcloud configuration | `zgr` (djdenuyl@gmail.com), set as `PHOTON_GCLOUD_CONFIG` |

```sh
uv run python deploy.py setup          # one-time: Firestore DB, bucket, session secret, bucket read access
uv run python scripts/sync_data.py     # upload the data the app reads (add --seed once: answers/picks → Firestore)
uv run python deploy.py                # build (Cloud Build) + deploy, map the domain if missing
```

`deploy.py` reads non-secret config from `.env` and binds secrets with `--set-secrets`:

| env var | Secret Manager name |
|---|---|
| `PHOTON_OAUTH_CLIENT_SECRET` | `denarius-oauth-client-secret` (shared OAuth client) |
| `PHOTON_SESSION_SECRET` | `photon-session-secret` |

Login is Google OAuth for the accounts in `PHOTON_ALLOWED_EMAILS` only. The OAuth client is shared
with Denarius/Jumper/Stumped; its authorized redirect URIs must include
`https://photon.daviddenuyl.com/api/auth/callback` (and `http://localhost:5173/api/auth/callback`
for local dev). Add the Google Photos callback URLs too:
`https://photon.daviddenuyl.com/api/google-photos/callback` and
`http://localhost:5173/api/google-photos/callback`. Enable the Google Photos Picker API and add the
allowed account as an OAuth consent screen test user while the app is in testing. These settings
are edited by hand in Cloud Console (APIs & Services → Credentials / OAuth consent screen); gcloud
cannot change them. The connector requests only `photospicker.mediaitems.readonly`.

## Data in the bucket

`gs://arctic-sound-380822-photon/data/` mirrors the local `data/` folder, but only what the app shows
(`scripts/sync_data.py`): the Albelli analysis JSON, thumbnails and cover/month graphics, and per
year `plan.json`, `index.json`, `labels.json`, `tones.json`, `duplicates.json`, `thumbs/` and
`display/` (1600 px versions). Originals, raw exports and renders stay local. The app streams the
files through `/data/...` after login; the service worker caches photos.

Google Photos imports are stored separately under `data/<year>/imports/` in the private bucket.
`uv run python deploy.py setup` grants the runtime service account object read, create and delete access.
Imported metadata and encrypted OAuth refresh tokens are stored in Firestore. Local development
also reads and writes imports in the bucket so they appear consistently in the one environment.
