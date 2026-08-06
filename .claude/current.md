# Current Sprint

The maintainer's active task checklist, laid out by them in conversation —
not a log of what was last worked on. See `../CLAUDE.md`'s "Session
continuity" section for how this file gets maintained: written down when a
plan is communicated, items checked off/removed as they're finished,
otherwise left alone. See `context.md` for the stable project overview,
and `../docs/PRODUCT_SPEC.md` for the full product spec this roadmap
breaks down.

## Active task

None currently — no sprint plan has been laid out yet. Consult the
"Future roadmap" below for the working breakdown of the spec, in roughly
the order the spec's own workflow implies.

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

- [ ] Generate a playable mobile game from a completed board
- [ ] Save and edit generated games
