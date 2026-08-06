# Guess Who Boards

Create a board for a group (family, friends, office, ...), then add people to
it one photo at a time: crop the photo, pick from a real feature pool
(glasses, hat, beard, ...), and Gemini generates a stylized cartoon portrait.
Boards persist in Firestore and can be reloaded in-progress or complete.

## Run it

```bash
cd backend
export GEMINI_API_KEY=your-key-here
gcloud auth application-default login   # only needed once per machine, for Firestore
./gradlew run
```

Open http://localhost:8080. `GEMINI_API_KEY` is required for any portrait
generation (standalone or board add-character). Firestore access
(application-default credentials, see above) is only needed once you hit a
`/api/boards/...` route — the app starts fine without it.

## How it's built

- `backend/src/main/kotlin/com/guesswho/Application.kt` — Ktor server setup
  plus the standalone `POST /api/transform` endpoint (crop a photo, pick
  freeform traits, get one Gemini-generated cartoon portrait back — no board
  involved).
- `backend/src/main/kotlin/com/guesswho/Gemini.kt` — the shared Gemini call
  (`generatePortrait()`), used by both `/api/transform` and the board
  add-character flow.
- `backend/src/main/kotlin/com/guesswho/board/` — the board domain model
  (`BoardModel.kt`), the balancing engine (`BoardBalancer.kt`,
  `DefaultFeaturePool.kt`), the Firestore-backed persistence
  (`BoardRepository.kt`, `FirestoreBoardRepository.kt`), and the board HTTP
  routes (`BoardRoutes.kt`) — `POST/GET /api/boards`, `GET /api/boards/{id}`,
  `POST /api/boards/{id}/characters`, `POST /api/boards/{id}/complete`.
- `backend/src/main/resources/static/` — the whole frontend: `index.html` +
  `app.js` (board list/create view and board detail/add-character view,
  hash-routed at `#/board/<id>`), a
  [Cropper.js](https://github.com/fengyuanchen/cropperjs) crop box (vendored
  locally in `static/vendor/`, no CDN dependency), and `styles.css`.

No frontend build step, no framework — plain HTML/CSS/JS served directly by
Ktor. Persistence is Firestore (Native mode), no other database.

## Deploying (Cloud Build → Cloud Run)

`cloudbuild.yaml` (repo root) builds `backend/Dockerfile`, pushes the image to
Artifact Registry, and deploys it to Cloud Run, using the same
project/region/pattern as the `foodie` repo:

- Project: `foodie-503510`
- Artifact Registry repo: `cloud-run-source-deploy` (region `northamerica-northeast1`)
- Cloud Run service: `guess-who`

One-time setup (not automated — do this once in the GCP project):

1. **Create the secret** the deploy step reads at runtime:
   ```bash
   printf '%s' 'your-gemini-key' | gcloud secrets create GEMINI_API_KEY \
     --project=foodie-503510 --data-file=-
   ```
   (To rotate the key later: `gcloud secrets versions add GEMINI_API_KEY --project=foodie-503510 --data-file=-`.)

2. **Grant the Cloud Run runtime service account access to that secret** (the
   default compute service account, unless the project uses a custom one):
   ```bash
   gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
     --project=foodie-503510 \
     --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

3. **Create the `guess-who` Firestore database.** This project already has a
   `(default)` Firestore database in use by an unrelated app, so boards use
   a separate *named* database instead — Firestore doesn't create named
   databases automatically, this is a one-time step:
   ```bash
   gcloud firestore databases create \
     --project=foodie-503510 \
     --database=guess-who \
     --location=northamerica-northeast1 \
     --type=firestore-native
   ```
   (Location can't be changed after creation; `northamerica-northeast1` was
   picked to match the Cloud Run region above. If you'd rather use a
   different database name, update `FIRESTORE_DATABASE_ID` in
   `Application.kt` to match.)

4. **Grant the Cloud Run runtime service account Firestore access** (this
   role is project-wide, so it covers every database in the project,
   including the named one above):
   ```bash
   gcloud projects add-iam-policy-binding foodie-503510 \
     --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
     --role="roles/datastore.user"
   ```

5. **Create the Cloud Build trigger** on push to `main`:
   ```bash
   gcloud builds triggers create github \
     --project=foodie-503510 \
     --name=guess-who-deploy \
     --repo-owner=jstinson83 --repo-name=guess-who \
     --branch-pattern='^main$' \
     --build-config=cloudbuild.yaml
   ```
   (If the GitHub repo isn't connected to Cloud Build yet, the GCP Console
   will prompt for that the first time: Cloud Build → Triggers → Connect
   Repository.)

After that, every push to `main` builds and deploys automatically.
