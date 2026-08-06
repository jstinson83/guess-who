# Guess Who — Project Context

Stable overview of the project. Update this when architecture, infra, or
major conventions change — not for day-to-day task status (see
`current.md` for that, and `../docs/PRODUCT_SPEC.md` for the full product
vision this project is building toward).

## What this is

A web app for building a personalized Guess Who board from photos of a
real group (family, friends, office, classroom, sports team, ...), where
an AI turns each uploaded photo into a stylized, recognizable cartoon
portrait with a controlled set of Guess Who-style features (glasses, hat,
beard, earrings, ...). The full spec (`../docs/PRODUCT_SPEC.md`) describes
boards, feature-pool balancing as people are added, board-quality
analysis, and generating a playable mobile game from a finished board.

**Current state is much smaller than the spec.** Today this is a
single-page MVP: upload one photo, pick from a freeform list of trait
checkboxes, get back one Gemini-generated cartoon portrait. There is no
board concept, no persistence, no balancing, and no game generation yet —
see "Major features" below for exactly what exists, and
`current.md`'s "Future roadmap" for what closes the gap to the spec.

Solo project — see `CLAUDE.md` at the repo root for operational gotchas
(Gemini model naming, deploy pipeline, git/PR workflow conventions). This
file is the higher-level "what and why"; `CLAUDE.md` is the "how,
precisely, and what bit us before."

## Architecture at a glance

- **Backend**: Kotlin + Ktor, single service (`backend/`). Routes are split
  by concern: `Application.kt` (server setup + `/api/transform`) and
  `board/BoardRoutes.kt` (`/api/boards/...`).
- **AI**: two Gemini call sites. `generatePortrait()` (`Gemini.kt`) — a photo
  plus a list of trait phrases to add and a list to explicitly leave out
  goes in, one stylized cartoon image comes back (framed head-and-shoulders,
  background replaced with a plain color). Used by both the standalone
  `/api/transform` endpoint and the board add-character flow, so the prompt
  lives in exactly one place. `detectTraits()` (`board/TraitDetection.kt`,
  board-only) — a photo plus the board's currently-available feature list
  goes in, a JSON list of which of those features are visually present
  comes back, used to pre-check the add-character feature boxes before the
  user confirms/edits and generates. Both are single-shot: no multi-turn
  conversation, no comparison against other portraits.
- **Storage**: Firestore (Native mode), via `com.google.cloud:google-cloud-firestore`
  and application-default credentials — no ORM, plain client calls behind a
  `BoardRepository` interface (`board/BoardRepository.kt`,
  `FirestoreBoardRepository.kt`). One `boards` collection; each board's
  characters live in a `characters` subcollection underneath it. Portrait
  image bytes live in Cloud Storage instead of inline on the Firestore
  document, behind a `PortraitStore` interface (`storage/PortraitStore.kt`,
  `GcsPortraitStore` impl) — the character document just records
  `hasPortrait: Boolean`, and the server streams the image back through
  `GET /api/boards/{id}/characters/{characterId}/portrait`. See `CLAUDE.md`
  for the schema, the ADC/IAM setup this requires, and the Firestore/GCS
  gotchas (`ApiFuture` vs. Guava's `ListenableFuture`, the bucket/IAM setup
  and object-naming scheme for portraits).
- **Frontend**: one static HTML page (`backend/src/main/resources/static/index.html`)
  plus `app.js` (view logic) and vendored `Cropper.js` for the crop UI,
  served directly by Ktor's `staticResources` — no framework, no build
  step, no CDN dependency. Two views toggled by a `#/board/<id>` hash
  route: a board list/create view, and a board detail view (character
  grid + add-a-character flow). This replaced the old single-page
  freeform-trait upload UI described in "Decisions" below.
- **Deploy**: Cloud Build (`cloudbuild.yaml`) → Artifact Registry → Cloud
  Run, triggered on push to `main`. Full one-time setup steps are in
  `README.md`, not duplicated here.

## Configuration reference

**Gemini**
- Current model: `gemini-2.5-flash-image` (`GEMINI_MODEL` in `Gemini.kt`),
  called via the shared `generatePortrait()` helper from both
  `POST /api/transform` and `POST /api/boards/{id}/characters`.
- `GEMINI_API_KEY` is read from an environment variable at request time
  (`System.getenv("GEMINI_API_KEY")`); on Cloud Run it's sourced from
  Secret Manager (see `cloudbuild.yaml`'s `--set-secrets`), not baked into
  the image.

**Firestore**
- Named database `guess-who` (`FIRESTORE_DATABASE_ID` in `Application.kt`),
  *not* `(default)` — `(default)` is already used by the unrelated `foodie`
  app in the same GCP project. Must exist before the app can use it
  (`gcloud firestore databases create --database=guess-who`, see
  `README.md`) — Firestore doesn't auto-create named databases.
- Location `northamerica-northeast1`, chosen to match the Cloud Run region
  below; fixed at creation time, can't be changed later.

**Deploy**
- GCP project `foodie-503510`, Cloud Run service `guess-who`, region
  `northamerica-northeast1`. Same GCP project as the unrelated `foodie`
  repo (shared Artifact Registry repo `cloud-run-source-deploy`, separate
  Cloud Run services) — see `CLAUDE.md` for why that's not a problem.
  The Cloud Run runtime service account needs the `roles/datastore.user`
  IAM role for Firestore access — see `README.md`'s one-time setup
  section.

## Major features (as of last update)

- **Board persistence** (Firestore): create a board (name, target size),
  add characters to it one photo at a time, and reload it later by URL
  (`#/board/<id>`) — in-progress or complete. `BoardRepository`
  (`board/BoardRepository.kt`) is the storage interface;
  `FirestoreBoardRepository` is the only implementation so far. Route
  handlers in `board/BoardRoutes.kt`:
  `POST /api/boards`, `GET /api/boards`, `GET /api/boards/{id}`,
  `POST /api/boards/{id}/characters`, `POST /api/boards/{id}/complete`.
- **Structured feature pool, actually wired up**: the add-character UI
  renders `DefaultFeaturePool`'s real feature list (not freeform text),
  with `BoardBalancer.availableFeatures` disabling features that have hit
  their target for the board and showing why — this is the spec's step-3
  "Available / Unavailable" example, now live. `BoardBalancer`/
  `DefaultFeaturePool` themselves predate this change (were already built
  and tested) but had no caller until this session.
- Board list + create-board UI, board detail UI (character grid,
  add-a-character flow reusing the Cropper.js crop step) —
  `static/index.html` + `static/app.js`. This replaced the old single-page
  freeform-trait upload UI as the app's front door.
- Add-character flow auto-detects visible traits right after cropping
  (`POST /api/boards/{id}/characters/detect-traits`, calls `detectTraits()`)
  and pre-checks the matching feature boxes — still editable before the
  user hits generate. Unchecking a detected trait tells `generatePortrait()`
  to explicitly leave it out (`removeTraits` field), rather than only ever
  layering requested traits on top of whatever the photo already shows.
  A loading spinner/greyed-out panel covers both the detection call and
  the final generate call.
- `POST /api/transform` (`Application.kt`): unchanged standalone endpoint —
  accepts a cropped photo plus a JSON-encoded list of trait strings and
  returns one Gemini-generated cartoon portrait, no board involved. Kept
  for quick manual testing; the frontend no longer calls it (board
  add-character goes through `/api/boards/{id}/characters` instead, which
  calls the same shared `generatePortrait()` helper).
- No board-quality analysis, no game generation yet — see `current.md`.

## Decisions / things already considered

- The repo previously had a fuller MVP — a Ktor backend plus a React
  frontend with SQLite persistence (`backend/data/` is still gitignored
  from that era) — which was deliberately trimmed down to a minimal
  single-page, single-endpoint version ("Trim to a single-page
  Gemini-based portrait generator"), then rebuilt back up with boards in
  this session. This is not a restoration of the old React/SQLite code —
  new frontend (vanilla JS, no framework) and new storage (Firestore, not
  SQLite).
- **Firestore over SQLite/Postgres**: chosen because Cloud Run's local
  disk isn't durable across redeploys/instance churn (ruling out a plain
  SQLite file, which is how the old MVP persisted), and Cloud SQL/Postgres
  was more infra than this session needed — Firestore was already enabled
  on the GCP project and required no additional setup beyond IAM. See
  `CLAUDE.md` for the schema and gotchas.
- **Portrait images moved to Cloud Storage**, out of inline base64 data
  URLs on the Firestore character document. The inline approach hit
  Firestore's 1 MiB per-document cap in practice, not just in theory — see
  the `CLAUDE.md` gotcha for the bucket/IAM setup and object-naming scheme
  that replaced it.
- The old single-page upload form's freeform trait checkboxes are gone —
  the add-character flow now uses the real feature pool. `/api/transform`
  itself is untouched and still accepts freeform trait strings, since
  nothing about that endpoint's contract needed to change.
- **Board category was dropped, deliberately** — the maintainer decided we
  don't need it. `docs/PRODUCT_SPEC.md`'s "Create Board" step lists a
  category picker (Family/Friends/Office/Classroom/Sports team/Custom),
  and boards briefly had a `category` field, but it was purely cosmetic —
  nothing in the feature pool, balancing math, or board analysis ever
  keyed off it, so it was removed rather than kept as dead decoration.
  Don't reintroduce a bare category field expecting it to matter; if
  category-driven behavior is wanted later (e.g. a different feature pool
  per category), that's new design work, not a restoration.

## Maintenance

Update this file when: infra/architecture changes, a new major feature
lands, or a past decision needs to be recorded so it doesn't get
relitigated. Keep it high-level — implementation gotchas belong in
`CLAUDE.md`, not here. Keep the "Major features" list honest about what's
actually built vs. what's spec'd but not started — the latter belongs in
`current.md`'s roadmap, not here.
