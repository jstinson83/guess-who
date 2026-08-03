package com.guesswho

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation as ClientContentNegotiation
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.http.content.streamProvider
import io.ktor.http.contentType
import io.ktor.http.isSuccess
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
import java.util.Base64
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private const val GEMINI_MODEL = "gemini-2.5-flash-image"
private const val GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/$GEMINI_MODEL:generateContent"

@Serializable
data class GeminiInlineData(val mimeType: String, val data: String)

@Serializable
data class GeminiPart(val text: String? = null, val inlineData: GeminiInlineData? = null)

@Serializable
data class GeminiContent(val parts: List<GeminiPart>)

@Serializable
data class GeminiRequest(val contents: List<GeminiContent>)

@Serializable
data class GeminiCandidate(val content: GeminiContent? = null)

@Serializable
data class GeminiResponse(val candidates: List<GeminiCandidate> = emptyList())

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
            if (traits.isEmpty()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Select at least one trait"))
                return@post
            }

            val apiKey = System.getenv("GEMINI_API_KEY")
            if (apiKey.isNullOrBlank()) {
                call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "GEMINI_API_KEY is not set on the server"))
                return@post
            }

            val prompt = "Edit this photo of a person. Apply these changes: ${traits.joinToString(", ")}. " +
                "Keep the person clearly recognizable and leave everything else about the photo unchanged."

            val geminiRequest = GeminiRequest(
                contents = listOf(
                    GeminiContent(
                        parts = listOf(
                            GeminiPart(text = prompt),
                            GeminiPart(inlineData = GeminiInlineData(imageMime, Base64.getEncoder().encodeToString(bytes))),
                        ),
                    ),
                ),
            )

            val response = httpClient.post(GEMINI_URL) {
                header("x-goog-api-key", apiKey)
                contentType(ContentType.Application.Json)
                setBody(geminiRequest)
            }

            if (!response.status.isSuccess()) {
                call.respond(HttpStatusCode.BadGateway, mapOf("error" to "Gemini request failed: ${response.status} ${response.bodyAsText()}"))
                return@post
            }

            val geminiResponse = response.body<GeminiResponse>()
            val image = geminiResponse.candidates.firstOrNull()?.content?.parts?.firstOrNull { it.inlineData != null }?.inlineData
            if (image == null) {
                call.respond(HttpStatusCode.BadGateway, mapOf("error" to "Gemini did not return an image"))
                return@post
            }

            call.respond(mapOf("image" to "data:${image.mimeType};base64,${image.data}"))
        }
    }
}
