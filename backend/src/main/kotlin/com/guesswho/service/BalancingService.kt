package com.guesswho.service

import com.guesswho.domain.Character
import com.guesswho.domain.FeatureAvailability
import com.guesswho.domain.FeatureDef
import com.guesswho.domain.FeatureDistributionRow
import com.guesswho.domain.FeaturePool
import com.guesswho.domain.FeatureSet
import kotlin.math.max
import kotlin.math.roundToInt

object BalancingService {

    /** How many characters on a board of [targetSize] should ideally have [feature]. */
    fun targetCountFor(feature: FeatureDef, targetSize: Int): Int =
        max(1, (feature.targetRate * targetSize).roundToInt())

    private fun signature(features: FeatureSet): String =
        FeaturePool.all.joinToString("") { if (features[it.id] == true) "1" else "0" }

    fun featureSetsEqual(a: FeatureSet, b: FeatureSet): Boolean =
        signature(a) == signature(b)

    /**
     * Given the existing characters on a board and the in-progress feature
     * selection for a new (or edited) character, decide which not-yet-selected
     * features are still safe to turn on without breaking the board's balance
     * or creating an exact duplicate of another character.
     */
    fun getFeatureAvailability(
        characters: List<Character>,
        targetSize: Int,
        selection: FeatureSet,
        excludeCharacterId: String? = null,
    ): List<FeatureAvailability> {
        val others = characters.filter { it.id != excludeCharacterId }

        return FeaturePool.all.map { feature ->
            val currentCount = others.count { it.features[feature.id] == true }
            val targetCount = targetCountFor(feature, targetSize)

            if (selection[feature.id] == true) {
                return@map FeatureAvailability(feature, available = true, currentCount = currentCount, targetCount = targetCount)
            }

            val candidateSelection = selection + (feature.id to true)
            val wouldDuplicate = others.any { featureSetsEqual(candidateSelection, it.features) }
            if (wouldDuplicate) {
                return@map FeatureAvailability(
                    feature,
                    available = false,
                    reason = "Would duplicate another character.",
                    currentCount = currentCount,
                    targetCount = targetCount,
                )
            }

            val overTarget = currentCount >= targetCount
            if (overTarget) {
                val reason = if (currentCount > targetCount) {
                    "Too many characters already use ${feature.label.lowercase()}."
                } else {
                    "Already at target distribution."
                }
                return@map FeatureAvailability(feature, available = false, reason = reason, currentCount = currentCount, targetCount = targetCount)
            }

            FeatureAvailability(feature, available = true, currentCount = currentCount, targetCount = targetCount)
        }
    }

    /** Current vs. target yes/no distribution for every feature on the board. */
    fun getFeatureDistribution(characters: List<Character>, targetSize: Int): List<FeatureDistributionRow> =
        FeaturePool.all.map { feature ->
            val yes = characters.count { it.features[feature.id] == true }
            val targetYes = targetCountFor(feature, targetSize)
            FeatureDistributionRow(
                feature = feature,
                yes = yes,
                no = characters.size - yes,
                targetYes = targetYes,
                targetNo = targetSize - targetYes,
            )
        }

    fun charactersShareCombination(a: Character, b: Character): Boolean =
        featureSetsEqual(a.features, b.features)
}
