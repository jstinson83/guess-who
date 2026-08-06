# Guess Who

Kotlin/Ktor backend that takes an uploaded photo plus a set of selected
traits and uses the Gemini API to generate a stylized cartoon Guess Who
portrait. Right now this is a single-page, single-endpoint MVP — most of
the actual product (boards, a balanced feature pool, board-quality
analysis, playable game generation) isn't built yet. See
`docs/PRODUCT_SPEC.md` for the full vision and `.claude/context.md` for
what's actually built.

## Session continuity (`.claude/context.md` and `.claude/current.md`)

- `.claude/context.md` is the stable project overview: architecture, major
  features actually built, decisions already made.
- `.claude/current.md` holds two things: the maintainer's active **sprint
  plan** (a checklist of tasks they've laid out in conversation, not a
  "last thing done" log), and a **future roadmap** checklist that breaks
  `docs/PRODUCT_SPEC.md` down into shippable chunks.
- The active sprint plan is maintainer-authored — when they describe a
  plan, write it down as a checklist; don't add active-task items on your
  own initiative. The roadmap checklist is fair game to reshuffle,
  re-scope, or check items off as it's built out, since it's just a working
  breakdown of the spec, not a commitment the maintainer made in the moment.
- Don't rewrite `current.md` at the start of every task — it persists
  across tasks/sessions untouched by default. It only changes when:
  - The maintainer communicates a new or updated active-task plan — write
    it down (replacing what's there).
  - A task gets finished — check both the active task and the roadmap
    checklist for a matching item and check it off / remove it if present.
    If the finished task isn't listed, leave the file alone.
- If the maintainer asks you to "consult the plan" or "what's next on the
  roadmap," read `current.md`.
- Keep entries as a short checklist (one line per task), not a narrative
  status writeup — commit history and PR descriptions already capture the
  "what happened"; this file is just "what's still open."
- Update `context.md` (separately from the sprint plan) when a task
  changes architecture, adds a major feature, or makes a decision worth
  not relitigating later.
- Keep `context.md` high-level: architecture, decisions, and concrete
  config facts (model names, key/secret locations) other tasks need
  without re-deriving them. Operational gotchas — what breaks, how it bit
  us before, how to debug it — belong in this file (`CLAUDE.md`) instead.

## Product spec vs. roadmap

`docs/PRODUCT_SPEC.md` is the maintainer's full v1 product spec — workflow,
feature pool, balancing rules, board analysis, game generation. It's the
source of truth for *what to build*. `.claude/current.md`'s "Future
roadmap" checklist is a working breakdown of that spec into concrete,
buildable steps, in roughly the order the spec's own workflow implies
(board creation → first portrait → balanced additions → analysis →
balancing math → game generation). When the two disagree, the spec wins —
fix the checklist, don't quietly reinterpret the spec.

## Workflow conventions

- After pushing commits to a feature branch, always open a PR against
  `main` (the maintainer merges from the PR link) — do this automatically
  once a change is pushed, without waiting to be asked.
- Feature branches get reused across tasks. If a branch's previous PR has
  already merged, rebuild it from `origin/main` before adding new commits
  (`git checkout -B <branch> origin/main`) rather than stacking on
  stale/merged history.
- Commits are authored as `Claude <noreply@anthropic.com>` and SSH-signed
  (`git config commit.gpgsign` is `true` in this environment). If a push is
  rejected as unsigned, `git commit --amend --no-edit --reset-author` fixes
  the tip commit.

## Current architecture (see `.claude/context.md` for details)

One Ktor service, no database, no auth, no frontend build step. A single
`POST /api/transform` endpoint takes a cropped photo + a freeform list of
trait strings and forwards them to Gemini's image-editing model in one
shot — there's no concept of a board, a person, or feature balancing yet.
An earlier version of this repo had a fuller MVP (React frontend + SQLite
persistence, per `backend/data/` still being gitignored) that was
deliberately trimmed back down to this minimal single-endpoint version;
the roadmap in `.claude/current.md` is what rebuilds toward the full spec
from here, not a resurrection of that old code.

## Operational gotchas

- **Gemini model name**: currently `gemini-2.5-flash-image`, hardcoded as
  `GEMINI_MODEL` in `Application.kt` (one call site today — if the board/
  feature-pool work in the roadmap adds more Gemini calls, keep the model
  name in one shared place rather than letting it drift per call site).
  Gemini model names churn on Google's release schedule outside our
  control; if `/api/transform` starts returning 404 for the model, check
  https://ai.google.dev/gemini-api/docs/models for the current name.
- **Deploy pipeline**: fully documented in `README.md` (Cloud Build →
  Artifact Registry → Cloud Run, one-time GCP setup steps). This repo
  shares the `foodie-503510` GCP project and its
  `cloud-run-source-deploy` Artifact Registry repo with the `foodie` repo —
  they're two separate Cloud Run services (`guess-who` vs. `foodie`) in the
  same project, not the same deploy. `GEMINI_API_KEY` is a Secret Manager
  secret read at deploy time, not baked into the image.
- **Frontend has no build step**: `backend/src/main/resources/static/` is
  served directly (`index.html`, `styles.css`, vendored `Cropper.js` — no
  CDN dependency). Any new frontend work should keep this pattern unless
  the roadmap work (e.g. a real board-management UI) makes a lightweight
  build step clearly worth it — don't introduce a framework/bundler for a
  small change.
