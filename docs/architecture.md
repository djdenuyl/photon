# Architecture

```
┌──────────────┐  HTTPS/JSON  ┌──────────────────┐     ┌───────────────────────────┐
│  React PWA   │ ───────────► │ FastAPI          │ ──► │ Firestore (db `photon`)   │
│ mobile + desk│ ◄── /data ── │ (Cloud Run)      │ ──► │ Cloud Storage (data/)     │
└──────────────┘              └──────────────────┘     └───────────────────────────┘
                                        ▲ data/ uploaded by scripts/sync_data.py
                                          (made by the local pipeline in tools/)
```

- One origin only: requests to the run.app URL are redirected (308) to the custom domain, because the
  session cookie and the installed PWA are both per origin.
- One process serves the API (`/api/*`), the data (`/data/*`) and the built bundle (`main.py`),
  including the static style guide under `/stijlgids/` (the original page, shown in an iframe).
- Locally: `vite` (proxying `/api` and `/data`) + `uv run python dev.py`; with `PHOTON_LOCAL_DATA=data`
  the backend serves the local `data/` folder instead of the bucket.

## Auth

Google OAuth (authorization-code flow in the backend, signed session cookie, 90 days, `Secure` when
the base URL is https). Only accounts in `PHOTON_ALLOWED_EMAILS` get a session, re-checked per
request. Everything except `/api/health` and the login routes needs a session, `/data` included.

## State (Firestore)

- `state/{year}-answers` — answers to the open questions (`{data: {questionId: text}}`).
- `state/{year}-picks` — the big photo chosen per event (`{data: {eventId: photoId}}`).

Both are small maps replaced as a whole (`PUT /api/state/{year}/{kind}`); the client updates its
cache first, so the book re-lays out at once.

## The book (`lib/layout.ts`)

Pure function from the plan, the photos (with labels and colour tones) and the picks to two books
(deel 1 = January–June, deel 2 = July–December) of pages; rendering produces SVG strings.

- Page 210 × 280 mm, 4.5 mm bleed, 10 mm outer margin, 5 mm between photos, 10 mm from the spine.
- Pages per event from the plan's suggested spreads, bounded by 3–8 photos per page.
- An event of two pages or more starts on a left page (a one-page event of the same month moves
  forward, or the event shrinks to one page, or the previous event gets a page more).
- Exceptions follow the rates measured in 2022–2024 and never sit next to each other: scenic photo
  as background (page or spread), half spread in a colour from the photos' tone, overlap collage,
  page without margin, panorama across the spine.
- Big photo per event: your pick, else the first hero candidate for outings, trips and family
  moments; portrait = full page, landscape = top half.
- Month openers are a cell in the photo grid (League Spartan, filled with a photo of that month),
  alternating top / middle / bottom.
- Photos are cropped around the labelled face.
- Cover: front with the 2022 Inkscape metrics (HAPPY DONUTS letters, each a photo: ~60% us with
  friends/family, ~40% just us; no family member twice next to or above each other), back with
  four close-ups of two family members each, every duo different, under a 20% pastel tint.

The phone shows one page at a time (swipe or ← →), desktop one spread; the big view uses the
1600 px display photos, the filmstrip the thumbnails.
