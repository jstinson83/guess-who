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
  by concern: `Application.kt` (server setup + `/api/transform`),
  `board/BoardRoutes.kt` (`/api/boards/...`), and
  `photobank/PhotoBankRoutes.kt` (`/api/photobank/...`, the board-agnostic
  Photo Library — see "Major features" below).
- **AI**: two Gemini call sites. `generatePortrait()` (`Gemini.kt`) — a photo
  plus a list of trait phrases to add and a list to explicitly leave out
  goes in, one stylized cartoon image comes back (framed head-and-shoulders,
  background replaced with a plain color). Used by both the standalone
  `/api/transform` endpoint and the board add-character flow, so the prompt
  lives in exactly one place. Every call also sends a fixed style-reference
  image as a second `inlineData` part (a hand-picked portrait at
  `STYLE_TEMPLATE_OBJECT_NAME` = `template/portrait.jpeg` in the portraits
  bucket, fetched via the same `PortraitStore` used for character
  portraits) so Gemini matches its exact line weight/shading/color instead
  of reinterpreting "cartoon style" fresh each generation — this is what
  keeps portraits across a board looking like one consistent art style.
  Fetch failures (template missing, no GCS access) are swallowed and
  generation proceeds without a reference rather than failing the request.
  `detectTraits()` (`board/TraitDetection.kt`,
  board-only, takes a candidate `List<FeatureDef>` so it isn't itself
  board-aware) — a photo plus a feature list goes in, a JSON list of which
  of those features are visually present comes back. The add-character
  route calls it with the *entire* pool (`DefaultFeaturePool.allFeatures()`),
  not just this board's available features, so a detected-but-unavailable
  trait can still flow through as an explicit removal signal — see the
  "Major features" entry below. Both call sites are single-shot: no
  multi-turn conversation, no comparison against other portraits.
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
  plus `app.js` (view logic), `templates.js` (markup-building functions —
  see `CLAUDE.md`), and vendored `Cropper.js` for the crop UI, served
  directly by Ktor's `staticResources` — no framework, no build step, no
  CDN dependency. Views toggle by hash route: board list/create,
  `#/board/<id>` detail (character grid + add-a-character flow), and
  `#/board/<id>/play` (pass-and-play game). This replaced the old
  single-page freeform-trait upload UI described in "Decisions" below.
- **Frontend tests**: Playwright, `tests/` at the repo root (`npm test`;
  see `README.md`/`CLAUDE.md`). Runs against the static files directly, no
  Kotlin backend — `page.route()` intercepts every backend call with
  fixture data.
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
- **Trait-count balance surfaced + enforced**: `BoardBalancer.featureCounts`'s
  per-feature current/target data (already computed, previously unused in the
  UI) is now rendered as a count badge next to each feature switch in the
  add-character checklist, and as a collapsible "Feature balance" panel on
  the board detail screen. Each character is also constrained to
  `BoardBalancer.MIN_TRAITS_PER_CHARACTER`..`MAX_TRAITS_PER_CHARACTER` (5–8,
  flat constants, not derived from board/pool size — too few traits makes a
  character hard to distinguish, too many makes every guess trivial),
  enforced both in the add-character UI (gates the create button) and
  server-side in `POST /api/boards/{id}/characters` (rejected before the
  Gemini call). Selecting a trait set that exactly matches an existing
  character shows a non-blocking warning with a count — untracked features
  can still make two characters look different in practice, so this isn't a
  hard block, unlike the min/max.
- Board list + create-board UI, board detail UI (character grid,
  add-a-character flow reusing the Cropper.js crop step) —
  `static/index.html` + `static/app.js`. This replaced the old single-page
  freeform-trait upload UI as the app's front door.
- Add-character flow is wizard-gated: the feature checklist (step 3) stays
  hidden until the user explicitly confirms their crop (`confirmCropBtn`,
  which also calls `cropper.disable()` to lock it in) — detection must not
  run against Cropper's un-adjusted default crop box, which is what an
  earlier version of this did and got visibly bad results from. Confirming
  triggers `POST /api/boards/{id}/characters/detect-traits`
  (`detectTraits()`) against the *entire* feature pool (not just this
  board's currently-available features), which pre-checks the matching
  available boxes — still editable before generate. A detected trait that's
  unavailable for this board (e.g. hats already at target) can't be
  checked, so it falls out of the client's checked-vs-detected diff
  automatically and is sent as `removeTraits`, telling `generatePortrait()`
  to explicitly draw the portrait *without* that feature rather than
  leaving whatever the photo shows untouched; the UI also surfaces this to
  the user via the feature's disabled-reason text. A loading
  spinner/greyed-out panel covers both the detection call and the final
  generate call.
- `POST /api/transform` (`Application.kt`): unchanged standalone endpoint —
  accepts a cropped photo plus a JSON-encoded list of trait strings and
  returns one Gemini-generated cartoon portrait, no board involved. Kept
  for quick manual testing; the frontend no longer calls it (board
  add-character goes through `/api/boards/{id}/characters` instead, which
  calls the same shared `generatePortrait()` helper).
- **Pass-and-play game screen** (`#/board/<id>/play`, entirely in
  `static/app.js` — no new backend route): playable once a board is
  `COMPLETE` (board detail swaps the disabled "Mark board complete" button
  for an enabled "Play" link at that point). Setup has each player
  privately pick a secret character (the other player must guess it), with
  a pass-device interstitial between picks; play is strict alternating
  turns where each turn is exactly one action (ask a trait question, or
  make a final guess) then pass. Key design point: each player's turn only
  ever shows *their own* board (all characters, their own
  previously-eliminated candidates greyed out) — the two players' candidate
  sets are independent, since they're each narrowing down a different
  secret. Trait-question answers are looked up automatically from the
  opponent's already-stored `traits` (`CharacterDto.traits`, already
  present in the existing `GET /api/boards/{id}` response) rather than a
  player manually judging/typing an answer, which is what makes the
  no-secrecy-during-play property possible — the app is an honest referee,
  so there's nothing left to hide except the two initial picks. A wrong
  final guess is an immediate loss (classic rule, no take-backs). Session
  state is client-only (a `gameState` object in `app.js`); a page refresh
  mid-game loses progress, accepted for a same-room, same-sitting MVP —
  deliberately not the same problem as the parked "async two-device play"
  idea in `current.md`, which is about reconnecting across devices/time.
  **Mobile-friendly trait-ask grid**: `FeatureDef` gained an optional `groupLabel`
  (`board/BoardModel.kt`), set on `DefaultFeaturePool`'s four `exclusiveWith` pairs
  (hair_light/hair_dark → "Hair color", eyes_big/eyes_small → "Eye size",
  skin_light/skin_dark → "Skin tone", young/old → "Age") and threaded through
  `FeatureStatusDto`. The play screen's trait-ask grid (`renderPlayScreen` in
  `app.js`) collapses same-`groupLabel` features into one category button
  (`traitGroupButtonHtml`/`.trait-group-btn`) that opens a small option-picker
  modal (`traitGroupModalHtml`, `showTraitGroupModal`) instead of listing every
  option flat — cuts a 22-feature board down to 18 tappable rows and keeps each
  option's individual ask/answer state exactly like a standalone trait button
  (disabled once asked; the whole category disables once every option in it has
  been asked, or once the turn's single action is used). Purely a UI grouping —
  doesn't change balancing, detection, or the underlying one-trait-per-ask
  semantics (asking one option in a pair doesn't auto-answer the other, since a
  character can have neither). The card grid and trait-ask grid also got a
  `max-width: 480px` tuning pass (`styles.css`) — smaller card tiles (3 columns
  on a ~390px phone instead of 2) and a single-column trait-ask list.
  Categories now cover the *whole* pool (not just the four exclusive pairs) —
  `DefaultFeaturePool` groups everything into Accessories, Hair, Facial
  features, Skin tone, and Age, so a full board's trait-ask list is 5 buttons
  instead of 22. The category button summary is a compact "n/total asked"
  count rather than spelling out every option's answer, since groups can now
  hold more than two options. **The main play-screen grid (`#playGrid`) hides
  character names entirely** (`gameCardHtml`'s `showName` param, defaulting to
  `true` everywhere else — pick/guess/game-over screens keep names since
  they're already click-to-choose/reveal) to read more like a physical board;
  tapping any card, including a face-down/eliminated one, opens
  `gameCardDetailModalHtml` with that character's name and full trait list via
  `showGameCardDetail`. Not a fairness leak — every character's
  appearance/traits are already visible to both players, only the two secret
  picks are hidden.
- **Photo Library** (`photobank/`, `#/library` in the frontend): a
  board-agnostic library of real people's own photos plus their detected
  features, independent of any board — built for reuse across boards'
  add-character flows, not just standalone browsing. `PhotoBankRepository`
  (`FirestorePhotoBankRepository` impl) mirrors `BoardRepository`'s
  metadata/image-bytes split; bank photos resize to ~1024px (vs. 640px for
  character portraits) since a bank photo is also future `generatePortrait()`
  input, not just a thumbnail. One bank exists today (`bankId` hardcoded to
  `"default"` in the frontend), but every photo doc carries its own `bankId`
  so multi-bank needs no schema migration. Routes:
  `POST/GET /api/photobank/{bankId}/photos`,
  `GET /api/photobank/{bankId}/photos/{photoId}/image`,
  `DELETE /api/photobank/{bankId}/photos/{photoId}`. The board add-character
  flow forks at step 1 into "Upload new photo" (unchanged) vs. "Choose from
  library": picking a library photo skips crop and skips a second
  `detectTraits()` call entirely — `POST /api/boards/{id}/characters`
  accepts a `bankId`/`bankPhotoId` pair in place of raw image bytes, fetches
  the photo from `PhotoBankRepository`, and records `sourcePhotoId` on the
  created `Character`. That's a one-way, point-in-time copy: deleting a bank
  photo later never cascades to characters already created from it, since
  each character already holds its own independent portrait + traits.
- **Random board generation** (`POST /api/boards/random`, `POST /api/boards/{id}/random/step` in
  `board/BoardRoutes.kt`; entry point is a "🎲 Generate random board" button on the Photo Library
  screen — a few clicks from there, not from the board list): fills a whole new board from the
  photo bank without picking photos/traits one at a time. `POST /random` just creates the board in
  a new `GENERATING` status and returns immediately; the *client* then drives progress by calling
  `POST /{id}/random/step` in a loop, once per character, until the board leaves `GENERATING` —
  a debounced background step per poll rather than one big job — see the "Debounced background
  steps" decision below. `board/RandomBoardGenerator.kt` (pure, unit-tested like `BoardBalancer`) plans each
  character: start from the bank photo's own `detectedFeatures` (real likeness), keep only the
  ones `BoardBalancer.availableFeatures` still allows for the board, then pad up to a randomly
  sized 5–8 trait set from other currently-available features (sampled from the top few by
  balance score, not strictly greedy) so it doesn't read as mechanically identical every time —
  "prioritize likeness, then go wild." A detected trait dropped for being unavailable is passed to
  `generatePortrait` as a `removeTraitPhrases` entry, same diff the manual add-character flow
  already sends. Characters are auto-named `"Character 1"`, `"Character 2"`, etc. — no real name
  data exists for a bank photo. **A bank photo can back more than one character**: every candidate
  step re-lists the whole bank rather than excluding photos already used by this board, since a
  heavily transformed portrait — especially once traits diverge from what the source photo actually
  shows — carries its own uniqueness. Board size is therefore not capped by the photo bank's size.
  Reuse is spread evenly rather than left to chance: `RandomBoardGenerator.plan` orders candidate
  photos by ascending usage count on this board (from existing characters' `sourcePhotoId`,
  shuffled within each tied tier), so every distinct photo is used once before any is used twice —
  a Gemini failure can knock one step's pick down the priority list, but the next step's ordering
  self-corrects since the skipped photo is still least-used.
  `BoardState.generationError` is set (board flips back to `IN_PROGRESS` either way) when a run
  can't fully reach target size — either the bank is empty, or the feature pool itself is exhausted
  for this board's targets (every feature already at quota, nothing left to plan a valid character
  from); the manual add-character and complete-board routes both reject a `GENERATING` board with
  409 so nothing else mutates it mid-run. **A stalled run needs an explicit resume**: the client
  (`runRandomBoardSteps` in `app.js`) only polls `/random/step` while status is `GENERATING`, so a
  board that hit `generationError` stays stuck even after whatever caused it is fixed (more photos
  added, a code fix shipped) — nothing re-polls it on its own. `POST /{id}/random/resume` (same
  file) is the way back in: same preconditions as a fresh `/random` (board exists, has room left,
  `GEMINI_API_KEY` set), clears `generationError` and flips back to `GENERATING` via the same
  `startGenerating` repository call `/random` uses. The board detail screen shows a "Resume
  generating" button (`#resumeGenerationBtn`) whenever `generationError` is set, which calls it and
  then kicks `runRandomBoardSteps` itself, same as the initial create flow.
- No board-quality analysis yet; game generation so far is pass-and-play
  only (saving/editing generated games not started) — see `current.md`.

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
- **Debounced background steps, not one big job, and not a blocking request per character**:
  random board generation (see "Major features" above) needs many sequential Gemini calls, and
  went through two earlier shapes before landing here. First cut: one detached background
  coroutine kicked off by `POST /api/boards/random` that ran the whole fill unattended.
  Reconsidered before shipping — Cloud Run freezes an instance's CPU when it has no request in
  flight by default, which would silently stall a long-lived detached job between requests in
  production unless the deploy also added `--no-cpu-throttling`. Second cut: no background work
  at all — `POST /{id}/random/step` did one character's plan-and-Gemini-call synchronously inline
  and the client awaited it in a loop, one blocking HTTP round-trip per character. That sidestepped
  the CPU-throttling problem but tied up a connection for the duration of every Gemini call.
  Landed on a middle ground: `POST /{id}/random/step` never blocks — it kicks one character's
  worth of work onto `backgroundScope` (an application-lifetime `CoroutineScope` built in
  `Application.kt`, cancelled on `ApplicationStopping`) only if nothing's already running for that
  board on this instance (a `ConcurrentHashMap.newKeySet<String>()` debounce guard,
  `activeGenerationSteps` in `BoardRoutes.kt`), and returns current state immediately either way.
  The client (`runRandomBoardSteps` in `app.js`) just polls that endpoint on a timer
  (`RANDOM_BOARD_POLL_MS`, 2s) and re-renders whatever comes back.
  Deliberately shipped **without** `--no-cpu-throttling`: a step can still get CPU-throttled
  mid-Gemini-call if its instance goes idle, but the design self-heals rather than needing that
  flag for correctness — the debounce guard is per-instance state, not a distributed lock, so a
  poll that lands on a *different* (fresh) instance just sees "nothing running here" and starts
  its own step, and a poll that lands back on the *same* frozen instance restores its CPU
  allocation and lets the stalled step resume. Worst case is a temporarily slower-looking board,
  not a stuck one. Revisit adding the flag if that turns out to matter in practice. Same
  resumability property as before either way: progress is the persisted character count, not
  separate job state, so closing the tab mid-run just pauses it and reopening the board resumes.

## Maintenance

Update this file when: infra/architecture changes, a new major feature
lands, or a past decision needs to be recorded so it doesn't get
relitigated. Keep it high-level — implementation gotchas belong in
`CLAUDE.md`, not here. Keep the "Major features" list honest about what's
actually built vs. what's spec'd but not started — the latter belongs in
`current.md`'s roadmap, not here.
