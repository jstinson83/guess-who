package com.guesswho.service

import com.guesswho.domain.BoardQuality
import com.guesswho.domain.Character
import com.guesswho.domain.FeatureDef
import com.guesswho.domain.FeaturePool
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.max
import kotlin.math.roundToInt

object QualityService {

    /**
     * Expected number of yes/no questions to identify the mystery character,
     * assuming a uniform prior and that each question picks the feature that
     * splits the remaining candidates as evenly as possible (the standard
     * "20 questions" optimal strategy). This is the average depth of that
     * decision tree, weighted by how likely each character is to be the
     * mystery pick (uniform).
     */
    private fun averageQuestions(chars: List<Character>, remainingFeatures: List<FeatureDef>): Double {
        if (chars.size <= 1) return 0.0

        var best: Triple<FeatureDef, List<Character>, List<Character>>? = null
        var bestScore = Int.MAX_VALUE
        for (feature in remainingFeatures) {
            val yes = chars.filter { it.features[feature.id] == true }
            val no = chars.filter { it.features[feature.id] != true }
            if (yes.isEmpty() || no.isEmpty()) continue
            val score = abs(yes.size - no.size)
            if (score < bestScore) {
                bestScore = score
                best = Triple(feature, yes, no)
            }
        }

        if (best == null) {
            // No remaining feature distinguishes this group: they're identical
            // combinations. Approximate the expected number of extra guesses
            // needed to single one out at random.
            return (chars.size - 1) / 2.0
        }

        val (feature, yes, no) = best
        val rest = remainingFeatures.filter { it.id != feature.id }
        val total = chars.size.toDouble()
        return 1.0 +
            (yes.size / total) * averageQuestions(yes, rest) +
            (no.size / total) * averageQuestions(no, rest)
    }

    private fun signature(c: Character): String =
        FeaturePool.all.joinToString("") { if (c.features[it.id] == true) "1" else "0" }

    /** Number of "excess" characters that share an identical feature signature with another character. */
    private fun duplicateCombinations(characters: List<Character>): Int =
        characters.groupBy { signature(it) }.values.sumOf { max(0, it.size - 1) }

    private fun featureBalanceLabel(characters: List<Character>, targetSize: Int): Pair<String, Double> {
        if (characters.isEmpty()) return "Not enough data" to 1.0
        val deviations = FeaturePool.all.map { feature ->
            val yes = characters.count { it.features[feature.id] == true }
            abs(yes.toDouble() / characters.size - feature.targetRate)
        }
        val avgDeviation = deviations.average()
        val label = when {
            avgDeviation < 0.05 -> "Excellent"
            avgDeviation < 0.10 -> "Good"
            avgDeviation < 0.20 -> "Fair"
            else -> "Poor"
        }
        val score = (1.0 - avgDeviation.coerceIn(0.0, 1.0))
        return label to score
    }

    fun computeQuality(characters: List<Character>, targetSize: Int): BoardQuality {
        val distribution = BalancingService.getFeatureDistribution(characters, targetSize)
        val avgGuesses = averageQuestions(characters, FeaturePool.all)
        val duplicates = duplicateCombinations(characters)
        val (balanceLabel, balanceScore) = featureBalanceLabel(characters, targetSize)
        val remaining = max(0, targetSize - characters.size)

        val idealAvg = if (characters.size > 1) log2(characters.size.toDouble()) else 0.0
        val efficiency = if (idealAvg > 0 && avgGuesses > 0) (idealAvg / avgGuesses).coerceIn(0.0, 1.0) else 1.0
        val duplicateFactor = if (duplicates > 0) max(0.0, 1.0 - duplicates.toDouble() / max(1, characters.size)) else 1.0

        val composite = if (characters.size < 2) {
            1.0
        } else {
            efficiency * 0.4 + balanceScore * 0.4 + duplicateFactor * 0.2
        }
        val stars = (composite * 5).roundToInt().coerceIn(1, 5)

        return BoardQuality(
            starRating = stars,
            averageGuesses = (avgGuesses * 10).roundToInt() / 10.0,
            duplicateCombinations = duplicates,
            featureBalance = balanceLabel,
            remainingUniqueCombinations = remaining,
            distribution = distribution,
        )
    }
}
