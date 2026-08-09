package com.guesswho.board

import com.guesswho.photobank.PhotoBankPhoto
import kotlin.random.Random

/**
 * One planned character for a random-fill board: which bank photo to use, the final trait set
 * to render, and which of that photo's own [PhotoBankPhoto.detectedFeatures] had to be left out
 * (because the board couldn't take any more of that feature, or it conflicted with another
 * trait already kept for this same character) — the caller passes those back into
 * [com.guesswho.generatePortrait]'s `removeTraitPhrases` so Gemini is told to explicitly leave
 * them out, the same diff the manual add-character flow already sends for a detected-but-
 * unavailable trait.
 */
data class RandomCharacterPlan(
    val photo: PhotoBankPhoto,
    val traits: Set<String>,
    val droppedDetectedTraits: Set<String>,
)

/**
 * Pure planning for "generate a random board from the photo bank" (`POST /api/boards/random` in
 * BoardRoutes.kt) — no I/O, no Gemini calls, no persistence, so it's unit-testable the same way
 * as [BoardBalancer]. The route does the actual per-plan portrait generation and persistence.
 *
 * A bank photo can back more than one character once a board's target size exceeds the bank's
 * size (`BoardRoutes.kt`'s step no longer excludes photos already used by this board) — [plan]
 * spreads that reuse evenly by trying photos in ascending order of how many of [board]'s existing
 * characters already came from them ([Character.sourcePhotoId]), shuffled within each usage tier
 * so it's not deterministic. That keeps every bank photo's usage count within 1 of every other's
 * in the common case, only drifting when a Gemini failure forces `BoardRoutes.kt` to fall back to
 * a candidate further down the list for one step.
 *
 * Policy, in priority order:
 *  1. **Likeness first**: start from what the photo actually shows
 *     ([PhotoBankPhoto.detectedFeatures]), keeping a detected trait only if
 *     [BoardBalancer.availableFeatures] still allows it for this board (not already at quota,
 *     doesn't conflict with another detected trait already kept for this character) and the
 *     character isn't already at [BoardBalancer.MAX_TRAITS_PER_CHARACTER].
 *  2. **Then go wild**: pad with other currently-available features — sampled from the
 *     top few by [BoardBalancer.scoreCandidate] each step rather than always taking the single
 *     best, so a random board doesn't read as mechanically identical every time — up to a
 *     randomly chosen target size between [BoardBalancer.MIN_TRAITS_PER_CHARACTER] and
 *     [BoardBalancer.MAX_TRAITS_PER_CHARACTER]. Real detected traits are never trimmed to make
 *     room for this padding.
 *
 * A photo that still can't reach [BoardBalancer.MIN_TRAITS_PER_CHARACTER] (e.g. most of the
 * pool is already at quota) is skipped rather than forced into an invalid character.
 */
object RandomBoardGenerator {

    fun plan(
        board: BoardState,
        photos: List<PhotoBankPhoto>,
        random: Random = Random.Default,
        pool: FeaturePool = DefaultFeaturePool,
    ): List<RandomCharacterPlan> {
        val byId = pool.allFeatures().associateBy { it.id }
        val usageCounts = board.characters.groupingBy { it.sourcePhotoId }.eachCount()
        var state = board
        val plans = mutableListOf<RandomCharacterPlan>()
        for (photo in photos.shuffled(random).sortedBy { usageCounts[it.id] ?: 0 }) {
            if (plans.size >= BoardBalancer.slotsRemaining(state)) break
            val plan = planCharacter(state, photo, byId, random, pool) ?: continue
            plans += plan
            state = BoardBalancer.addCharacter(state, Character(id = "", traits = plan.traits))
        }
        return plans
    }

    private fun planCharacter(
        board: BoardState,
        photo: PhotoBankPhoto,
        byId: Map<String, FeatureDef>,
        random: Random,
        pool: FeaturePool,
    ): RandomCharacterPlan? {
        val chosen = linkedSetOf<String>()
        val dropped = mutableSetOf<String>()

        for (id in photo.detectedFeatures.shuffled(random)) {
            if (byId[id] == null || chosen.size >= BoardBalancer.MAX_TRAITS_PER_CHARACTER) {
                dropped += id
                continue
            }
            val available = BoardBalancer.availableFeatures(board, chosen, pool).first { it.feature.id == id }.available
            if (available) chosen += id else dropped += id
        }

        val targetCount = random.nextInt(BoardBalancer.MIN_TRAITS_PER_CHARACTER, BoardBalancer.MAX_TRAITS_PER_CHARACTER + 1)
        while (chosen.size < targetCount) {
            val candidates = BoardBalancer.availableFeatures(board, chosen, pool).filter { it.available && it.feature.id !in chosen }
            if (candidates.isEmpty()) break
            val ranked = candidates
                .map { it.feature to BoardBalancer.scoreCandidate(board, chosen + it.feature.id, pool).overallScore }
                .sortedByDescending { it.second }
            chosen += ranked.take(minOf(3, ranked.size)).random(random).first.id
        }

        if (chosen.size < BoardBalancer.MIN_TRAITS_PER_CHARACTER) return null
        return RandomCharacterPlan(photo, chosen.toSet(), dropped)
    }
}
