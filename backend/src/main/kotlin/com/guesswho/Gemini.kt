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
    val traitsClause = if (traitPhrases.isNotEmpty()) {
        " Now caricature these specific features, Guess-Who style: ${traitPhrases.joinToString(", ")}. Push each one " +
            "well past photographic accuracy until it reads as instantly, unmistakably big/small/prominent at a " +
            "glance from across a room — a mild, tasteful nod toward the trait is a failed result here. This is the " +
            "one deliberate exception to 'copy proportions exactly' above: these named features should be visibly, " +
            "boldly bigger/smaller/more prominent than they are in the source photo. Every other feature not named " +
            "here keeps its real photographed proportions."
    } else ""
    val removeClause = if (removeTraitPhrases.isNotEmpty()) {
        " The photo shows ${removeTraitPhrases.joinToString(", ")} — leave that out of the cartoon."
    } else ""
    val styleClause = if (styleReferenceBytes != null) {
        " A second reference image is attached for rendering technique ONLY — its line weight, shading " +
            "style, color palette, and background treatment. It shows a completely different person: " +
            "none of their facial features, face shape, proportions, skin tone, or identity may be used. " +
            "Every identity detail must come exclusively from the first photo."
    } else ""
    val prompt = "ABSOLUTE TOP PRIORITY, overriding every other instruction including the art style: this is " +
        "a likeness portrait of one specific, real individual, not a generic cartoon character who merely " +
        "shares their traits. The first attached photo is ground truth — treat it the way a portrait artist " +
        "treats a sitting, not as loose inspiration. Someone who knows this person in real life must be able " +
        "to identify them instantly from the result, with no hesitation. If that would not happen, the " +
        "output has failed the task, no matter how good the cartoon style looks.\n\n" +
        "Copy, do not reinterpret, this person's exact: face shape and proportions, jawline, cheekbones, " +
        "eye shape, eye spacing, eye color, eyebrow shape and thickness, nose shape and width, mouth and " +
        "lip shape, chin shape, ears, skin tone, and hair color, texture, and hairline exactly as shown in " +
        "the first photo. Preserve real facial geometry and spacing between features precisely — do not " +
        "resize, re-center, or rebalance them toward a symmetric or idealized layout. Never average, " +
        "idealize, beautify, slim, de-age, or generify their features toward a default or template face. " +
        "The specific asymmetries, proportions, and small distinguishing details visible in the photo are " +
        "exactly what must survive into the cartoon — they are not flaws to smooth away. The one deliberate " +
        "exception: if specific features are called out later in this prompt for caricature, those named " +
        "features should be exaggerated well beyond the photo rather than copied exactly — everything else " +
        "stays faithful to the photo as described above.\n\n" +
        "With that non-negotiable constraint, redraw this photo of a person as a bold, flat-color cartoon " +
        "illustration — a stylized cartoon portrait, not a photorealistic edit. Apply only the linework, " +
        "shading, and color-flattening of the cartoon style; do not let the style reshape the underlying " +
        "face. Crop and reframe to a head-and-shoulders portrait centered on the face, and replace the " +
        "background with a plain solid color so the person is the only subject in " +
        "frame.$traitsClause$removeClause$styleClause\n\n" +
        "FINAL REMINDER, most important instruction in this entire prompt: likeness and recognizability of " +
        "the exact person in the first photo always wins over stylization. When cartoon style and faithful " +
        "likeness pull in different directions, keep the person's real, specific features and bend the " +
        "style to accommodate them — never the other way around. This does not soften the caricature " +
        "instruction above: any features named for exaggeration must still end up visibly, boldly larger, " +
        "smaller, or more prominent than in the photo — a person's likeness comes from the whole face, not " +
        "from keeping one named feature timidly close to its real size."

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
