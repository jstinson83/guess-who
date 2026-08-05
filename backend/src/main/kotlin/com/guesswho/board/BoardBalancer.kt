package com.guesswho.board

/**
 * Pure functions over [BoardState] — no persistence, no I/O. [addCharacter] returns a
 * new state rather than mutating, so the same functions can drive both a real board
 * (one character at a time, from the UI) and a simulator (many synthetic boards, in
 * a loop, in-memory).
 */
object BoardBalancer {

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

        for (feature in features) {
            if (feature.id !in candidateTraits) continue
            val conflict = feature.exclusiveWith.firstOrNull { it in candidateTraits }
            if (conflict != null) {
                return CandidateScore(
                    balanceScore = 0.0,
                    correlationPenalty = 0.0,
                    overallScore = Double.NEGATIVE_INFINITY,
                    rejected = true,
                    rejectionReason = "'${feature.id}' conflicts with '$conflict'",
                )
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

        val statuses = features.associateWith { statusOf(it, board) }
        val n = board.characters.size

        val balanceScore = features.sumOf { feature ->
            val status = statuses.getValue(feature)
            val targetMid = (status.targetYesRange.first + status.targetYesRange.last) / 2.0
            val deficit = targetMid - status.currentYes
            if (feature.id in candidateTraits) deficit else -deficit
        }

        var correlationPenalty = 0.0
        if (n > 0) {
            val trueIds = candidateTraits.toList()
            for (i in trueIds.indices) {
                for (j in i + 1 until trueIds.size) {
                    val f1 = trueIds[i]
                    val f2 = trueIds[j]
                    val actual = board.characters.count { f1 in it.traits && f2 in it.traits }
                    val rate1 = board.characters.count { f1 in it.traits }.toDouble() / n
                    val rate2 = board.characters.count { f2 in it.traits }.toDouble() / n
                    val expected = n * rate1 * rate2
                    correlationPenalty += maxOf(0.0, actual - expected)
                }
            }
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
}
