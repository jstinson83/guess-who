# Guess Who Portrait Generator

Upload a photo, crop it, pick a few traits (glasses, mustache, hat, ...), and
Gemini edits the photo accordingly. Single page, single backend endpoint.

## Run it

```bash
cd backend
export GEMINI_API_KEY=your-key-here
./gradlew run
```

Open http://localhost:8080.

## How it's built

- `backend/src/main/kotlin/com/guesswho/Application.kt` — one Ktor server:
  serves the static page and exposes `POST /api/transform`, which forwards
  the cropped photo plus the selected traits to Gemini's image-editing model
  (`gemini-2.5-flash-image`) and returns the resulting image.
- `backend/src/main/resources/static/index.html` — the whole frontend: file
  upload, a [Cropper.js](https://github.com/fengyuanchen/cropperjs) crop box
  (vendored locally in `static/vendor/`, no CDN dependency), trait
  checkboxes, and the result image.

No database, no build step for the frontend, no framework — it's one HTML
file and one Kotlin file.

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

3. **Create the Cloud Build trigger** on push to `main`:
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
