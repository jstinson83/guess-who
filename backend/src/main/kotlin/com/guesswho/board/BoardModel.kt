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

/** Feature ids present on a character; absence means "no" — there is no tri-state. */
data class Character(val id: String, val traits: Set<String>)

data class BoardState(val targetSize: Int, val characters: List<Character> = emptyList())

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
