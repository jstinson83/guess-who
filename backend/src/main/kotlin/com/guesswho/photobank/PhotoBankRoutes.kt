package com.guesswho.photobank

import com.guesswho.board.DefaultFeaturePool
import com.guesswho.board.TraitDetectionResult
import com.guesswho.board.detectTraits
import com.guesswho.storage.optimizePortrait
import io.ktor.client.HttpClient
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.http.content.streamProvider
import io.ktor.server.application.call
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable

// A bank photo is also future generatePortrait() input, not just a thumbnail for browsing — see
// PortraitOptimizer.kt's maxDimension doc — so it's kept at a higher resolution than the 640px
// default used for generated character portraits.
private const val PHOTO_BANK_MAX_DIMENSION = 1024

@Serializable
data class PhotoBankPhotoDto(
    val id: String,
    val detectedFeatures: List<String>,
    val imageUrl: String,
    val createdAt: String,
)

/**
 * [repository] is [Lazy] for the same reason as [com.guesswho.board.boardRoutes]'s — building its
 * GCP clients (application-default credentials) is deferred until a photo-bank route is actually
 * hit, so a plain `/api/transform`-only run doesn't need any GCP setup.
 */
fun Route.photoBankRoutes(repository: Lazy<PhotoBankRepository>, httpClient: HttpClient) {
    route("/api/photobank/{bankId}/photos") {
        post {
            val bankId = call.parameters["bankId"]!!

            var imageBytes: ByteArray? = null
            var imageMime = "image/png"

            call.receiveMultipart().forEachPart { part ->
                if (part is PartData.FileItem) {
                    imageBytes = part.streamProvider().readBytes()
                    imageMime = part.contentType?.toString() ?: "image/png"
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

            // Resize before detection too, not just before storage — a banked photo's stored
            // features must describe the same bytes a future generatePortrait() call would see,
            // per the "post-crop image" decision in .claude/current.md.
            val resized = optimizePortrait(bytes, imageMime, PHOTO_BANK_MAX_DIMENSION)

            val detectedFeatures = when (
                val result = detectTraits(httpClient, apiKey, resized.bytes, resized.contentType, DefaultFeaturePool.allFeatures())
            ) {
                is TraitDetectionResult.Failure -> {
                    call.respond(result.status, mapOf("error" to result.error))
                    return@post
                }
                is TraitDetectionResult.Success -> result.traitIds
            }

            val photo = repository.value.addPhoto(bankId, detectedFeatures, resized)
            call.respond(HttpStatusCode.Created, photo.toDto())
        }

        get {
            val bankId = call.parameters["bankId"]!!
            call.respond(repository.value.listPhotos(bankId).map { it.toDto() })
        }

        route("/{photoId}") {
            get("/image") {
                val bankId = call.parameters["bankId"]!!
                val photoId = call.parameters["photoId"]!!
                val image = repository.value.getPhotoImage(bankId, photoId)
                if (image == null) {
                    call.respond(HttpStatusCode.NotFound)
                    return@get
                }
                call.respondBytes(image.bytes, ContentType.parse(image.contentType))
            }

            delete {
                val bankId = call.parameters["bankId"]!!
                val photoId = call.parameters["photoId"]!!
                if (!repository.value.deletePhoto(bankId, photoId)) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Photo not found"))
                    return@delete
                }
                call.respond(HttpStatusCode.NoContent)
            }
        }
    }
}

private fun PhotoBankPhoto.toDto() = PhotoBankPhotoDto(
    id = id,
    detectedFeatures = detectedFeatures.toList(),
    imageUrl = "/api/photobank/$bankId/photos/$id/image",
    createdAt = createdAt,
)
