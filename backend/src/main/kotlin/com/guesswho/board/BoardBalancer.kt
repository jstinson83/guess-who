package com.guesswho.board

/**
 * Pure functions over [BoardState] — no persistence, no I/O. [addCharacter] returns a
 * new state rather than mutating, so the same functions can drive both a real board
 * (one character at a time, from the UI) and a simulator (many synthetic boards, in
 * a loop, in-memory).
 */
object BoardBalancer {

    /** A character with too few traits is hard to distinguish from others; too many makes
     * every guess trivial. Flat numbers rather than derived from board size or pool size —
     * see the maintainer discussion that settled on this instead of a computed value. */
    const val MIN_TRAITS_PER_CHARACTER = 5
    const val MAX_TRAITS_PER_CHARACTER = 8

    fun slotsRemaining(board: BoardState): Int =
        (board.targetSize - board.characters.size).coerceAtLeast(0)

    fun featureCounts(board: BoardState, pool: FeaturePool = DefaultFeaturePool): List<FeatureStatus> =
        pool.allFeatures().map { feature -> statusOf(feature, board) }

    /**
     * Hard-block only: features that must not be offered for the next character at
     * all, as opposed to features that are merely undesirable (that's [scoreCandidate]
     * / [suggestFeatures]). Two reasons a feature is blocked:
     *  - it already conflicts with a feature already chosen for this same character
     *    (an exclusive-pair partner)
     *  - its "yes" count has already reached the top of its target range, so adding
     *    another "yes" can only push the board further out of range with no way to
     *    take it back later
     */
    fun availableFeatures(
        board: BoardState,
        traitsSoFarForCharacter: Set<String> = emptySet(),
        pool: FeaturePool = DefaultFeaturePool,
    ): List<FeatureAvailability> =
        pool.allFeatures().map { feature ->
            val conflictsWithChoiceSoFar = feature.exclusiveWith.any { it in traitsSoFarForCharacter }
            val status = statusOf(feature, board)
            when {
                conflictsWithChoiceSoFar ->
                    FeatureAvailability(feature, available = false, reason = "conflicts with an already-selected feature for this character")
                status.currentYes >= status.targetYesRange.last ->
                    FeatureAvailability(feature, available = false, reason = "too many characters already have ${feature.label.lowercase()}")
                else -> FeatureAvailability(feature, available = true)
            }
        }

    /**
     * Scores a full proposed trait set for a new character:
     *  - rejects outright if it violates an exclusive pair, or exactly duplicates an
     *    existing character (two characters can't be indistinguishable)
     *  - balanceScore: sum over every feature of how much closer/farther this pick
     *    moves the board from each feature's target midpoint
     *  - correlationPenalty: for every pair of features this candidate sets to true,
     *    how much more than chance they already co-occur on the board — this is what
     *    catches "the glasses people are always the beard people" before it happens
     */
    fun scoreCandidate(
        board: BoardState,
        candidateTraits: Set<String>,
        pool: FeaturePool = DefaultFeaturePool,
        correlationWeight: Double = 1.0,
    ): CandidateScore {
        val features = pool.allFeatures()
        val byId = features.associateBy { it.id }
        val candidateFeatures = candidateTraits.mapNotNull { byId[it] }
        val n = board.characters.size

        // Exclusivity conflicts and correlation are both properties of a *pair* of
        // candidate features, so both are checked in one pass over the candidate's pairs
        // instead of a separate whole-pool scan plus a separate pairwise scan.
        var correlationPenalty = 0.0
        for ((f1, f2) in candidateFeatures.allPairs()) {
            if (f2.id in f1.exclusiveWith) {
                return CandidateScore(
                    balanceScore = 0.0,
                    correlationPenalty = 0.0,
                    overallScore = Double.NEGATIVE_INFINITY,
                    rejected = true,
                    rejectionReason = "'${f1.id}' conflicts with '${f2.id}'",
                )
            }
            if (n > 0) {
                val actual = board.characters.count { f1.id in it.traits && f2.id in it.traits }
                val count1 = board.characters.count { f1.id in it.traits }
                val count2 = board.characters.count { f2.id in it.traits }
                val expected = count1.toDouble() * count2 / n
                correlationPenalty += maxOf(0.0, actual - expected)
            }
        }

        if (board.characters.any { it.traits == candidateTraits }) {
            return CandidateScore(
                balanceScore = 0.0,
                correlationPenalty = 0.0,
                overallScore = Double.NEGATIVE_INFINITY,
                rejected = true,
                rejectionReason = "duplicates an existing character",
            )
        }

        val balanceScore = features.sumOf { feature ->
            val status = statusOf(feature, board)
            val targetMid = (status.targetYesRange.first + status.targetYesRange.last) / 2.0
            val deficit = targetMid - status.currentYes
            if (feature.id in candidateTraits) deficit else -deficit
        }

        return CandidateScore(
            balanceScore = balanceScore,
            correlationPenalty = correlationPenalty,
            overallScore = balanceScore - correlationWeight * correlationPenalty,
        )
    }

    /** Convenience wrapper over [scoreCandidate]: ranks single-feature hypotheticals, not a separate algorithm. */
    fun suggestFeatures(
        board: BoardState,
        limit: Int = 5,
        pool: FeaturePool = DefaultFeaturePool,
        correlationWeight: Double = 1.0,
    ): List<FeatureSuggestion> =
        availableFeatures(board, pool = pool)
            .filter { it.available }
            .map { FeatureSuggestion(it.feature, scoreCandidate(board, setOf(it.feature.id), pool, correlationWeight)) }
            .sortedByDescending { it.score.overallScore }
            .take(limit)

    fun addCharacter(board: BoardState, character: Character): BoardState =
        board.copy(characters = board.characters + character)

    /** First exclusive-pair conflict within a single character's trait set (e.g. long hair
     * + short hair both selected), or null if the set is internally consistent. Server-side
     * backstop for the same rule the features UI enforces interactively. */
    fun exclusivityConflict(traitIds: Set<String>, pool: FeaturePool = DefaultFeaturePool): Pair<FeatureDef, FeatureDef>? {
        val byId = pool.allFeatures().associateBy { it.id }
        val features = traitIds.mapNotNull { byId[it] }
        for ((f1, f2) in features.allPairs()) {
            if (f2.id in f1.exclusiveWith) return f1 to f2
        }
        return null
    }

    private fun statusOf(feature: FeatureDef, board: BoardState): FeatureStatus {
        val yes = board.characters.count { feature.id in it.traits }
        val no = board.characters.size - yes
        val lo = Math.round(feature.targetYesFraction.start * board.targetSize).toInt()
        val hi = Math.round(feature.targetYesFraction.endInclusive * board.targetSize).toInt()
        val range = lo..hi
        val state = when {
            yes < range.first -> BalanceState.TOO_FEW
            yes > range.last -> BalanceState.TOO_MANY
            else -> BalanceState.ON_TARGET
        }
        return FeatureStatus(feature, yes, no, range, state)
    }

    /** Every unordered pair of distinct elements, e.g. [a, b, c] -> (a,b), (a,c), (b,c). */
    private fun <T> List<T>.allPairs(): List<Pair<T, T>> =
        flatMapIndexed { i, first -> drop(i + 1).map { second -> first to second } }
}
