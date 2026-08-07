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

One Ktor service, Firestore for persistence, no auth, no frontend build
step. Boards (name, target size, characters with traits/portrait) persist
to Firestore and are driven by `BoardBalancer`/`DefaultFeaturePool`
for feature availability, via `/api/boards/...` routes and the board
list/detail UI. The original standalone `POST /api/transform` endpoint
(freeform trait strings, no board, no persistence) still exists unchanged
alongside it. An earlier version of this repo had a fuller MVP (React
frontend + SQLite persistence, per `backend/data/` still being gitignored)
that was deliberately trimmed back down to a minimal single-endpoint
version and then rebuilt with boards + Firestore in a later session — see
`.claude/current.md` for what's still open toward the full spec.

## Operational gotchas

- **Gemini model names**: two call sites now, two different models, each a
  single constant next to its call site rather than scattered inline
  strings. Image generation (`generatePortrait` in `Gemini.kt`) uses
  `GEMINI_MODEL` = `gemini-2.5-flash-image`. Trait detection (`detectTraits`
  in `board/TraitDetection.kt`, image-in/JSON-out, used to pre-check
  add-character feature boxes from the photo) uses the private
  `GEMINI_TRAIT_MODEL` = `gemini-3.5-flash` in that same file — a
  text-out-capable model, since the image-gen model can't also return
  structured data about what it saw. Gemini model names churn on Google's
  release schedule outside our control; if either endpoint starts
  returning 404 for its model, check
  https://ai.google.dev/gemini-api/docs/models for the current name.
- **Deploy pipeline**: fully documented in `README.md` (Cloud Build →
  Artifact Registry → Cloud Run, one-time GCP setup steps). This repo
  shares the `foodie-503510` GCP project and its
  `cloud-run-source-deploy` Artifact Registry repo with the `foodie` repo —
  they're two separate Cloud Run services (`guess-who` vs. `foodie`) in the
  same project, not the same deploy. `GEMINI_API_KEY` is a Secret Manager
  secret read at deploy time, not baked into the image.
- **Frontend has no build step**: `backend/src/main/resources/static/` is
  served directly (`index.html`, `app.js`, `styles.css`, vendored
  `Cropper.js` — no CDN dependency). Any new frontend work should keep
  this pattern unless the roadmap work makes a lightweight build step
  clearly worth it — don't introduce a framework/bundler for a small
  change.
- **Firestore persistence**: boards live in a `boards` collection; each
  board's characters live in a `characters` subcollection underneath it
  (not a top-level collection), since every read pattern is scoped to one
  board. `characterCount` is denormalized onto the board document so the
  board list doesn't do an N+1 read of every board's characters — kept in
  step by `FirestoreBoardRepository.addCharacter`, so if you add another
  write path for characters, update it there too.
  - **Named database, not `(default)`**: `foodie-503510` already has a
    `(default)` Firestore database in use by the unrelated `foodie` app, so
    boards use a separate named database (`FIRESTORE_DATABASE_ID = "guess-who"`
    in `Application.kt`, passed via `FirestoreOptions.newBuilder().setDatabaseId(...)`
    — plain `getDefaultInstance()` would silently point at `foodie`'s
    database instead). Firestore does **not** auto-create named databases;
    it must exist before the app can use it — see `README.md`'s one-time
    `gcloud firestore databases create --database=guess-who` step. If you
    ever rename it, that constant and the `gcloud` command both need to
    change together.
  - **Credentials**: the client uses application-default credentials —
    automatic on Cloud Run (the runtime service account), but locally you
    need `gcloud auth application-default login` first, or board routes
    fail. It's built lazily (`Lazy<BoardRepository>` in `Application.kt`)
    so a plain `/api/transform`-only local run still works without any GCP
    setup at all.
  - **IAM**: the Cloud Run runtime service account needs
    `roles/datastore.user` on the project (one-time `gcloud` grant, same
    pattern as the `GEMINI_API_KEY` Secret Manager grant in `README.md`).
    That role is project-wide and covers every database in the project, so
    it doesn't need a separate grant per database.
  - **`ApiFuture` vs. Guava's `ListenableFuture`**: Firestore's Java client
    returns `com.google.api.core.ApiFuture`, which `kotlinx-coroutines-guava`'s
    `.await()` does *not* accept (it's not a `ListenableFuture`, despite
    looking like one). Don't add that dependency expecting it to bridge
    Firestore calls — use the local `ApiFuture<T>.await()` extension in
    `board/ApiFutureAwait.kt` instead.
  - **Portrait images live in Cloud Storage, not inline**: base64 data URLs
    on the character document routinely blew past Firestore's 1 MiB
    per-document cap, so the character document only stores
    `hasPortrait: Boolean` — the actual bytes go through `PortraitStore`
    (`storage/PortraitStore.kt`, `GcsPortraitStore` impl) into a bucket, at
    a deterministic object name (`boards/{boardId}/characters/{characterId}`,
    computed by `FirestoreBoardRepository.portraitObjectName` — not stored
    anywhere, so there's no separate field to keep in sync). Don't reuse
    that inline-data-URL pattern for any future large blob (e.g. game
    assets) — same cap applies.
    - **Bucket**: `PORTRAIT_BUCKET` in `Application.kt`
      (`foodie-503510-guess-who-portraits` — prefixed with the project id
      since GCS bucket names are globally unique across all of GCP, not
      just this project). Must exist before the app can use it, same as
      the named Firestore database — see `README.md`'s one-time
      `gcloud storage buckets create` step. Uniform bucket-level access,
      no public read: the server is the only reader, via
      `GET /api/boards/{id}/characters/{characterId}/portrait`
      (`BoardRoutes.kt`), which fetches through `BoardRepository` and
      streams the bytes back — the client never talks to GCS directly.
    - **IAM**: the Cloud Run runtime service account needs
      `roles/storage.objectAdmin` scoped to that one bucket (not
      project-wide `roles/storage.admin` — that would also reach the
      unrelated `foodie` app's buckets in the same project). One-time
      `gcloud storage buckets add-iam-policy-binding` grant, see
      `README.md`.
    - **Credentials**: same application-default credentials as Firestore
      (`gcloud auth application-default login` locally); `PortraitStore`
      is built lazily alongside `BoardRepository` in `Application.kt` for
      the same reason — a plain `/api/transform`-only local run shouldn't
      need any GCP setup.
