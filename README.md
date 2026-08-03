# Custom Guess Who

Create and play a personalized Guess Who board using photos of people you actually know.

## How it works

Upload a photo, pick a handful of features from a controlled checklist (glasses, hat,
beard, earrings, long hair, ...), and the app generates a stylized portrait. As you add
more people, a balancing engine limits which features you can pick next so the finished
board stays fair and every character stays visually distinguishable — no two people end
up with the exact same combination of features, and no single feature dominates the board.

## Project layout

- `backend/` — Kotlin + Ktor REST API. Owns the domain model, the feature-balancing
  engine, board-quality scoring, SQLite persistence (via Exposed), and photo storage.
- `frontend/` — React + TypeScript + Vite client that talks to the backend API: board
  creation, the add-person flow with live feature availability, a board-quality panel,
  and a pass-and-play game mode.

## Running locally

**Backend** (serves the API on `:8080`):

```bash
cd backend
./gradlew run
```

**Frontend** (dev server on `:5173`, proxies `/api` and `/uploads` to the backend):

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

## Current scope / known limitations

- **Portrait generation is a stub, not real AI.** The backend applies a deterministic
  duotone/posterize filter (`backend/src/main/kotlin/com/guesswho/service/PortraitService.kt`)
  so every character shares one consistent illustration style. It does not do background
  removal or identity-preserving feature exaggeration (e.g. drawing glasses onto a face) —
  that's real, future work that would call out to an actual image-generation model. The
  selected feature checklist is stored per character and shown in the UI; it isn't
  rendered into the portrait pixels yet.
- **Play mode is local pass-and-play**, matching how physical Guess Who is played: one
  device, one board, players take turns and flip cards down themselves. There's no
  network multiplayer or hidden per-player state.
- Board "quality" (star rating, average guesses, feature balance) is computed with a
  greedy decision-tree simulation over the feature pool — a reasonable approximation of
  the classic "20 questions" optimal strategy, not an exhaustive search.
