package com.guesswho

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import java.util.Base64
import kotlinx.serialization.Serializable

const val GEMINI_MODEL = "gemini-2.5-flash-image"
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
data class GeminiGenerationConfig(val responseMimeType: String)

/** Like [GeminiRequest], but for text-out calls (e.g. trait detection) that need JSON-formatted output. */
@Serializable
data class GeminiTextRequest(val contents: List<GeminiContent>, val generationConfig: GeminiGenerationConfig)

@Serializable
data class GeminiCandidate(val content: GeminiContent? = null)

@Serializable
data class GeminiResponse(val candidates: List<GeminiCandidate> = emptyList())

sealed interface PortraitResult {
    data class Success(val imageBytes: ByteArray, val mimeType: String) : PortraitResult
    data class Failure(val status: HttpStatusCode, val error: String) : PortraitResult
}

/**
 * Redraws [imageBytes] as a cartoon Guess Who portrait via Gemini, applying [traitPhrases]
 * verbatim into the prompt and explicitly excluding [removeTraitPhrases] (features the source
 * photo happens to show but that weren't selected, e.g. a detected hat the user unchecked).
 * Shared by the standalone `/api/transform` endpoint and the board add-character flow so the
 * Gemini call and prompt live in exactly one place.
 */
suspend fun generatePortrait(
    httpClient: HttpClient,
    apiKey: String,
    imageBytes: ByteArray,
    imageMime: String,
    traitPhrases: List<String>,
    removeTraitPhrases: List<String> = emptyList(),
): PortraitResult {
    val traitsClause = if (traitPhrases.isNotEmpty()) " Give the person these features: ${traitPhrases.joinToString(", ")}." else ""
    val removeClause = if (removeTraitPhrases.isNotEmpty()) {
        " The photo shows ${removeTraitPhrases.joinToString(", ")} — leave that out of the cartoon."
    } else ""
    val prompt = "Redraw this photo of a person as a bold, flat-color cartoon illustration — a stylized " +
        "cartoon portrait, not a photorealistic edit. Crop and reframe to a head-and-shoulders portrait " +
        "centered on the face, and replace the background with a plain solid color so the person is the " +
        "only subject in frame.$traitsClause$removeClause Keep the person clearly recognizable."

    val geminiRequest = GeminiRequest(
        contents = listOf(
            GeminiContent(
                parts = listOf(
                    GeminiPart(text = prompt),
                    GeminiPart(inlineData = GeminiInlineData(imageMime, Base64.getEncoder().encodeToString(imageBytes))),
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
        return PortraitResult.Failure(HttpStatusCode.BadGateway, "Gemini request failed: ${response.status} ${response.bodyAsText()}")
    }

    val geminiResponse = response.body<GeminiResponse>()
    val image = geminiResponse.candidates.firstOrNull()?.content?.parts?.firstOrNull { it.inlineData != null }?.inlineData
        ?: return PortraitResult.Failure(HttpStatusCode.BadGateway, "Gemini did not return an image")

    return PortraitResult.Success(Base64.getDecoder().decode(image.data), image.mimeType)
}
