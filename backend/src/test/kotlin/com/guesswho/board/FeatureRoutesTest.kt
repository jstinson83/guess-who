package com.guesswho.board

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * [featureRoutes] needs no repository — it's a plain projection of [DefaultFeaturePool], used by
 * the standalone Photo Library screen to label a bank photo's detected feature ids.
 */
class FeatureRoutesTest {

    @Test
    fun `lists every feature in the pool with id and label`() = testApplication {
        application {
            install(ContentNegotiation) { json() }
            routing { featureRoutes() }
        }

        val response = client.get("/api/features")
        assertEquals(HttpStatusCode.OK, response.status)

        val list = Json.parseToJsonElement(response.bodyAsText()).jsonArray
        assertEquals(DefaultFeaturePool.allFeatures().size, list.size)

        val glasses = list.first { it.jsonObject.getValue("id").jsonPrimitive.content == "glasses" }.jsonObject
        assertEquals("Glasses", glasses.getValue("label").jsonPrimitive.content)

        val ids = list.map { it.jsonObject.getValue("id").jsonPrimitive.content }.toSet()
        assertTrue(ids.containsAll(DefaultFeaturePool.allFeatures().map { it.id }))
    }
}
