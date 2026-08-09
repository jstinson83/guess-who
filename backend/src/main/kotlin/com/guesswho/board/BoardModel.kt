package com.guesswho.board

enum class Tier { CORE, SECONDARY, SPICE }

/**
 * [targetYesFraction] is a fraction of the board's target size, not a fixed count,
 * so the same pool works for a 16- or 32-person board, not just 24.
 *
 * [exclusiveWith] models forced-choice pairs (e.g. light/dark hair) where a
 * character may have at most one of the linked feature ids.
 */
data class FeatureDef(
    val id: String,
    val label: String,
    val tier: Tier,
    val targetYesFraction: ClosedFloatingPointRange<Double>,
    val exclusiveWith: Set<String> = emptySet(),
)

interface FeaturePool {
    fun allFeatures(): List<FeatureDef>
}

/**
 * Feature ids present on a character; absence means "no" — there is no tri-state.
 *
 * [sourcePhotoId] is set when the character was created by picking a photo from the
 * board-agnostic Photo Library (`com.guesswho.photobank`) instead of uploading a new one — it's
 * informational only, not a live reference: deleting that bank photo later never cascades here,
 * since this character already holds its own independent portrait + traits.
 */
data class Character(
    val id: String,
    val traits: Set<String>,
    val name: String = "",
    val hasPortrait: Boolean = false,
    val sourcePhotoId: String? = null,
)

/** GENERATING is a transient state while a `POST /api/boards/random` background job is filling
 * the board from the photo bank (see RandomBoardGenerator/BoardRoutes) — the board is otherwise
 * a normal IN_PROGRESS board, just with manual edits blocked until the job finishes and flips
 * the status back. */
enum class BoardStatus { IN_PROGRESS, GENERATING, COMPLETE }

/**
 * [id] is empty for a board that hasn't been persisted yet (e.g. inside [BoardBalancer]'s
 * pure functions, which only care about [targetSize] and [characters]); a [BoardRepository]
 * fills in identity/status/timestamps on create.
 *
 * [generationError] is set when a random-fill job (see [BoardStatus.GENERATING]) couldn't reach
 * the board's full target size — e.g. the photo library ran out of usable photos — or failed
 * outright; null once the board has never run one, or the last run filled it completely.
 */
data class BoardState(
    val targetSize: Int,
    val characters: List<Character> = emptyList(),
    val id: String = "",
    val name: String = "",
    val status: BoardStatus = BoardStatus.IN_PROGRESS,
    val createdAt: String = "",
    val updatedAt: String = "",
    val generationError: String? = null,
)

/** Lightweight projection of a [BoardState] for list views, without pulling every character. */
data class BoardSummary(
    val id: String,
    val name: String,
    val targetSize: Int,
    val characterCount: Int,
    val status: BoardStatus,
    val updatedAt: String,
)

enum class BalanceState { TOO_FEW, ON_TARGET, TOO_MANY }

data class FeatureStatus(
    val feature: FeatureDef,
    val currentYes: Int,
    val currentNo: Int,
    val targetYesRange: IntRange,
    val state: BalanceState,
)

data class FeatureAvailability(
    val feature: FeatureDef,
    val available: Boolean,
    val reason: String? = null,
)

data class CandidateScore(
    val balanceScore: Double,
    val correlationPenalty: Double,
    val overallScore: Double,
    val rejected: Boolean = false,
    val rejectionReason: String? = null,
)

data class FeatureSuggestion(val feature: FeatureDef, val score: CandidateScore)
