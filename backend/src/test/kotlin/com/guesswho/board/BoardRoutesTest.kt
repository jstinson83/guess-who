package com.guesswho.board

import com.guesswho.photobank.InMemoryPhotoBankRepository
import com.guesswho.photobank.PhotoBankRepository
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation as ClientContentNegotiation
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.Headers
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Exercises [boardRoutes] end-to-end against an [InMemoryBoardRepository], so these run without
 * GCP credentials. `/characters` is only covered up to its trait-count validation, which runs
 * before the Gemini call — the happy path (actually generating a portrait) isn't covered here
 * since it calls Gemini directly.
 */
class BoardRoutesTest {

    private fun repository() = lazy { InMemoryBoardRepository() as BoardRepository }

    private fun portraitStore() = lazy { InMemoryPortraitStore() as com.guesswho.storage.PortraitStore }

    private fun photoBankRepository() = lazy { InMemoryPhotoBankRepository() as PhotoBankRepository }

    // Unconfined so a /random/step call's backgroundScope.launch{} runs to completion inline,
    // before the launching request handler even returns — the in-memory test doubles never
    // genuinely suspend, so there's no real concurrency to lose by doing this. Lets tests assert
    // on the outcome with a follow-up GET instead of needing to sleep/poll for a real background
    // job to finish.
    private fun backgroundScope() = CoroutineScope(Dispatchers.Unconfined + SupervisorJob())

    private fun io.ktor.server.application.Application.installBoardRoutes(
        repo: Lazy<BoardRepository> = repository(),
        photoBankRepo: Lazy<PhotoBankRepository> = photoBankRepository(),
    ): Lazy<BoardRepository> {
        install(ContentNegotiation) { json() }
        routing {
            boardRoutes(
                repo,
                HttpClient(CIO) { install(ClientContentNegotiation) { json() } },
                portraitStore(),
                photoBankRepo,
                backgroundScope(),
            )
        }
        return repo
    }

    @Test
    fun `random board rejects an empty photo library`() = testApplication {
        application { installBoardRoutes() }

        val response = client.post("/api/boards/random") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertTrue(response.bodyAsText().contains("no photos"))
    }

    @Test
    fun `random board fails fast without a GEMINI_API_KEY, without creating a board`() = testApplication {
        val photoBankRepo = photoBankRepository()
        val repo = repository()
        application { installBoardRoutes(repo, photoBankRepo) }
        runBlocking {
            photoBankRepo.value.addPhoto(
                "default",
                setOf("glasses"),
                com.guesswho.storage.StoredPortrait(byteArrayOf(1, 2, 3), "image/png"),
            )
        }

        val response = client.post("/api/boards/random") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }

        assertEquals(HttpStatusCode.InternalServerError, response.status)
        assertTrue(response.bodyAsText().contains("GEMINI_API_KEY"))
        assertTrue(repo.value.listBoards().isEmpty())
    }

    @Test
    fun `random board rejects a blank name`() = testApplication {
        application { installBoardRoutes() }

        val response = client.post("/api/boards/random") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"","targetSize":12}""")
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    @Test
    fun `random step on a board that isn't generating is a no-op returning current state`() = testApplication {
        val repo = repository()
        application { installBoardRoutes(repo) }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        val response = client.post("/api/boards/$id/random/step")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("IN_PROGRESS", body.getValue("status").jsonPrimitive.content)
    }

    @Test
    fun `random step on an unknown board returns 404`() = testApplication {
        application { installBoardRoutes() }

        assertEquals(HttpStatusCode.NotFound, client.post("/api/boards/does-not-exist/random/step").status)
    }

    @Test
    fun `random step kicks off background work and returns immediately without waiting for it`() = testApplication {
        val repo = repository()
        application { installBoardRoutes(repo) }

        val board = runBlocking { repo.value.createBoard("The Smiths", 12) }
        runBlocking { repo.value.startGenerating(board.id) }

        // The kicked-off step runs on an Unconfined test scope (see backgroundScope()), so by
        // the time this call returns it has already run to completion and flipped the board back
        // to IN_PROGRESS with a GEMINI_API_KEY error — but the *response body itself* is still
        // the pre-step snapshot (still GENERATING), proving the route doesn't wait on it.
        val response = client.post("/api/boards/${board.id}/random/step")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("GENERATING", body.getValue("status").jsonPrimitive.content)

        val after = client.get("/api/boards/${board.id}")
        val afterBody = Json.parseToJsonElement(after.bodyAsText()).jsonObject
        assertEquals("IN_PROGRESS", afterBody.getValue("status").jsonPrimitive.content)
        assertTrue(afterBody.getValue("generationError").jsonPrimitive.content.contains("GEMINI_API_KEY"))
    }

    @Test
    fun `the debounce guard releases after a step finishes, so a later call still works`() = testApplication {
        val repo = repository()
        application { installBoardRoutes(repo) }

        val board = runBlocking { repo.value.createBoard("The Smiths", 12) }
        runBlocking { repo.value.startGenerating(board.id) }

        // Unconfined test scheduling (see backgroundScope()) makes these calls run serially
        // rather than actually racing, so this doesn't exercise the guard's concurrent-skip path
        // directly — it instead proves activeGenerationSteps' finally-block release works: if it
        // didn't, this board id would stay wedged in the set forever and no future step (e.g. a
        // second random board reusing Firestore-assigned ids in a real deployment) could ever run
        // for it again. Both calls should complete cleanly with no error.
        val first = client.post("/api/boards/${board.id}/random/step")
        val second = client.post("/api/boards/${board.id}/random/step")
        assertEquals(HttpStatusCode.OK, first.status)
        assertEquals(HttpStatusCode.OK, second.status)

        val after = client.get("/api/boards/${board.id}")
        val afterBody = Json.parseToJsonElement(after.bodyAsText()).jsonObject
        assertEquals("IN_PROGRESS", afterBody.getValue("status").jsonPrimitive.content)
    }

    @Test
    fun `random resume rejects a board with no stalled run to resume`() = testApplication {
        val repo = repository()
        application { installBoardRoutes(repo) }

        // Fresh, never-generated board: IN_PROGRESS but no generationError.
        val board = runBlocking { repo.value.createBoard("The Smiths", 12) }

        val response = client.post("/api/boards/${board.id}/random/resume")
        assertEquals(HttpStatusCode.Conflict, response.status)
        assertTrue(response.bodyAsText().contains("no stalled generation run"))
    }

    @Test
    fun `random resume rejects an unknown board`() = testApplication {
        application { installBoardRoutes() }

        assertEquals(HttpStatusCode.NotFound, client.post("/api/boards/does-not-exist/random/resume").status)
    }

    @Test
    fun `random resume rejects a board that already reached its target size`() = testApplication {
        val repo = repository()
        application { installBoardRoutes(repo) }

        val board = runBlocking {
            val created = repo.value.createBoard("The Smiths", 1)
            repo.value.addCharacter(created.id, "Character 1", setOf("glasses"), null, null)
            repo.value.stopGenerating(created.id, "Generated 1 of 1 — should never happen, but exercised anyway")!!
        }

        val response = client.post("/api/boards/${board.id}/random/resume")
        assertEquals(HttpStatusCode.Conflict, response.status)
        assertTrue(response.bodyAsText().contains("already reached its target size"))
    }

    @Test
    fun `random resume fails fast without a GEMINI_API_KEY, without touching board status`() = testApplication {
        val repo = repository()
        application { installBoardRoutes(repo) }

        val board = runBlocking {
            val created = repo.value.createBoard("The Smiths", 12)
            repo.value.stopGenerating(created.id, "Generated 0 of 12 — the photo library is empty.")!!
        }

        val response = client.post("/api/boards/${board.id}/random/resume")
        assertEquals(HttpStatusCode.InternalServerError, response.status)
        assertTrue(response.bodyAsText().contains("GEMINI_API_KEY"))

        val after = repo.value.getBoard(board.id)!!
        assertEquals(BoardStatus.IN_PROGRESS, after.status)
    }

    @Test
    fun `create board then fetch it back`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }
        assertEquals(HttpStatusCode.Created, createResponse.status)
        val created = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject
        val id = created.getValue("id").jsonPrimitive.content
        assertEquals("The Smiths", created.getValue("name").jsonPrimitive.content)
        assertEquals("IN_PROGRESS", created.getValue("status").jsonPrimitive.content)
        assertTrue(created.getValue("featureStatuses").toString().contains("glasses"))

        val getResponse = client.get("/api/boards/$id")
        assertEquals(HttpStatusCode.OK, getResponse.status)
        val fetched = Json.parseToJsonElement(getResponse.bodyAsText()).jsonObject
        assertEquals(id, fetched.getValue("id").jsonPrimitive.content)
    }

    @Test
    fun `create board rejects blank name`() = testApplication {
        application { installBoardRoutes() }

        val response = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"","targetSize":12}""")
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    @Test
    fun `getting an unknown board returns 404`() = testApplication {
        application { installBoardRoutes() }

        assertEquals(HttpStatusCode.NotFound, client.get("/api/boards/does-not-exist").status)
    }

    @Test
    fun `fetching a portrait for a character with none returns 404`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        assertEquals(HttpStatusCode.NotFound, client.get("/api/boards/$id/characters/does-not-exist/portrait").status)
    }

    @Test
    fun `listing boards reflects created boards`() = testApplication {
        application { installBoardRoutes() }

        client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Office","targetSize":16}""")
        }

        val listResponse = client.get("/api/boards")
        assertEquals(HttpStatusCode.OK, listResponse.status)
        assertTrue(listResponse.bodyAsText().contains("Office"))
    }

    @Test
    fun `creating a character with too few features is rejected before calling Gemini`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        // No GEMINI_API_KEY is set in this test environment, so a 400 here (rather than the
        // 500 the missing-key check would produce) proves the trait-count check runs first.
        val response = client.post("/api/boards/$id/characters") {
            setBody(MultiPartFormDataContent(formData {
                append("image", byteArrayOf(1, 2, 3), Headers.build {
                    append(HttpHeaders.ContentType, "image/png")
                    append(HttpHeaders.ContentDisposition, "filename=photo.png")
                })
                append("name", "Jordan")
                append("traits", """["glasses","hat"]""")
            }))
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertTrue(response.bodyAsText().contains("between 5 and 8"))
    }

    @Test
    fun `creating a character with a blank name is rejected before calling Gemini`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        val response = client.post("/api/boards/$id/characters") {
            setBody(MultiPartFormDataContent(formData {
                append("image", byteArrayOf(1, 2, 3), Headers.build {
                    append(HttpHeaders.ContentType, "image/png")
                    append(HttpHeaders.ContentDisposition, "filename=photo.png")
                })
                append("traits", """["glasses","hat","facial_hair","long_hair","hair_light"]""")
            }))
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertTrue(response.bodyAsText().contains("name"))
    }

    @Test
    fun `creating a character with mutually exclusive features is rejected`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        val response = client.post("/api/boards/$id/characters") {
            setBody(MultiPartFormDataContent(formData {
                append("image", byteArrayOf(1, 2, 3), Headers.build {
                    append(HttpHeaders.ContentType, "image/png")
                    append(HttpHeaders.ContentDisposition, "filename=photo.png")
                })
                append("name", "Jordan")
                append("traits", """["glasses","hat","facial_hair","hair_light","hair_dark"]""")
            }))
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertTrue(response.bodyAsText().contains("Light hair"))
        assertTrue(response.bodyAsText().contains("Dark hair"))
    }

    @Test
    fun `creating a character with too many features is rejected`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        val nineTraits = """["glasses","hat","facial_hair","long_hair","hair_light","eyes_big","big_nose","big_ears","curly_hair"]"""
        val response = client.post("/api/boards/$id/characters") {
            setBody(MultiPartFormDataContent(formData {
                append("image", byteArrayOf(1, 2, 3), Headers.build {
                    append(HttpHeaders.ContentType, "image/png")
                    append(HttpHeaders.ContentDisposition, "filename=photo.png")
                })
                append("name", "Jordan")
                append("traits", nineTraits)
            }))
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertTrue(response.bodyAsText().contains("between 5 and 8"))
    }

    @Test
    fun `creating a character from an unknown library photo returns 404 before calling Gemini`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        val response = client.post("/api/boards/$id/characters") {
            setBody(MultiPartFormDataContent(formData {
                append("bankId", "default")
                append("bankPhotoId", "does-not-exist")
                append("name", "Jordan")
                append("traits", """["glasses","hat","facial_hair","long_hair","hair_light"]""")
            }))
        }

        assertEquals(HttpStatusCode.NotFound, response.status)
        assertTrue(response.bodyAsText().contains("Library photo not found"))
    }

    @Test
    fun `creating a character from a known library photo reuses its bytes past validation`() = testApplication {
        val photoBankRepo = photoBankRepository()
        application { installBoardRoutes(photoBankRepo = photoBankRepo) }
        val photo = runBlocking {
            photoBankRepo.value.addPhoto(
                "default",
                setOf("glasses", "hat"),
                com.guesswho.storage.StoredPortrait(byteArrayOf(1, 2, 3), "image/png"),
            )
        }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","targetSize":12}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        // No GEMINI_API_KEY is set in this test environment, so reaching the 500 the missing-key
        // check produces (rather than a 400/404) proves the bank photo was found and validation
        // passed — the happy path itself calls Gemini directly, same limitation as the plain
        // upload flow's coverage above.
        val response = client.post("/api/boards/$id/characters") {
            setBody(MultiPartFormDataContent(formData {
                append("bankId", "default")
                append("bankPhotoId", photo.id)
                append("name", "Jordan")
                append("traits", """["glasses","hat","facial_hair","long_hair","hair_light"]""")
            }))
        }

        assertEquals(HttpStatusCode.InternalServerError, response.status)
        assertTrue(response.bodyAsText().contains("GEMINI_API_KEY"))
    }

    @Test
    fun `adding a character to a generating board is rejected`() = testApplication {
        val repo = repository()
        application { installBoardRoutes(repo) }

        val board = runBlocking { repo.value.createBoard("The Smiths", 12) }
        runBlocking { repo.value.startGenerating(board.id) }

        val response = client.post("/api/boards/${board.id}/characters") {
            setBody(MultiPartFormDataContent(formData {
                append("image", byteArrayOf(1, 2, 3), Headers.build {
                    append(HttpHeaders.ContentType, "image/png")
                    append(HttpHeaders.ContentDisposition, "filename=photo.png")
                })
                append("name", "Jordan")
                append("traits", """["glasses","hat","facial_hair","long_hair","hair_light"]""")
            }))
        }

        assertEquals(HttpStatusCode.Conflict, response.status)
        assertTrue(response.bodyAsText().contains("still generating"))
    }

    @Test
    fun `completing a generating board is rejected`() = testApplication {
        val repo = repository()
        application { installBoardRoutes(repo) }

        val board = runBlocking { repo.value.createBoard("The Smiths", 1) }
        runBlocking { repo.value.startGenerating(board.id) }

        val response = client.post("/api/boards/${board.id}/complete")
        assertEquals(HttpStatusCode.Conflict, response.status)
        assertTrue(response.bodyAsText().contains("still generating"))
    }

    @Test
    fun `completing a board flips its status once it has enough characters`() = testApplication {
        val repo = repository()
        application { installBoardRoutes(repo) }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Classroom","targetSize":2}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        repo.value.addCharacter(id, "Ada", setOf("glasses", "hat", "facial_hair", "long_hair", "hair_light"), null)
        repo.value.addCharacter(id, "Bo", setOf("glasses", "hat", "facial_hair", "long_hair", "hair_dark"), null)

        val completeResponse = client.post("/api/boards/$id/complete")
        assertEquals(HttpStatusCode.OK, completeResponse.status)
        val completed = Json.parseToJsonElement(completeResponse.bodyAsText()).jsonObject
        assertEquals("COMPLETE", completed.getValue("status").jsonPrimitive.content)
    }

    @Test
    fun `completing a board without enough characters is rejected`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Classroom","targetSize":20}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        val completeResponse = client.post("/api/boards/$id/complete")
        assertEquals(HttpStatusCode.BadRequest, completeResponse.status)
        assertTrue(completeResponse.bodyAsText().contains("needs 20 characters"))
    }
}
