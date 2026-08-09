package com.guesswho.photobank

import com.guesswho.storage.StoredPortrait
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation as ClientContentNegotiation
import io.ktor.client.request.delete
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.call.body
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.Headers
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Exercises [photoBankRoutes] end-to-end against an [InMemoryPhotoBankRepository], so these run
 * without GCP credentials. The upload route's happy path (actually running trait detection against
 * Gemini) isn't covered here — only that it's rejected before the Gemini call when the request
 * itself is malformed, and fails cleanly when `GEMINI_API_KEY` isn't set, mirroring
 * `board/BoardRoutesTest.kt`'s coverage of the analogous `/characters` route.
 */
class PhotoBankRoutesTest {

    private fun repository() = lazy { InMemoryPhotoBankRepository() as PhotoBankRepository }

    private fun io.ktor.server.application.Application.installPhotoBankRoutes(
        repo: Lazy<PhotoBankRepository> = repository(),
    ): Lazy<PhotoBankRepository> {
        install(ContentNegotiation) { json() }
        routing {
            photoBankRoutes(repo, HttpClient(CIO) { install(ClientContentNegotiation) { json() } })
        }
        return repo
    }

    private fun image() = StoredPortrait(byteArrayOf(1, 2, 3), "image/jpeg")

    @Test
    fun `listing photos reflects previously added photos with their features`() = testApplication {
        val repo = repository()
        application { installPhotoBankRoutes(repo) }
        val added = runBlocking { repo.value.addPhoto("default", setOf("glasses", "hat"), image()) }

        val response = client.get("/api/photobank/default/photos")
        assertEquals(HttpStatusCode.OK, response.status)
        val list = Json.parseToJsonElement(response.bodyAsText()).jsonArray
        assertEquals(1, list.size)
        val dto = list[0].jsonObject
        assertEquals(added.id, dto.getValue("id").jsonPrimitive.content)
        assertEquals(setOf("glasses", "hat"), dto.getValue("detectedFeatures").jsonArray.map { it.jsonPrimitive.content }.toSet())
        assertEquals("/api/photobank/default/photos/${added.id}/image", dto.getValue("imageUrl").jsonPrimitive.content)
    }

    @Test
    fun `listing photos is scoped to the given bank`() = testApplication {
        val repo = repository()
        application { installPhotoBankRoutes(repo) }
        runBlocking { repo.value.addPhoto("default", emptySet(), image()) }

        val response = client.get("/api/photobank/other-bank/photos")
        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(0, Json.parseToJsonElement(response.bodyAsText()).jsonArray.size)
    }

    @Test
    fun `fetching the image for an unknown photo returns 404`() = testApplication {
        application { installPhotoBankRoutes() }

        assertEquals(HttpStatusCode.NotFound, client.get("/api/photobank/default/photos/does-not-exist/image").status)
    }

    @Test
    fun `fetching the image for an existing photo returns its bytes`() = testApplication {
        val repo = repository()
        application { installPhotoBankRoutes(repo) }
        val stored = image()
        val added = runBlocking { repo.value.addPhoto("default", emptySet(), stored) }

        val response = client.get("/api/photobank/default/photos/${added.id}/image")
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(stored.bytes.contentEquals(response.body<ByteArray>()))
    }

    @Test
    fun `deleting an existing photo removes it`() = testApplication {
        val repo = repository()
        application { installPhotoBankRoutes(repo) }
        val added = runBlocking { repo.value.addPhoto("default", emptySet(), image()) }

        val response = client.delete("/api/photobank/default/photos/${added.id}")
        assertEquals(HttpStatusCode.NoContent, response.status)
        assertEquals(null, runBlocking { repo.value.getPhoto("default", added.id) })
    }

    @Test
    fun `deleting an unknown photo returns 404`() = testApplication {
        application { installPhotoBankRoutes() }

        assertEquals(HttpStatusCode.NotFound, client.delete("/api/photobank/default/photos/does-not-exist").status)
    }

    @Test
    fun `uploading without an image is rejected before checking for an API key`() = testApplication {
        application { installPhotoBankRoutes() }

        // No GEMINI_API_KEY is set in this test environment, so a 400 here (rather than the 500
        // the missing-key check would produce) proves the image check runs first.
        val response = client.post("/api/photobank/default/photos") {
            setBody(MultiPartFormDataContent(formData {}))
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertTrue(response.bodyAsText().contains("image"))
    }

    @Test
    fun `uploading a photo without GEMINI_API_KEY set fails after the image check passes`() = testApplication {
        application { installPhotoBankRoutes() }

        val response = client.post("/api/photobank/default/photos") {
            setBody(MultiPartFormDataContent(formData {
                append("image", byteArrayOf(1, 2, 3), Headers.build {
                    append(HttpHeaders.ContentType, "image/png")
                    append(HttpHeaders.ContentDisposition, "filename=photo.png")
                })
            }))
        }

        assertEquals(HttpStatusCode.InternalServerError, response.status)
        assertTrue(response.bodyAsText().contains("GEMINI_API_KEY"))
    }
}
