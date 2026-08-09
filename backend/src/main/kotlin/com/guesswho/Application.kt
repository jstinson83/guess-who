package com.guesswho

import com.google.cloud.firestore.Firestore
import com.google.cloud.firestore.FirestoreOptions
import com.google.cloud.storage.StorageOptions
import com.guesswho.board.BoardRepository
import com.guesswho.board.FirestoreBoardRepository
import com.guesswho.board.boardRoutes
import com.guesswho.board.featureRoutes
import com.guesswho.photobank.FirestorePhotoBankRepository
import com.guesswho.photobank.PhotoBankRepository
import com.guesswho.photobank.photoBankRoutes
import com.guesswho.storage.GcsPortraitStore
import com.guesswho.storage.PortraitStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation as ClientContentNegotiation
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.http.content.streamProvider
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationStopping
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.http.content.staticResources
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.callloging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.respond
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import java.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.serialization.json.Json

// Must already exist (Firestore doesn't auto-create named databases) — see README's one-time
// GCP setup section for the `gcloud firestore databases create` command.
private const val FIRESTORE_DATABASE_ID = "guess-who"

// Must already exist and be granted to the runtime service account — see README's one-time GCP
// setup section for the `gcloud storage buckets create` / IAM binding commands. Prefixed with
// the project id since GCS bucket names are globally unique across all of GCP, not just this
// project.
private const val PORTRAIT_BUCKET = "foodie-503510-guess-who-portraits"

// A hand-picked portrait, uploaded once to the same bucket, sent to Gemini alongside every new
// subject photo as a style anchor so portraits across a board share one consistent art style
// instead of each generation reinterpreting "cartoon style" independently — see the
// styleReferenceBytes doc on generatePortrait() in Gemini.kt. Missing is not an error: portrait
// generation just falls back to style-by-prompt-wording alone. Not private: also used by
// `board/BoardRoutes.kt`'s add-character flow.
const val STYLE_TEMPLATE_OBJECT_NAME = "template/portrait.jpeg"

fun main() {
    embeddedServer(Netty, port = 8080, host = "0.0.0.0", module = Application::module).start(wait = true)
}

fun Application.module() {
    install(ContentNegotiation) {
        json()
    }
    install(CallLogging)
    // Without this, an unhandled exception (e.g. a Lazy repository failing to build its GCP
    // client because application-default credentials aren't configured) falls through to
    // Ktor's default error handling, which returns a bare 500 with an *empty* body — every
    // frontend call site does `await res.json()` expecting an error envelope, so an empty body
    // crashes with a raw "Unexpected end of JSON input" instead of showing anything useful.
    install(StatusPages) {
        exception<Throwable> { call, cause ->
            call.application.environment.log.error("Unhandled exception", cause)
            call.respond(HttpStatusCode.InternalServerError, mapOf("error" to (cause.message ?: "Internal server error")))
        }
    }

    val httpClient = HttpClient(CIO) {
        install(ClientContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    }

    // Deferred for the same reason as boardRepository below: plain `/api/transform` usage (e.g.
    // local dev without GCP application-default credentials configured) shouldn't need a bucket.
    val portraitStore: Lazy<PortraitStore> = lazy {
        GcsPortraitStore(StorageOptions.getDefaultInstance().service, PORTRAIT_BUCKET)
    }

    // A named database, not `(default)` — this GCP project already has a `(default)` Firestore
    // database in use by an unrelated app, and named databases keep the two fully separate.
    // Deferred until a board or photo-bank route is actually hit, so plain `/api/transform` usage
    // (e.g. local dev without GCP application-default credentials configured) still works. Shared
    // between boardRepository and photoBankRepository below rather than each building its own
    // client.
    val firestore: Lazy<Firestore> = lazy {
        FirestoreOptions.newBuilder().setDatabaseId(FIRESTORE_DATABASE_ID).build().service
    }

    val boardRepository: Lazy<BoardRepository> = lazy {
        FirestoreBoardRepository(firestore.value, portraitStore.value)
    }

    val photoBankRepository: Lazy<PhotoBankRepository> = lazy {
        FirestorePhotoBankRepository(firestore.value, portraitStore.value)
    }

    // Outlives any single request — a random-board generation step (see POST
    // /api/boards/{id}/random/step in BoardRoutes.kt) is kicked off from a request but allowed
    // to keep running after that request's response is sent, so the client doesn't have to hold
    // a connection open for the duration of a Gemini call. Cancelled on shutdown so Netty isn't
    // waiting on orphaned jobs. Deliberately not paired with Cloud Run's `--no-cpu-throttling`
    // flag yet (see .claude/context.md's "Client-paced generation" note) — a step can stall if
    // its instance gets CPU-throttled mid-call, but the design self-heals (a later poll either
    // wakes the same instance or lands on a fresh one that picks the board back up from its
    // persisted state) rather than depending on that flag for correctness. Revisit if stalls
    // turn out to be a real problem in practice.
    val backgroundScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    environment.monitor.subscribe(ApplicationStopping) { backgroundScope.cancel() }

    routing {
        staticResources("/", "static", index = "index.html")

        post("/api/transform") {
            var imageBytes: ByteArray? = null
            var imageMime = "image/png"
            var traitsRaw = "[]"

            call.receiveMultipart().forEachPart { part ->
                when (part) {
                    is PartData.FileItem -> {
                        imageBytes = part.streamProvider().readBytes()
                        imageMime = part.contentType?.toString() ?: "image/png"
                    }
                    is PartData.FormItem -> if (part.name == "traits") traitsRaw = part.value
                    else -> {}
                }
                part.dispose()
            }

            val bytes = imageBytes
            if (bytes == null) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing 'image'"))
                return@post
            }

            val traits = runCatching { Json.decodeFromString<List<String>>(traitsRaw) }.getOrDefault(emptyList())

            val apiKey = System.getenv("GEMINI_API_KEY")
            if (apiKey.isNullOrBlank()) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "GEMINI_API_KEY is not set on the server"))
                return@post
            }

            val styleReference = runCatching { portraitStore.value.fetch(STYLE_TEMPLATE_OBJECT_NAME) }.getOrNull()

            when (
                val result = generatePortrait(
                    httpClient, apiKey, bytes, imageMime, traits,
                    styleReferenceBytes = styleReference?.bytes,
                    styleReferenceMime = styleReference?.contentType,
                )
            ) {
                is PortraitResult.Success -> {
                    val dataUrl = "data:${result.mimeType};base64,${Base64.getEncoder().encodeToString(result.imageBytes)}"
                    call.respond(mapOf("image" to dataUrl))
                }
                is PortraitResult.Failure -> call.respond(result.status, mapOf("error" to result.error))
            }
        }

        boardRoutes(boardRepository, httpClient, portraitStore, photoBankRepository, backgroundScope)
        photoBankRoutes(photoBankRepository, httpClient)
        featureRoutes()
    }
}
