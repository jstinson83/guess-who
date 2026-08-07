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
 *
 * [styleReferenceBytes]/[styleReferenceMime], when supplied, are a second image sent alongside
 * the subject's photo purely as a style anchor — a previously-generated portrait whose exact
 * line weight, shading, and color treatment new portraits should match, so a whole board's
 * portraits look like they came from one illustrator instead of each generation reinterpreting
 * "cartoon style" independently. Optional because it's fetched from GCS by the caller (see
 * `STYLE_TEMPLATE_OBJECT_NAME` in `Application.kt`) and a missing template shouldn't block
 * portrait generation.
 */
suspend fun generatePortrait(
    httpClient: HttpClient,
    apiKey: String,
    imageBytes: ByteArray,
    imageMime: String,
    traitPhrases: List<String>,
    removeTraitPhrases: List<String> = emptyList(),
    styleReferenceBytes: ByteArray? = null,
    styleReferenceMime: String? = null,
): PortraitResult {
    val traitsClause = if (traitPhrases.isNotEmpty()) " Give the person these features: ${traitPhrases.joinToString(", ")}." else ""
    val removeClause = if (removeTraitPhrases.isNotEmpty()) {
        " The photo shows ${removeTraitPhrases.joinToString(", ")} — leave that out of the cartoon."
    } else ""
    val styleClause = if (styleReferenceBytes != null) {
        " The second image is a style reference only — match its exact illustration style (line " +
            "weight, shading, color treatment, background color) but depict the person from the " +
            "first photo, not the person shown in the reference."
    } else ""
    val prompt = "Redraw this photo of a person as a bold, flat-color cartoon illustration — a stylized " +
        "cartoon portrait, not a photorealistic edit. Crop and reframe to a head-and-shoulders portrait " +
        "centered on the face, and replace the background with a plain solid color so the person is the " +
        "only subject in frame.$traitsClause$removeClause$styleClause Keep the person clearly recognizable."

    val parts = buildList {
        add(GeminiPart(text = prompt))
        add(GeminiPart(inlineData = GeminiInlineData(imageMime, Base64.getEncoder().encodeToString(imageBytes))))
        if (styleReferenceBytes != null && styleReferenceMime != null) {
            add(GeminiPart(inlineData = GeminiInlineData(styleReferenceMime, Base64.getEncoder().encodeToString(styleReferenceBytes))))
        }
    }

    val geminiRequest = GeminiRequest(contents = listOf(GeminiContent(parts = parts)))

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
