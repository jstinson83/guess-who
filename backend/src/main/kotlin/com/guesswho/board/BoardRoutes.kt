package com.guesswho.board

import com.guesswho.PortraitResult
import com.guesswho.generatePortrait
import com.guesswho.storage.StoredPortrait
import io.ktor.client.HttpClient
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.http.content.streamProvider
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class CreateBoardRequest(val name: String, val targetSize: Int)

@Serializable
data class CharacterDto(val id: String, val name: String, val traits: List<String>, val portraitUrl: String?)

@Serializable
data class FeatureStatusDto(
    val id: String,
    val label: String,
    val currentYes: Int,
    val currentNo: Int,
    val targetYesMin: Int,
    val targetYesMax: Int,
    val state: String,
)

@Serializable
data class FeatureAvailabilityDto(val id: String, val label: String, val available: Boolean, val reason: String?)

@Serializable
data class BoardDetailDto(
    val id: String,
    val name: String,
    val targetSize: Int,
    val status: String,
    val characters: List<CharacterDto>,
    val featureStatuses: List<FeatureStatusDto>,
    val availableFeatures: List<FeatureAvailabilityDto>,
)

@Serializable
data class BoardSummaryDto(
    val id: String,
    val name: String,
    val targetSize: Int,
    val characterCount: Int,
    val status: String,
    val updatedAt: String,
)

/**
 * [repository] is a [Lazy] so building the Firestore client (which needs GCP application-default
 * credentials) is deferred until a board route is actually hit, rather than at server startup.
 */
fun Route.boardRoutes(repository: Lazy<BoardRepository>, httpClient: HttpClient) {
    route("/api/boards") {
        post {
            val request = call.receive<CreateBoardRequest>()
            if (request.name.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Board name is required"))
                return@post
            }
            if (request.targetSize <= 0) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "targetSize must be positive"))
                return@post
            }

            val board = repository.value.createBoard(request.name, request.targetSize)
            call.respond(HttpStatusCode.Created, board.toDetailDto())
        }

        get {
            call.respond(repository.value.listBoards().map { it.toDto() })
        }

        route("/{id}") {
            get {
                val board = repository.value.getBoard(call.parameters["id"]!!)
                if (board == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Board not found"))
                    return@get
                }
                call.respond(board.toDetailDto())
            }

            get("/characters/{characterId}/portrait") {
                val boardId = call.parameters["id"]!!
                val characterId = call.parameters["characterId"]!!
                val portrait = repository.value.getCharacterPortrait(boardId, characterId)
                if (portrait == null) {
                    call.respond(HttpStatusCode.NotFound)
                    return@get
                }
                call.respondBytes(portrait.bytes, ContentType.parse(portrait.contentType))
            }

            post("/complete") {
                val board = repository.value.completeBoard(call.parameters["id"]!!)
                if (board == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Board not found"))
                    return@post
                }
                call.respond(board.toDetailDto())
            }

            post("/characters") {
                val boardId = call.parameters["id"]!!

                var imageBytes: ByteArray? = null
                var imageMime = "image/png"
                var name = ""
                var traitsRaw = "[]"

                call.receiveMultipart().forEachPart { part ->
                    when (part) {
                        is PartData.FileItem -> {
                            imageBytes = part.streamProvider().readBytes()
                            imageMime = part.contentType?.toString() ?: "image/png"
                        }
                        is PartData.FormItem -> when (part.name) {
                            "name" -> name = part.value
                            "traits" -> traitsRaw = part.value
                            else -> {}
                        }
                        else -> {}
                    }
                    part.dispose()
                }

                val bytes = imageBytes
                if (bytes == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing 'image'"))
                    return@post
                }

                val apiKey = System.getenv("GEMINI_API_KEY")
                if (apiKey.isNullOrBlank()) {
                    call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "GEMINI_API_KEY is not set on the server"))
                    return@post
                }

                val traitIds = runCatching { Json.decodeFromString<List<String>>(traitsRaw) }.getOrDefault(emptyList()).toSet()
                val featureLabels = traitIds.mapNotNull { id -> DefaultFeaturePool.allFeatures().find { it.id == id }?.label }

                when (val result = generatePortrait(httpClient, apiKey, bytes, imageMime, featureLabels)) {
                    is PortraitResult.Failure -> {
                        call.respond(result.status, mapOf("error" to result.error))
                        return@post
                    }
                    is PortraitResult.Success -> {
                        val portrait = StoredPortrait(result.imageBytes, result.mimeType)
                        val board = repository.value.addCharacter(boardId, name, traitIds, portrait)
                        if (board == null) {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "Board not found"))
                            return@post
                        }
                        call.respond(HttpStatusCode.Created, board.toDetailDto())
                    }
                }
            }
        }
    }
}

private fun BoardState.toDetailDto() = BoardDetailDto(
    id = id,
    name = name,
    targetSize = targetSize,
    status = status.name,
    characters = characters.map {
        CharacterDto(
            id = it.id,
            name = it.name,
            traits = it.traits.toList(),
            portraitUrl = if (it.hasPortrait) "/api/boards/$id/characters/${it.id}/portrait" else null,
        )
    },
    featureStatuses = BoardBalancer.featureCounts(this).map {
        FeatureStatusDto(
            id = it.feature.id,
            label = it.feature.label,
            currentYes = it.currentYes,
            currentNo = it.currentNo,
            targetYesMin = it.targetYesRange.first,
            targetYesMax = it.targetYesRange.last,
            state = it.state.name,
        )
    },
    availableFeatures = BoardBalancer.availableFeatures(this).map {
        FeatureAvailabilityDto(it.feature.id, it.feature.label, it.available, it.reason)
    },
)

private fun BoardSummary.toDto() = BoardSummaryDto(id, name, targetSize, characterCount, status.name, updatedAt)
