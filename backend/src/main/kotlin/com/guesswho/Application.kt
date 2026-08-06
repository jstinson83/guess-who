package com.guesswho

import com.google.cloud.firestore.FirestoreOptions
import com.guesswho.board.BoardRepository
import com.guesswho.board.FirestoreBoardRepository
import com.guesswho.board.boardRoutes
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation as ClientContentNegotiation
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.http.content.streamProvider
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.http.content.staticResources
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.callloging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.respond
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json

// Must already exist (Firestore doesn't auto-create named databases) — see README's one-time
// GCP setup section for the `gcloud firestore databases create` command.
private const val FIRESTORE_DATABASE_ID = "guess-who"

fun main() {
    embeddedServer(Netty, port = 8080, host = "0.0.0.0", module = Application::module).start(wait = true)
}

fun Application.module() {
    install(ContentNegotiation) {
        json()
    }
    install(CallLogging)

    val httpClient = HttpClient(CIO) {
        install(ClientContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    }

    // A named database, not `(default)` — this GCP project already has a `(default)` Firestore
    // database in use by an unrelated app, and named databases keep the two fully separate.
    // Deferred until a board route is actually hit, so plain `/api/transform` usage (e.g. local
    // dev without GCP application-default credentials configured) still works.
    val boardRepository: Lazy<BoardRepository> = lazy {
        val firestore = FirestoreOptions.newBuilder().setDatabaseId(FIRESTORE_DATABASE_ID).build().service
        FirestoreBoardRepository(firestore)
    }

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

            when (val result = generatePortrait(httpClient, apiKey, bytes, imageMime, traits)) {
                is PortraitResult.Success -> call.respond(mapOf("image" to result.dataUrl))
                is PortraitResult.Failure -> call.respond(result.status, mapOf("error" to result.error))
            }
        }

        boardRoutes(boardRepository, httpClient)
    }
}
