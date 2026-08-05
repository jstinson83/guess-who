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

- **Backend**: Kotlin + Ktor, single service (`backend/`), one route file
  (`Application.kt`).
- **AI**: Gemini's image-editing model, called once per portrait request —
  the photo plus a freeform list of trait strings goes in, one stylized
  cartoon image comes back. No multi-turn conversation, no comparison
  against other portraits.
- **Storage**: none. Nothing is persisted server-side; each request is
  independent and stateless. (An earlier version of this repo had SQLite
  persistence — see Decisions below — that's gone today, not just unused.)
- **Frontend**: one static HTML page (`backend/src/main/resources/static/index.html`)
  with vendored `Cropper.js` for the crop UI, served directly by Ktor's
  `staticResources` — no framework, no build step, no CDN dependency.
- **Deploy**: Cloud Build (`cloudbuild.yaml`) → Artifact Registry → Cloud
  Run, triggered on push to `main`. Full one-time setup steps are in
  `README.md`, not duplicated here.

## Configuration reference

**Gemini**
- Current model: `gemini-2.5-flash-image` (`GEMINI_MODEL` in
  `Application.kt`), called from the single `POST /api/transform` route.
- `GEMINI_API_KEY` is read from an environment variable at request time
  (`System.getenv("GEMINI_API_KEY")`); on Cloud Run it's sourced from
  Secret Manager (see `cloudbuild.yaml`'s `--set-secrets`), not baked into
  the image.

**Deploy**
- GCP project `foodie-503510`, Cloud Run service `guess-who`, region
  `northamerica-northeast1`. Same GCP project as the unrelated `foodie`
  repo (shared Artifact Registry repo `cloud-run-source-deploy`, separate
  Cloud Run services) — see `CLAUDE.md` for why that's not a problem.

## Major features (as of last update)

- Single-page upload flow: pick a photo, crop it client-side with
  Cropper.js, check boxes for a freeform set of traits (glasses,
  mustache, hat, ...), submit.
- `POST /api/transform` (`Application.kt`): accepts the cropped photo
  (multipart file part) plus a JSON-encoded list of trait strings (form
  field `traits`), builds a single prompt instructing Gemini to redraw the
  photo as a "bold, flat-color cartoon illustration" with those traits
  applied while keeping the person recognizable and the framing/background
  unchanged, and returns the resulting image as a base64 data URL.
- No board, no multi-person comparison, no feature balancing, no
  persistence, no game generation — all of that is roadmap work, not yet
  started. See `current.md`.

## Decisions / things already considered

- The repo previously had a fuller MVP — a Ktor backend plus a React
  frontend with SQLite persistence (`backend/data/` is still gitignored
  from that era) — which was deliberately trimmed down to today's minimal
  single-page, single-endpoint version ("Trim to a single-page
  Gemini-based portrait generator"). The roadmap in `current.md` rebuilds
  toward the full spec from this minimal base; it is not a plan to restore
  the old React/SQLite code, since the intervening trim was a deliberate
  simplification, not an accident.
- The trait list on the current upload form is freeform/unconstrained —
  there's no feature pool, no balancing, and nothing stopping the same
  trait from being picked for every portrait. This matches the spec's
  "step 2" (first photo, all features unlocked) but doesn't yet implement
  "step 3" (constraining choices against the rest of the board), since
  there's no board for a choice to be constrained against yet.

## Maintenance

Update this file when: infra/architecture changes, a new major feature
lands, or a past decision needs to be recorded so it doesn't get
relitigated. Keep it high-level — implementation gotchas belong in
`CLAUDE.md`, not here. Keep the "Major features" list honest about what's
actually built vs. what's spec'd but not started — the latter belongs in
`current.md`'s roadmap, not here.
