package com.guesswho.routes

import com.guesswho.domain.CreateBoardRequest
import com.guesswho.domain.FeatureAvailabilityRequest
import com.guesswho.domain.FeatureSet
import com.guesswho.domain.UpdateCharacterFeaturesRequest
import com.guesswho.service.BoardService
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.http.content.streamProvider
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import kotlinx.serialization.json.Json

private val json = Json { ignoreUnknownKeys = true }

fun Route.boardRoutes() {
    get("/api/boards") {
        call.respond(BoardService.listBoards())
    }

    post("/api/boards") {
        val request = call.receive<CreateBoardRequest>()
        call.respond(HttpStatusCode.Created, BoardService.createBoard(request.name, request.template, request.targetSize))
    }

    get("/api/boards/{id}") {
        val id = call.parameters["id"]!!
        val board = BoardService.getBoard(id)
        if (board == null) {
            call.respond(HttpStatusCode.NotFound, mapOf("error" to "Board not found"))
        } else {
            call.respond(board)
        }
    }

    post("/api/boards/{id}/feature-availability") {
        val id = call.parameters["id"]!!
        val request = call.receive<FeatureAvailabilityRequest>()
        call.respond(BoardService.getFeatureAvailability(id, request.selection, request.excludeCharacterId))
    }

    get("/api/boards/{id}/quality") {
        val id = call.parameters["id"]!!
        call.respond(BoardService.getQuality(id))
    }

    post("/api/boards/{id}/characters") {
        val boardId = call.parameters["id"]!!
        var name: String? = null
        var features: FeatureSet = emptyMap()
        var photoBytes: ByteArray? = null

        call.receiveMultipart().forEachPart { part ->
            when (part) {
                is PartData.FormItem -> when (part.name) {
                    "name" -> name = part.value
                    "features" -> features = json.decodeFromString(part.value)
                }
                is PartData.FileItem -> photoBytes = part.streamProvider().readBytes()
                else -> {}
            }
            part.dispose()
        }

        if (name.isNullOrBlank() || photoBytes == null) {
            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Both 'name' and 'photo' are required"))
            return@post
        }

        val character = BoardService.addCharacter(boardId, name!!, features, photoBytes!!)
        call.respond(HttpStatusCode.Created, character)
    }

    put("/api/boards/{id}/characters/{characterId}") {
        val boardId = call.parameters["id"]!!
        val characterId = call.parameters["characterId"]!!
        val request = call.receive<UpdateCharacterFeaturesRequest>()
        call.respond(BoardService.updateCharacterFeatures(boardId, characterId, request.name, request.features))
    }

    delete("/api/boards/{id}/characters/{characterId}") {
        val boardId = call.parameters["id"]!!
        val characterId = call.parameters["characterId"]!!
        BoardService.deleteCharacter(boardId, characterId)
        call.respond(HttpStatusCode.NoContent)
    }
}
