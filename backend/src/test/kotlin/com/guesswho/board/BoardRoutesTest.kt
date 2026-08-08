package com.guesswho.board

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

    private fun io.ktor.server.application.Application.installBoardRoutes() {
        install(ContentNegotiation) { json() }
        routing {
            boardRoutes(repository(), HttpClient(CIO) { install(ClientContentNegotiation) { json() } }, portraitStore())
        }
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
    fun `completing a board flips its status`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Classroom","targetSize":20}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        val completeResponse = client.post("/api/boards/$id/complete")
        assertEquals(HttpStatusCode.OK, completeResponse.status)
        val completed = Json.parseToJsonElement(completeResponse.bodyAsText()).jsonObject
        assertEquals("COMPLETE", completed.getValue("status").jsonPrimitive.content)
    }
}
