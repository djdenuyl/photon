# Data pipeline (local)

Everything under `data/` is made by the scripts in `tools/` (run with `uv run python tools/…`) and
stays local; `scripts/sync_data.py` uploads what the app shows, and the originals the export prints from.

## The style guide (earlier books, `data/albelli/`)

1. Export the projects from Albelli to `data/albelli/raw/<slug>.xml` + `<slug>.meta.json` (the
   `savedprojects` API behind the Albelli editor) and the photo metadata to
   `data/albelli/uploads.json` (`storage.organise.photos/api/v1/getuploads`, POST with the photo ids).
2. `parse_albelli.py` → `books.json` (normalised layout, in inches). Which projects count as yearbooks:
   `YEARBOOKS` in that script.
3. `analyse_albelli.py` → `stats.json` (layout features per page and spread).
4. `fetch_thumbs.py 300` → `thumbs/300/` (signed URLs expire after about a week).
5. `enrich_photos.py` → `photos.json` (thumbnail, capture date from the file name, role).
6. `render_spreads.py` → `renders/<slug>/NN.jpg` (spreads with the real photos).
7. `context_pack.py` → `context/<slug>.json`; content analysis per book (by Claude, from renders +
   context) → `context/<slug>.analysis.json`; `aggregate_context.py` → `context.json`.
8. `graphics_web.py` → covers and month titles (`graphics/`, `graphics-web/`, `graphics.json`).

The covers' Inkscape sources: `E:\personal\Photos\Het Jaar Rond - 2020\kaft\` and
`E:\personal\Projects\hetjaarrond2022\kaft\` (the template for new covers).

## A new year (`data/<year>/`)

1. Download the Google Photos album (and the WhatsApp photos) into `data/<year>/originals/`.
2. `ingest_photos.py <year>` → `photos.json` + `thumbs/` (EXIF date, else the file name).
3. `dedupe_photos.py <year>` → `duplicates.json` (WhatsApp copies of album photos).
4. `contact_sheets.py <year>` → `index.json` (photo ids p001…) + `sheets/`; events per quarter
   (by Claude) → `events/<year>-Qn.json`.
5. `excluded.json` (photos left out, with a reason) and `corrections.json` (answers to the open
   questions applied: new events, moves, merges, field updates) are edited by hand.
6. `merge_events.py <year>` → `plan.json`.
7. `label_sheets.py <year>` + labelling (by Claude) → `labels/*.json`; `merge_labels.py` → `labels.json`.
8. `photo_tones.py <year>` → `tones.json`; `display_images.py <year>` → `display/` (1600 px).
