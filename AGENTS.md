# Photon

**Het Jaar Rond**: David's yearly family photo book (Albelli, Staand L 21×28, two parts a year).
Photon is the style guide distilled from the 2020–2024 books and the tool that lays out the next
book from a year's photos. Mobile-first PWA with desktop layouts: **Boek** (the proposed book:
cover + spreads, one page at a time on a phone; tap a photo to make it an event's big photo),
**Indeling** (events per month, themes, open questions answered in place, WhatsApp duplicates)
and **Stijlgids** (the analysis of earlier books). Backed by FastAPI + Firestore on Cloud Run,
data and photos in a private Cloud Storage bucket. Google login, allowlist only (personal photos).
Same setup as Stumped, **one environment**.

## Design docs — read the relevant one before making changes, keep them updated

- [docs/architecture.md](docs/architecture.md) — components, auth, data, the layout rules
- [docs/pipeline.md](docs/pipeline.md) — the local data pipeline (Albelli export → analysis → year plan)
- [docs/deployment.md](docs/deployment.md) — GCP resources, deploy and data sync, one-time setup

## Stack

- **Backend:** Python 3.13, FastAPI, pydantic v2, Firestore, Cloud Storage. Package manager: **uv** (never pip).
- **Frontend:** React 19 + Vite + TypeScript strict, Tailwind v4, TanStack Query, vite-plugin-pwa.
  Lives in `src/web`; the npm project is at the repo root.
- **Layout engine:** `src/web/src/lib/layout.ts` (pure: plan + photos + picks → pages, SVG strings).
- **Pipeline:** standalone Python scripts in `tools/` (run locally; Pillow in the `tools` group).
- **GCP project:** `arctic-sound-380822`, region `europe-west4`; service `photon`, Firestore database
  `photon`, bucket `arctic-sound-380822-photon`. gcloud runs under the `zgr` configuration
  (djdenuyl@gmail.com) via `PHOTON_GCLOUD_CONFIG`, never by switching the active configuration.

## Commands

```sh
uv sync                                  # install python deps
uv run python dev.py                     # backend dev server :8000 (serves data/ locally, PHOTON_LOCAL_DATA)
npm run dev                              # vite dev server (proxies /api and /data)
uv run ruff check --fix . && uv run ruff format .
uv run pyright && uv run pytest
npx tsc -b && npm run lint               # frontend typecheck, lint
uv run python scripts/sync_data.py       # upload data/ (json, thumbs, display photos) to the bucket
uv run python deploy.py                  # gcloud deploy (secrets via Secret Manager)
```

## Rules of the road

- Python imports in `src/photon`: **always `from x import y`, never `import x` / `import x as y`**.
- Config only through `photon.settings.Settings` (`PHOTON_*` env vars, local values in `.env` — gitignored).
- `data/` holds personal photos and exports: never commit it; it reaches the app only via the bucket.
- The layout engine stays pure; pages only wire it up. Style-guide rules live there with their numbers.
- pyright strict / TS strict must stay clean.
- When a design decision changes, update the matching doc in `/docs` in the same change.
