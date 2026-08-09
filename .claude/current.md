# Current Sprint

The maintainer's active task checklist, laid out by them in conversation —
not a log of what was last worked on. See `../CLAUDE.md`'s "Session
continuity" section for how this file gets maintained: written down when a
plan is communicated, items checked off/removed as they're finished,
otherwise left alone. See `context.md` for the stable project overview,
and `../docs/PRODUCT_SPEC.md` for the full product spec this roadmap
breaks down.

## Active task

Photo Library: a board-agnostic library of real people's own photos +
their detected features, browsable on its own and usable as an alternate
source for a board's add-character flow. Broken into independently
testable chunks; tackle in order, each shippable/verifiable before
starting the next.

- [x] **Chunk 1 — backend storage/data layer** (no routes, no UI):
      `PhotoBankRepository` interface + `FirestorePhotoBankRepository` +
      an in-memory impl for tests, mirroring `BoardRepository`'s split.
      Generalize `PortraitOptimizer`'s `MAX_DIMENSION` into a parameter —
      bank photos resize to ~1024px longest edge (vs. 640px for
      portraits), since a bank photo is also future `generatePortrait()`
      input, not just a thumbnail. New GCS prefix
      `photobank/{bankId}/{photoId}` in the existing portraits bucket.
      Verify with repository unit tests only.
- [x] **Chunk 2 — Photo Bank HTTP API**: `POST /api/photobank/{bankId}/photos`
      (cropped image in → resize → `detectTraits()` against the full
      feature pool → store → return photo DTO with features), `GET
      /api/photobank/{bankId}/photos` (list, features inline — avoids an
      N+1 detail call), `GET
      /api/photobank/{bankId}/photos/{photoId}/image` (stream bytes,
      mirrors the character-portrait route), `DELETE
      /api/photobank/{bankId}/photos/{photoId}`. Verify with curl/route
      tests, no frontend needed yet.
- [x] **Chunk 3 — Photo Library screen** (frontend), fully standalone, no
      board touches it: nav entry, grid view, "Add photo" (reuses the
      existing Cropper.js crop step from add-character), click-to-modal
      (photo + full detected-feature list — same click-to-modal mechanic
      as the board screen's character modal, but new content, since that
      modal doesn't show traits today), delete action.
- [ ] **Chunk 4 — board integration**: add-character step 1 forks into
      "Upload new photo" (unchanged) vs. "Choose from library" (reuses
      chunk 3's grid+modal). Picking a library photo skips crop and
      skips `detectTraits()` — backend accepts a `bankPhotoId` in place of
      raw image bytes, fetches from `PhotoBankRepository`, reuses the
      stored `detectedFeatures`, pre-checks the overlap with the board's
      currently-available features, and records `sourcePhotoId` on the
      created character. Deleting a bank photo later does not cascade to
      characters already created from it — each character already holds
      its own independent portrait + traits.

Design decisions locked in during planning (recorded here since they
aren't obvious from the code once it lands):
- One bank for now (`bankId` hardcoded to `"default"`), but every photo
  doc carries `bankId` so multi-bank needs no schema migration later.
- A banked photo is the *post-crop* image — what `detectTraits()` actually
  saw — not the pre-crop original, so stored features stay consistent
  with the stored image.
- Removing a bank photo is a real feature for this chunk set, not
  deferred; it only affects future picks, never existing characters.

## Future roadmap (not yet started, no priority/timeline set)

A working breakdown of `../docs/PRODUCT_SPEC.md` into shippable chunks,
roughly in the order the spec's own workflow implies. Reshuffle, re-scope,
or check items off freely as this gets built — it's a breakdown of the
spec, not a maintainer commitment.

### Boards (replace the current stateless single-photo flow)

- [x] Persist boards: name + the list of people/portraits on it (Firestore;
      `board/BoardRepository.kt` + `FirestoreBoardRepository.kt`) — the
      spec's category field (Family/Friends/Office/...) was deliberately
      dropped, not forgotten; see `context.md`'s Decisions
- [x] "Create Board" flow (name it, pick a target size)
- [x] Persist each generated portrait against a board instead of
      returning it directly to the client and forgetting it

### Feature pool (replace the current freeform trait checkboxes)

- [x] Encode the spec's actual feature pool as structured data instead of
      freeform trait strings (`DefaultFeaturePool`, wired into the
      add-character UI)
- [x] First-photo-on-a-board flow: full feature pool unlocked, matching
      today's UX but against the real pool

### Balanced additions

- [x] Track per-board feature usage as people are added
- [x] Compute available vs. unavailable features for each new upload,
      with a reason shown for unavailable ones (`BoardBalancer.availableFeatures`,
      surfaced in the add-character checkboxes)
- [x] Enforce those constraints in the upload UI (only offer available
      features) — unavailable ones are shown disabled with their reason,
      not hidden, per the spec's example
- [x] Surface running trait counts/targets in the UI — per-feature badge
      in the add-character checklist, plus a "Feature balance" panel on
      the board detail screen (both reuse the existing `featureStatuses`
      data, previously computed but never rendered)
- [x] Enforce a flat min/max trait count per character (5–8,
      `BoardBalancer.MIN_TRAITS_PER_CHARACTER`/`MAX_TRAITS_PER_CHARACTER`),
      client- and server-side
- [x] Non-blocking duplicate-character warning in the add-character UI
      (exact trait-set match against existing characters, with a count) —
      a light version of the "duplicate feature-combination count" idea
      from Board analysis below, surfaced at creation time instead of a
      full analysis screen

### Balancing math

- [x] Compute target yes/no distribution per feature from board size
      (e.g. the 24-player glasses/hat/beard/long-hair example in the spec)
- [x] Feed those targets into the "available vs. unavailable" logic above

### Not yet done from this pass

- [ ] `/api/boards/{id}/characters` has no route test (it calls Gemini
      directly); only manually verified via a mocked browser session —
      see `CLAUDE.md` operational gotchas
- [ ] No UI affordance yet for board quality/analysis (star rating,
      average guesses, etc.) — that's the separate "Board analysis"
      section below

### Board analysis

- [ ] Board quality score/star rating
- [ ] Average-guesses estimate
- [ ] Duplicate feature-combination count
- [ ] Feature balance grade (Excellent/etc.)
- [ ] Remaining unique feature combinations
- [ ] Surface all of the above somewhere in the board UI at all times

### Game generation

- [x] Generate a playable mobile game from a completed board — pass-and-play
      only so far (`#/board/<id>/play` in `static/app.js`); see
      `context.md`'s Major features for the design
- [ ] Save and edit generated games

## Ideas under discussion (not yet scoped, not in the spec)

Raised in conversation, not yet decided enough to become roadmap items or
spec changes. Revisit before scoping.

- [ ] Async two-device play: shareable game code/link as the room
      identifier (no accounts required for this alone); each device holds
      an anonymous per-game seat token. Open question: polling vs. live
      updates (Firestore listeners) — lean polling unless "opponent is
      live" feel is wanted.
- [ ] Lightweight accounts for a "my boards" list across devices — decided
      worth doing; not yet scoped (just "sign in with Google" vs. full
      auth, how it interacts with link-based sharing of boards containing
      real people's photos).
