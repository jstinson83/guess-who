package com.guesswho.board

import com.guesswho.GeminiContent
import com.guesswho.GeminiGenerationConfig
import com.guesswho.GeminiInlineData
import com.guesswho.GeminiPart
import com.guesswho.GeminiResponse
import com.guesswho.GeminiTextRequest
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
import kotlinx.serialization.json.Json

private const val GEMINI_TRAIT_MODEL = "gemini-2.5-flash"
private const val GEMINI_TRAIT_URL = "https://generativelanguage.googleapis.com/v1beta/models/$GEMINI_TRAIT_MODEL:generateContent"

sealed interface TraitDetectionResult {
    data class Success(val traitIds: Set<String>) : TraitDetectionResult
    data class Failure(val status: HttpStatusCode, val error: String) : TraitDetectionResult
}

@Serializable
private data class DetectedTraits(val presentFeatureIds: List<String> = emptyList())

/**
 * Classifies which of [candidates] are visually present on the person in [imageBytes], so the
 * add-character UI can pre-check those boxes instead of starting from a blank feature list.
 * A separate text-out call from [com.guesswho.generatePortrait] — that one's model only
 * generates images, it can't also return structured data about what it saw.
 */
suspend fun detectTraits(
    httpClient: HttpClient,
    apiKey: String,
    imageBytes: ByteArray,
    imageMime: String,
    candidates: List<FeatureDef>,
): TraitDetectionResult {
    if (candidates.isEmpty()) return TraitDetectionResult.Success(emptySet())

    val featureList = candidates.joinToString("\n") { "- ${it.id}: ${it.label}" }
    val prompt = "Look at the person in this photo. From the list of features below, identify which " +
        "ones are clearly visible on this person. Only include a feature if you can actually see it in " +
        "the photo — don't guess.\n\n$featureList\n\n" +
        "Respond with JSON only, matching {\"presentFeatureIds\": [\"id\", ...]}, using only ids from " +
        "the list above. Use an empty array if none apply."

    val request = GeminiTextRequest(
        contents = listOf(
            GeminiContent(
                parts = listOf(
                    GeminiPart(text = prompt),
                    GeminiPart(inlineData = GeminiInlineData(imageMime, Base64.getEncoder().encodeToString(imageBytes))),
                ),
            ),
        ),
        generationConfig = GeminiGenerationConfig(responseMimeType = "application/json"),
    )

    val response = httpClient.post(GEMINI_TRAIT_URL) {
        header("x-goog-api-key", apiKey)
        contentType(ContentType.Application.Json)
        setBody(request)
    }

    if (!response.status.isSuccess()) {
        return TraitDetectionResult.Failure(HttpStatusCode.BadGateway, "Gemini request failed: ${response.status} ${response.bodyAsText()}")
    }

    val geminiResponse = response.body<GeminiResponse>()
    val text = geminiResponse.candidates.firstOrNull()?.content?.parts?.firstOrNull { it.text != null }?.text
        ?: return TraitDetectionResult.Failure(HttpStatusCode.BadGateway, "Gemini did not return trait data")

    val candidateIds = candidates.map { it.id }.toSet()
    val detected = runCatching { Json.decodeFromString<DetectedTraits>(text) }.getOrDefault(DetectedTraits())
    return TraitDetectionResult.Success(detected.presentFeatureIds.filter { it in candidateIds }.toSet())
}
