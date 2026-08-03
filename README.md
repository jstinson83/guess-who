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
