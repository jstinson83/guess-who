package com.guesswho.board

import com.guesswho.PortraitResult
import com.guesswho.STYLE_TEMPLATE_OBJECT_NAME
import com.guesswho.generatePortrait
import com.guesswho.photobank.PhotoBankRepository
import com.guesswho.storage.PortraitStore
import com.guesswho.storage.optimizePortrait
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
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// The only photo bank that exists today (mirrors PHOTO_BANK_ID in state.js) — random-board
// generation isn't bank-aware yet since nothing else in the app is either.
private const val RANDOM_BOARD_BANK_ID = "default"

// How many candidate photos a single background step will try against Gemini before giving up
// for that round — bounds one step's worst-case duration/cost when a photo or two fails, without
// silently retrying forever when something's systemically broken (a bad key, Gemini down); the
// board just stays GENERATING and the next polled step tries again.
private const val MAX_STEP_ATTEMPTS = 3

// Board ids with a random-generation step currently running on *this* instance — the debounce
// guard for POST /{id}/random/step: a poll that lands while a step is already in flight just
// observes current state instead of piling on a second concurrent Gemini call for the same
// board. Per-instance, not a distributed lock — see the CoroutineScope doc on backgroundScope in
// Application.kt for why that's an accepted tradeoff rather than a bug.
private val activeGenerationSteps = ConcurrentHashMap.newKeySet<String>()

@Serializable
data class CreateBoardRequest(val name: String, val targetSize: Int)

@Serializable
data class RandomBoardRequest(val name: String, val targetSize: Int)

@Serializable
data class CharacterDto(
    val id: String,
    val name: String,
    val traits: List<String>,
    val portraitUrl: String?,
    val sourcePhotoId: String?,
)

@Serializable
data class FeatureStatusDto(
    val id: String,
    val label: String,
    val currentYes: Int,
    val currentNo: Int,
    val targetYesMin: Int,
    val targetYesMax: Int,
    val state: String,
    val groupLabel: String? = null,
)

@Serializable
data class FeatureAvailabilityDto(
    val id: String,
    val label: String,
    val available: Boolean,
    val reason: String?,
    val exclusiveWith: List<String>,
)

@Serializable
data class BoardDetailDto(
    val id: String,
    val name: String,
    val targetSize: Int,
    val status: String,
    val characters: List<CharacterDto>,
    val featureStatuses: List<FeatureStatusDto>,
    val availableFeatures: List<FeatureAvailabilityDto>,
    val minTraitsPerCharacter: Int,
    val maxTraitsPerCharacter: Int,
    val generationError: String? = null,
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

@Serializable
data class FeatureDto(val id: String, val label: String)

/**
 * The feature pool's id/label pairs, with no board context — used by the standalone Photo
 * Library screen to render a bank photo's [com.guesswho.photobank.PhotoBankPhotoDto.detectedFeatures]
 * (which is just ids) as human-readable labels. Board views don't need this: they already get
 * labels inline via [FeatureStatusDto]/[FeatureAvailabilityDto].
 */
fun Route.featureRoutes() {
    get("/api/features") {
        call.respond(DefaultFeaturePool.allFeatures().map { FeatureDto(it.id, it.label) })
    }
}

/**
 * [repository], [portraitStore] and [photoBankRepository] are [Lazy] so building their GCP
 * clients (which need application-default credentials) is deferred until a board route is
 * actually hit, rather than at server startup. [portraitStore] is used directly here (not through
 * [repository]) purely to fetch the style-reference template image for [generatePortrait] —
 * character portraits themselves still go through [repository]. [photoBankRepository] backs the
 * "choose from library" add-character path — see the `/characters` handler below — and the
 * random-board generator (see `/random` and `/random/step` below). [backgroundScope] is the
 * application-lifetime scope a `/random/step` call launches its actual work on — see the doc on
 * where it's built in `Application.kt`.
 */
fun Route.boardRoutes(
    repository: Lazy<BoardRepository>,
    httpClient: HttpClient,
    portraitStore: Lazy<PortraitStore>,
    photoBankRepository: Lazy<PhotoBankRepository>,
    backgroundScope: CoroutineScope,
) {
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

        // Creates the board in GENERATING status and returns immediately (no Gemini calls here)
        // — the client then drives progress itself by repeatedly polling POST
        // /{id}/random/step, which kicks at most one character's worth of work onto a background
        // step per call (see runOneRandomStep and the activeGenerationSteps debounce below) until
        // the board leaves GENERATING.
        post("/random") {
            val request = call.receive<RandomBoardRequest>()
            if (request.name.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Board name is required"))
                return@post
            }
            if (request.targetSize <= 0) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "targetSize must be positive"))
                return@post
            }

            val photos = photoBankRepository.value.listPhotos(RANDOM_BOARD_BANK_ID)
            if (photos.isEmpty()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "The photo library has no photos yet — add some first"))
                return@post
            }

            val apiKey = System.getenv("GEMINI_API_KEY")
            if (apiKey.isNullOrBlank()) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "GEMINI_API_KEY is not set on the server"))
                return@post
            }

            val board = repository.value.createBoard(request.name, request.targetSize)
            repository.value.startGenerating(board.id)

            call.respond(HttpStatusCode.Accepted, repository.value.getBoard(board.id)!!.toDetailDto())
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

            post("/characters/detect-traits") {
                val boardId = call.parameters["id"]!!
                // Only used to 404 on a bad board id — detection itself considers the whole
                // feature pool regardless of board availability, see the candidates line below.
                if (repository.value.getBoard(boardId) == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Board not found"))
                    return@post
                }

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

                // The full pool, not just currently-available features: a detected-but-unavailable
                // trait (e.g. the board already has enough hats) still needs to reach the client so
                // it can be signaled to generatePortrait() as something to explicitly leave out —
                // see the removeTraits diff in characters.js's generateBtn handler.
                when (val result = detectTraits(httpClient, apiKey, bytes, imageMime, DefaultFeaturePool.allFeatures())) {
                    is TraitDetectionResult.Failure -> call.respond(result.status, mapOf("error" to result.error))
                    is TraitDetectionResult.Success -> call.respond(mapOf("traitIds" to result.traitIds.toList()))
                }
            }

            // The client polls this in a loop (see runRandomBoardSteps in boards.js) while a board
            // is GENERATING. It never blocks on Gemini: if no step is already running for this
            // board (see activeGenerationSteps), it kicks one off on backgroundScope and returns
            // immediately either way, so the poll always comes back fast regardless of whether it
            // started new work or found some already in flight. The client just re-renders
            // whatever board state comes back and keeps polling until status leaves GENERATING.
            post("/random/step") {
                val id = call.parameters["id"]!!
                val board = repository.value.getBoard(id)
                if (board == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Board not found"))
                    return@post
                }
                if (board.status == BoardStatus.GENERATING && activeGenerationSteps.add(id)) {
                    backgroundScope.launch {
                        try {
                            runOneRandomStep(id, repository, photoBankRepository, portraitStore, httpClient)
                        } finally {
                            activeGenerationSteps.remove(id)
                        }
                    }
                }
                call.respond(board.toDetailDto())
            }

            // A run that hit a permanent stop (see runOneRandomStep's `stopGenerating` calls —
            // an empty photo bank, or the feature pool exhausted for this board's quotas) leaves
            // the board IN_PROGRESS with `generationError` set, and *stays* that way: the client
            // only polls /random/step while status is GENERATING, so nothing resumes it on its
            // own even once whatever caused the stop is fixed (more photos added, target size
            // lowered, a code fix shipped). This is the only way back into that loop — clears
            // generationError and flips back to GENERATING, same as a fresh POST /random, and the
            // client's existing poll loop picks it up from there.
            post("/random/resume") {
                val id = call.parameters["id"]!!
                val board = repository.value.getBoard(id)
                if (board == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Board not found"))
                    return@post
                }
                if (board.status != BoardStatus.IN_PROGRESS || board.generationError == null) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Board has no stalled generation run to resume"))
                    return@post
                }
                if (board.characters.size >= board.targetSize) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Board has already reached its target size"))
                    return@post
                }

                val apiKey = System.getenv("GEMINI_API_KEY")
                if (apiKey.isNullOrBlank()) {
                    call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "GEMINI_API_KEY is not set on the server"))
                    return@post
                }

                repository.value.startGenerating(id)
                call.respond(repository.value.getBoard(id)!!.toDetailDto())
            }

            post("/complete") {
                val id = call.parameters["id"]!!
                val board = repository.value.getBoard(id)
                if (board == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Board not found"))
                    return@post
                }
                if (board.status == BoardStatus.GENERATING) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Board is still generating — wait for it to finish"))
                    return@post
                }
                if (board.characters.size < board.targetSize) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        mapOf("error" to "Board needs ${board.targetSize} characters before it can be completed (has ${board.characters.size})"),
                    )
                    return@post
                }

                val completed = repository.value.completeBoard(id)
                call.respond(completed!!.toDetailDto())
            }

            post("/characters") {
                val boardId = call.parameters["id"]!!

                val existingBoard = repository.value.getBoard(boardId)
                if (existingBoard == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Board not found"))
                    return@post
                }
                if (existingBoard.status == BoardStatus.GENERATING) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Board is still generating — wait for it to finish"))
                    return@post
                }

                var imageBytes: ByteArray? = null
                var imageMime = "image/png"
                var name = ""
                var traitsRaw = "[]"
                var removeTraitsRaw = "[]"
                var bankId = ""
                var bankPhotoId = ""

                call.receiveMultipart().forEachPart { part ->
                    when (part) {
                        is PartData.FileItem -> {
                            imageBytes = part.streamProvider().readBytes()
                            imageMime = part.contentType?.toString() ?: "image/png"
                        }
                        is PartData.FormItem -> when (part.name) {
                            "name" -> name = part.value
                            "traits" -> traitsRaw = part.value
                            "removeTraits" -> removeTraitsRaw = part.value
                            "bankId" -> bankId = part.value
                            "bankPhotoId" -> bankPhotoId = part.value
                            else -> {}
                        }
                        else -> {}
                    }
                    part.dispose()
                }

                // Two mutually exclusive photo sources: a freshly uploaded/cropped image, or a
                // `bankPhotoId` referencing an already-detected Photo Library photo — see the
                // "choose from library" add-character path in .claude/current.md's Chunk 4.
                val sourcePhotoId = bankPhotoId.ifBlank { null }
                var bytes: ByteArray?
                if (sourcePhotoId != null) {
                    val bankPhotoImage = photoBankRepository.value.getPhotoImage(bankId, sourcePhotoId)
                    if (bankPhotoImage == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Library photo not found"))
                        return@post
                    }
                    bytes = bankPhotoImage.bytes
                    imageMime = bankPhotoImage.contentType
                } else {
                    bytes = imageBytes
                }

                if (bytes == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Missing 'image'"))
                    return@post
                }

                if (name.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Character name is required"))
                    return@post
                }

                val traitIds = runCatching { Json.decodeFromString<List<String>>(traitsRaw) }.getOrDefault(emptyList()).toSet()
                val removeTraitIds = runCatching { Json.decodeFromString<List<String>>(removeTraitsRaw) }.getOrDefault(emptyList()).toSet()

                if (traitIds.size !in BoardBalancer.MIN_TRAITS_PER_CHARACTER..BoardBalancer.MAX_TRAITS_PER_CHARACTER) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        mapOf(
                            "error" to "Characters need between ${BoardBalancer.MIN_TRAITS_PER_CHARACTER} and " +
                                "${BoardBalancer.MAX_TRAITS_PER_CHARACTER} features (got ${traitIds.size})",
                        ),
                    )
                    return@post
                }

                BoardBalancer.exclusivityConflict(traitIds)?.let { (f1, f2) ->
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Can't combine '${f1.label}' and '${f2.label}'"))
                    return@post
                }

                val apiKey = System.getenv("GEMINI_API_KEY")
                if (apiKey.isNullOrBlank()) {
                    call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "GEMINI_API_KEY is not set on the server"))
                    return@post
                }

                val featureLabels = traitIds.mapNotNull { id -> DefaultFeaturePool.allFeatures().find { it.id == id }?.label }
                val removeFeatureLabels = removeTraitIds.mapNotNull { id -> DefaultFeaturePool.allFeatures().find { it.id == id }?.label }

                val styleReference = runCatching { portraitStore.value.fetch(STYLE_TEMPLATE_OBJECT_NAME) }.getOrNull()

                when (
                    val result = generatePortrait(
                        httpClient, apiKey, bytes, imageMime, featureLabels, removeFeatureLabels,
                        styleReferenceBytes = styleReference?.bytes,
                        styleReferenceMime = styleReference?.contentType,
                    )
                ) {
                    is PortraitResult.Failure -> {
                        call.respond(result.status, mapOf("error" to result.error))
                        return@post
                    }
                    is PortraitResult.Success -> {
                        val portrait = optimizePortrait(result.imageBytes, result.mimeType)
                        val board = repository.value.addCharacter(boardId, name, traitIds, portrait, sourcePhotoId)
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
            sourcePhotoId = it.sourcePhotoId,
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
            groupLabel = it.feature.groupLabel,
        )
    },
    availableFeatures = BoardBalancer.availableFeatures(this).map {
        FeatureAvailabilityDto(it.feature.id, it.feature.label, it.available, it.reason, it.feature.exclusiveWith.toList())
    },
    minTraitsPerCharacter = BoardBalancer.MIN_TRAITS_PER_CHARACTER,
    maxTraitsPerCharacter = BoardBalancer.MAX_TRAITS_PER_CHARACTER,
    generationError = generationError,
)

private fun BoardSummary.toDto() = BoardSummaryDto(id, name, targetSize, characterCount, status.name, updatedAt)

/**
 * The actual work behind one `/random/step` call, run on [Route.boardRoutes]'s `backgroundScope`
 * rather than inline in the request handler — see that function's `activeGenerationSteps` guard,
 * which ensures at most one of these runs per board per instance at a time. Plans and generates
 * at most one more character (trying a couple of candidate photos if the first fails at Gemini —
 * see [MAX_STEP_ATTEMPTS]) and persists it. Re-fetches the board itself (rather than taking one
 * as a parameter) since some time may have passed between the request that kicked this off and
 * this actually running.
 */
private suspend fun runOneRandomStep(
    boardId: String,
    repository: Lazy<BoardRepository>,
    photoBankRepository: Lazy<PhotoBankRepository>,
    portraitStore: Lazy<PortraitStore>,
    httpClient: HttpClient,
) {
    val board = repository.value.getBoard(boardId) ?: return
    if (board.status != BoardStatus.GENERATING) return

    val apiKey = System.getenv("GEMINI_API_KEY")
    if (apiKey.isNullOrBlank()) {
        repository.value.stopGenerating(boardId, "GEMINI_API_KEY is not set on the server")
        return
    }

    // Every bank photo is a candidate on every step, used or not — a heavily transformed
    // portrait (especially once traits diverge from what the photo actually shows) carries
    // its own uniqueness, so the number of characters a board can reach isn't capped by how
    // many distinct photos are in the library.
    val candidatePhotos = photoBankRepository.value.listPhotos(RANDOM_BOARD_BANK_ID)
    val plans = RandomBoardGenerator.plan(board, candidatePhotos).take(MAX_STEP_ATTEMPTS)

    if (plans.isEmpty()) {
        val shortfall = board.targetSize - board.characters.size
        val error = if (shortfall <= 0) {
            null
        } else if (candidatePhotos.isEmpty()) {
            "Generated ${board.characters.size} of ${board.targetSize} — the photo library is empty. " +
                "Add photos to the library, or add the rest manually."
        } else {
            "Generated ${board.characters.size} of ${board.targetSize} — the available feature pool is " +
                "exhausted for this board's targets. Add the rest manually, or raise the target size."
        }
        repository.value.stopGenerating(boardId, error)
        return
    }

    val styleReference = runCatching { portraitStore.value.fetch(STYLE_TEMPLATE_OBJECT_NAME) }.getOrNull()
    val labelById = DefaultFeaturePool.allFeatures().associateBy { it.id }

    for (plan in plans) {
        val image = photoBankRepository.value.getPhotoImage(RANDOM_BOARD_BANK_ID, plan.photo.id) ?: continue
        val result = generatePortrait(
            httpClient, apiKey, image.bytes, image.contentType,
            traitPhrases = plan.traits.mapNotNull { labelById[it]?.label },
            removeTraitPhrases = plan.droppedDetectedTraits.mapNotNull { labelById[it]?.label },
            styleReferenceBytes = styleReference?.bytes,
            styleReferenceMime = styleReference?.contentType,
        )
        if (result is PortraitResult.Success) {
            val portrait = optimizePortrait(result.imageBytes, result.mimeType)
            val updated = repository.value.addCharacter(
                boardId, "Character ${board.characters.size + 1}", plan.traits, portrait, plan.photo.id,
            ) ?: return
            if (updated.characters.size >= updated.targetSize) {
                repository.value.stopGenerating(boardId, null)
            }
            return
        }
    }
    // Every candidate this step tried failed at Gemini (transient outage, bad key, etc). Leave
    // the board GENERATING — the next polled step just tries again — rather than treating a
    // flaky call as a permanent stop; running out of plannable photos above is the only
    // permanent one.
}
