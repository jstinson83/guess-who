package com.guesswho.board

import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation as ClientContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
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
 * GCP credentials. Doesn't cover `/characters` (it calls Gemini directly), only board
 * create/list/get/complete.
 */
class BoardRoutesTest {

    private fun repository() = lazy { InMemoryBoardRepository() as BoardRepository }

    private fun io.ktor.server.application.Application.installBoardRoutes() {
        install(ContentNegotiation) { json() }
        routing { boardRoutes(repository(), HttpClient(CIO) { install(ClientContentNegotiation) { json() } }) }
    }

    @Test
    fun `create board then fetch it back`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"The Smiths","category":"Family","targetSize":12}""")
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
            setBody("""{"name":"","category":"Family","targetSize":12}""")
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
    }

    @Test
    fun `getting an unknown board returns 404`() = testApplication {
        application { installBoardRoutes() }

        assertEquals(HttpStatusCode.NotFound, client.get("/api/boards/does-not-exist").status)
    }

    @Test
    fun `listing boards reflects created boards`() = testApplication {
        application { installBoardRoutes() }

        client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Office","category":"Office","targetSize":16}""")
        }

        val listResponse = client.get("/api/boards")
        assertEquals(HttpStatusCode.OK, listResponse.status)
        assertTrue(listResponse.bodyAsText().contains("Office"))
    }

    @Test
    fun `completing a board flips its status`() = testApplication {
        application { installBoardRoutes() }

        val createResponse = client.post("/api/boards") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Classroom","category":"Classroom","targetSize":20}""")
        }
        val id = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content

        val completeResponse = client.post("/api/boards/$id/complete")
        assertEquals(HttpStatusCode.OK, completeResponse.status)
        val completed = Json.parseToJsonElement(completeResponse.bodyAsText()).jsonObject
        assertEquals("COMPLETE", completed.getValue("status").jsonPrimitive.content)
    }
}
