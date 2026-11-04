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

The agent signs in with `/api/auth/agent?t=…`: a token signed (itsdangerous, salt
`photon-agent-login`) with the session secret, so only someone who can read that secret in Secret
Manager can make one (scripts/shot.py). The token is valid 2 minutes, for the first allowed account
only; the session it gives carries an `exp` and ends after 2 hours. Redirects only go to paths on
the site.

## State (Firestore)

- `state/{year}-answers` — answers to the open questions (`{data: {questionId: text}}`).
- `state/{year}-picks` — the big photo chosen per event (`{data: {eventId: photoId}}`).
- `state/{year}-edits` — editor changes per page (`{data: {"eventId:k": json}}`, see below).
- `state/{year}-notes` — notes on pages and elements (`{data: {noteId: json}}`, see Notes).
- `years/{year}` — years started with "+ Nieuw jaar" (`GET/POST /api/years`).

The state maps are small maps, replaced as a whole or changed per key with PATCH (the editor
does this), (`PUT /api/state/{year}/{kind}`); the client updates its
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

## Editor (`lib/edits.ts`, `components/Editor.tsx`)

The book opens in the editor ("Bewerken"; "Bekijken" hides the controls). Edits sit on top of the
generated layout, so a re-layout keeps them. They are keyed by page (`eventId:k`, k = the page
within its event; the cover `omslagN-back:0` / `omslagN-front:0`) and slot: the photo the layout
put there, `letter0…14` / `shard0…3` / `background` / `label` on the cover, `month`, `cap0…` for
captions, `add…` for text added in the editor. An edit can set `photo, x, y, w, h, zoom, focus,
rot, z, border, text, size, color, hidden`. `applyEdits` applies them after `buildBooks` and
orders each page by `z` (default: layout order). A swap with a photo already in the book trades
places (grid photos only; cover parts, backgrounds and month titles just take the new photo).

- The cover is two ordinary pages (`coverPages` in layout.ts): letters and shards are photos with
  a `shape` (glyph or polygon clip), the background a `bg` photo, "DEEL 1" a caption. The letters
  follow the 2022 metrics, ink from about 7.5 to 271 mm. The HAPPY DONUTS font is served from the
  bucket (`data/fonts/`), not from the repo.
- Select: click (shift adds), drag a band, double-click a page's background; a click outside clears.
  Drag moves (backgrounds stay put), corner handles resize (captions scale their text), the
  see-through centre handle moves the photo inside its frame.
- The selection toolbar floats next to it, icons only with a label on hover. It offers what fits
  the selection: text field and size/colour (captions, month titles), swap, zoom, rotate, big photo,
  full page (to the bleed, toggles back), border (none / white / black), front/back, reset, hide.
- A frame without a photo (an empty cell, a letter without one) is drawn as a light area with a
  photo icon; a click on it opens the picker.
- While the picker is open, the spread's other photos are highlighted: a click on one trades the
  two photos. The picker marks photos already in the book, with "2×", "3×" when they're in it
  more than once.
- Save status below the book: bouncing dots while saving, a green check when saved, a red "!"
  when it failed (it retries); a fixed size so the bar doesn't jump.
- The swap picker: search, scope (event / month / this book / year; cover parts, backgrounds and
  month titles start at "Dit boek", grid photos at their event), people, close-up, sfeerbeeld,
  "nog niet in het boek" (not on any page or cover). Photo numbers show on every thumbnail and in
  the selection toolbar.
- Below the book: undo/redo, snapping, add text, reset these pages, save status.
- Snapping (toggle, remembered per browser; Alt = off while held): 2 mm to page edges, margins and
  centre lines, and to other elements' edges, centres and edge + 5 mm gap; pink guides show the match.
- Keys: arrows nudge 1 mm (shift 5), Delete hides, Esc deselects, ctrl+Z / ctrl+Y.
- Saving (`lib/saver.ts`): every change and undo is stored; writes are batched (500 ms), sent one
  at a time, retried on failure and flushed with keepalive when the page closes. Only the pages
  that differ from the last known server copy are sent (PATCH), and the server's merged map comes
  back into the cache, so two tabs only overwrite each other on the same page.
- Text frames: a caption is a box (x/y/w/h); its text wraps within the width and is cut off at
  the bottom (rendered as a foreignObject). Corner handles resize the frame, not the text; A−/A+
  change the size. The editor measures every frame on the rendered page and marks one whose text
  doesn't fit with a red dashed outline and "!" (as Albelli does). Caption edits from before text
  frames (no `box`) are converted on load and on their first change.
- "Bekijken" shows the book as large as the window allows (no filmstrip) with a full-screen
  button: the Fullscreen API, or the whole window where there is none (iPhone Safari).
- Text colour: swatches, the page's photo tones, any colour, or "auto": `lib/contrast.ts` traces
  7 × 4 points under the frame to the topmost element (photo pixels from the thumbnails, colour
  areas, the page) and picks white or near-black, whichever contrasts more; it follows the text.
- Colour areas are drawn into the bleed where their points are on the page edge (`intoBleed`): a
  point where a slanted side meets the edge slides along that side's line, so the side stays where
  it was drawn. Removing the page colour makes it transparent (the page stays selectable). Points:
  a click on a side's "+" adds one, a picked point gets a red × (or Delete) to remove it.
- Colour areas: every page's colour is a `fill` element (slot `pagefill`, z −1, the full page
  incl. bleed); more can be added (`add: "fill"`). A selected area shows its points (drag; click +
  Delete removes one, down to a triangle) and the middles of its sides (drag moves the side along
  its normal; double-click adds a point). Edits store the points (`pts`).
- The page itself: a click on an empty spot, or the page button in the bar below the book, selects
  it and opens the page menu (`PagePanel`; in a spread it switches between the left and right
  page): colour, shape, "+ Kleurvlak", background photo (`add: "photo"`), notes, layouts. The
  page colour's points stay on the page; points on its edge are drawn on into the bleed.
- One side panel (`Panel`) for the photo picker, the page menu and the notes, one at a time:
  a card on the right on desktop, a sheet above the bottom bar on a phone; it doesn't block the
  book. On a phone the selection's toolbar replaces the bottom bar (one scrolling row, ✕ to
  deselect, its menus as a sheet); on desktop it floats next to the selection.
- The selection's handles are drawn in their own layer above every element, so a photo drawn
  later can't catch a click meant for a handle.
- Layouts as a mesh (`lib/mesh.ts`, edit slot `mesh` = `{mesh, cells}`): points shared by photo
  cells; each cell is drawn inset by half the gap, so gaps stay even when points move. Templates:
  Raster (rows within the margins), Schuin (rows with shaken points, full bleed, like 2022 p. 32–33)
  and Honingraat (at least 14 hexagons, full bleed, like 2022 p. 3; cells beyond the page's photos
  stay empty). A mesh replaces the page's plain photos; month titles, captions and
  backgrounds stay. Cells (`cell0…`) can be swapped, zoomed and panned (drag inside), not moved;
  "Punten verschuiven" shows the mesh points to drag. Gap and bleed are settings of the mesh.
- Cover letters: a letter's box is the ink of its glyph (HAPPY DONUTS metrics measured with canvas
  measureText, in `GLYPHS`), so its photo can be panned right up to the letter's edges.
- Background photos get a white veil (`veil`, default `BG_VEIL` 0.25, a slider in their toolbar),
  as Albelli does, so they sit behind the photos on top. An added one sits at z −0.5: above the
  page colour, below everything else.
- Colour suggestions (`lib/palette.ts`): the colours that stand out in the page's photos (pixels
  grouped by hue and lightness, scored by share and saturation), not their average tone.
- Frames and text frames resize from their sides too (only the dragged sides snap).
- Smart layout (`lib/smart.ts`): the blue buttons above the arrows put the page's photos (and its
  month title) in another arrangement — every split into justified rows, justified columns, one
  large photo beside a column — ranked by how little the photos are cropped, with a heavy penalty
  when a photo's orientation would flip. Spread: one button per page; single page: previous/next.
- Not editable yet: rotating month titles and captions, moving elements between pages.

## Notes (`lib/notes.ts`, `components/NotesDrawer.tsx`, `scripts/notes.py`)

A note is on a page (`page` = page key) or one element of it (`slot`), for yourself or for the
agent (`to`), open or done, with the agent's `reply`. Added from the selection toolbar (the note
icon near the end), the page menu, or the notes drawer (the note button with its count in the bar
below the book); elements and pages with open notes show a yellow marker. Each note is saved on
its own (PATCH). The agent works through them with `scripts/notes.py` (see AGENTS.md); its writes
go to single keys, and the editor picks them up on its next save or refetch (state is stale after
10 s and refetched on focus).

## Years (`/boek/:year`)

This year is laid out by Photon and editable; 2020–2024 are the Albelli exports drawn read-only by
`lib/albelli.ts` (halves of a spread on a phone); a year created with "+" shows the pipeline steps.
Theme: light/dark via `data-theme` on `<html>` and CSS variables (`index.css`), stored in localStorage.
