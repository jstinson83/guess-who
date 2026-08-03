package com.guesswho.domain

import kotlinx.serialization.Serializable

@Serializable
enum class BoardTemplate {
    Family,
    Friends,
    Office,
    Classroom,
    SportsTeam,
    Custom,
}

/** Which features a character has, keyed by [FeatureDef.id]. */
typealias FeatureSet = Map<String, Boolean>

@Serializable
data class Character(
    val id: String,
    val boardId: String,
    val name: String,
    val sourcePhotoUrl: String,
    val portraitUrl: String,
    val features: FeatureSet,
    val createdAt: Long,
)

@Serializable
data class Board(
    val id: String,
    val name: String,
    val template: BoardTemplate,
    val targetSize: Int,
    val createdAt: Long,
    val characters: List<Character> = emptyList(),
)

@Serializable
data class CreateBoardRequest(
    val name: String,
    val template: BoardTemplate,
    val targetSize: Int = FeaturePool.DEFAULT_TARGET_SIZE,
)

@Serializable
data class UpdateCharacterFeaturesRequest(
    val name: String? = null,
    val features: FeatureSet,
)

@Serializable
data class FeatureAvailabilityRequest(
    val selection: FeatureSet,
    val excludeCharacterId: String? = null,
)

@Serializable
data class FeatureAvailability(
    val feature: FeatureDef,
    val available: Boolean,
    val reason: String? = null,
    val currentCount: Int,
    val targetCount: Int,
)

@Serializable
data class FeatureDistributionRow(
    val feature: FeatureDef,
    val yes: Int,
    val no: Int,
    val targetYes: Int,
    val targetNo: Int,
)

@Serializable
data class BoardQuality(
    val starRating: Int,
    val averageGuesses: Double,
    val duplicateCombinations: Int,
    val featureBalance: String,
    val remainingUniqueCombinations: Int,
    val distribution: List<FeatureDistributionRow>,
)
