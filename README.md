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

2. **Grant the Cloud Run runtime service account access to that secret.**
   `gcloud run deploy` fails with a `Permission denied on secret` error until
   this is done — the Console's "reference a secret" UI grants this for you
   automatically, but a CI-driven `--set-secrets` deploy (what `cloudbuild.yaml`
   does) does not, so it has to be done up front:
   ```bash
   gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
     --project=foodie-503510 \
     --member="serviceAccount:124314901354-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```
   (`124314901354-compute@developer.gserviceaccount.com` is the default
   Compute Engine service account for the `foodie-503510` project — that's
   what Cloud Run uses as the revision's runtime identity unless a custom
   service account is configured.)

3. **Connect the repo and create the trigger via the Cloud Run Console**
   (Cloud Run → Create Service → "Continuously deploy from a repository" →
   connect `jstinson83/guess-who` → branch `^main$`). This handles the
   GitHub App connection for you, which the raw
   `gcloud builds triggers create github --repo-owner=... --repo-name=...`
   command does **not** — that command fails with `INVALID_ARGUMENT` if the
   repo hasn't already been connected through the Console (or the GitHub App
   install) first.

   **Build type matters:** when configuring the trigger, set it to
   **"Cloud Build configuration file (yaml or json)"** pointing at
   `/cloudbuild.yaml`, not "Dockerfile". The wizard defaults to Dockerfile
   build type, which looks for a `Dockerfile` at the repo root and fails
   with `lstat /workspace/Dockerfile: no such file or directory` (ours is at
   `backend/Dockerfile`) — and even if it didn't fail, a Dockerfile-type
   trigger only builds and pushes the image, it never runs the `gcloud run
   deploy` step, so nothing would actually redeploy.

After that, every push to `main` builds and deploys automatically.
