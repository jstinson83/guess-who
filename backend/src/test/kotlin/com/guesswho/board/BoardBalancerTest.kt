package com.guesswho.board

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Small fixed pool (board size 10) so target ranges are easy to hand-verify. */
private object TestPool : FeaturePool {
    private val features = listOf(
        FeatureDef("glasses", "Glasses", Tier.CORE, 0.4..0.6),
        FeatureDef("hat", "Hat", Tier.CORE, 0.3..0.5),
        FeatureDef("beard", "Beard", Tier.CORE, 0.3..0.5),
        FeatureDef("hair_light", "Light hair", Tier.CORE, 0.4..0.6, exclusiveWith = setOf("hair_dark")),
        FeatureDef("hair_dark", "Dark hair", Tier.CORE, 0.4..0.6, exclusiveWith = setOf("hair_light")),
    )

    override fun allFeatures(): List<FeatureDef> = features
}

private fun character(id: String, vararg traits: String) = Character(id, traits.toSet())

class BoardBalancerTest {

    // --- slotsRemaining ---

    @Test
    fun `slotsRemaining counts down as characters are added`() {
        val board = BoardState(targetSize = 10, characters = listOf(character("a"), character("b"), character("c")))
        assertEquals(7, BoardBalancer.slotsRemaining(board))
    }

    @Test
    fun `slotsRemaining never goes negative if board overshoots target`() {
        val board = BoardState(targetSize = 2, characters = listOf(character("a"), character("b"), character("c")))
        assertEquals(0, BoardBalancer.slotsRemaining(board))
    }

    // --- featureCounts ---

    @Test
    fun `featureCounts reports yes-no counts and target range per feature`() {
        val board = BoardState(
            targetSize = 10,
            characters = listOf(
                character("a", "glasses", "hat"),
                character("b", "glasses"),
                character("c"),
            ),
        )

        val statuses = BoardBalancer.featureCounts(board, TestPool).associateBy { it.feature.id }

        val glasses = statuses.getValue("glasses")
        assertEquals(2, glasses.currentYes)
        assertEquals(1, glasses.currentNo)
        assertEquals(4..6, glasses.targetYesRange) // round(0.4*10)..round(0.6*10)
        assertEquals(BalanceState.TOO_FEW, glasses.state)

        val hat = statuses.getValue("hat")
        assertEquals(1, hat.currentYes)
        assertEquals(3..5, hat.targetYesRange)
        assertEquals(BalanceState.TOO_FEW, hat.state)
    }

    // --- availableFeatures ---

    @Test
    fun `availableFeatures blocks a feature once its ceiling is reached`() {
        val board = BoardState(
            targetSize = 10,
            // 6 characters with glasses = the top of the 4..6 target range
            characters = (1..6).map { character("c$it", "glasses") },
        )

        val glasses = BoardBalancer.availableFeatures(board, pool = TestPool).first { it.feature.id == "glasses" }

        assertFalse(glasses.available)
        assertTrue(glasses.reason!!.contains("too many"))
    }

    @Test
    fun `availableFeatures allows a feature below its ceiling`() {
        val board = BoardState(targetSize = 10, characters = listOf(character("a", "glasses")))

        val glasses = BoardBalancer.availableFeatures(board, pool = TestPool).first { it.feature.id == "glasses" }

        assertTrue(glasses.available)
    }

    @Test
    fun `availableFeatures blocks the other half of an exclusive pair already chosen for this character`() {
        val board = BoardState(targetSize = 10, characters = emptyList())

        val darkHair = BoardBalancer
            .availableFeatures(board, traitsSoFarForCharacter = setOf("hair_light"), pool = TestPool)
            .first { it.feature.id == "hair_dark" }

        assertFalse(darkHair.available)
        assertTrue(darkHair.reason!!.contains("conflicts"))
    }

    // --- scoreCandidate: rejection cases ---

    @Test
    fun `scoreCandidate rejects a candidate that sets both sides of an exclusive pair`() {
        val board = BoardState(targetSize = 10, characters = emptyList())

        val score = BoardBalancer.scoreCandidate(board, setOf("hair_light", "hair_dark"), TestPool)

        assertTrue(score.rejected)
        assertEquals(Double.NEGATIVE_INFINITY, score.overallScore)
    }

    @Test
    fun `scoreCandidate rejects a candidate identical to an existing character`() {
        val board = BoardState(targetSize = 10, characters = listOf(character("a", "glasses", "hat")))

        val score = BoardBalancer.scoreCandidate(board, setOf("glasses", "hat"), TestPool)

        assertTrue(score.rejected)
        assertEquals("duplicates an existing character", score.rejectionReason)
    }

    // --- scoreCandidate: balance component ---

    @Test
    fun `scoreCandidate rewards assigning a feature that is under its target and penalizes withholding it`() {
        val onlyGlasses = object : FeaturePool {
            override fun allFeatures() = listOf(FeatureDef("glasses", "Glasses", Tier.CORE, 0.4..0.6))
        }
        val board = BoardState(targetSize = 10, characters = emptyList()) // currentYes = 0, targetMid = 5

        val withGlasses = BoardBalancer.scoreCandidate(board, setOf("glasses"), onlyGlasses)
        val withoutGlasses = BoardBalancer.scoreCandidate(board, emptySet(), onlyGlasses)

        assertEquals(5.0, withGlasses.balanceScore)
        assertEquals(-5.0, withoutGlasses.balanceScore)
        assertTrue(withGlasses.overallScore > withoutGlasses.overallScore)
    }

    @Test
    fun `scoreCandidate penalizes assigning a feature that is already over its target`() {
        val onlyGlasses = object : FeaturePool {
            override fun allFeatures() = listOf(FeatureDef("glasses", "Glasses", Tier.CORE, 0.4..0.6))
        }
        // 8 of 8 characters already have glasses; target midpoint for size 10 is 5, so deficit is negative.
        // Each also gets a unique marker trait (outside the pool) so none of them exactly matches the
        // {"glasses"} candidate below — that would trip the duplicate-character rejection instead.
        val board = BoardState(targetSize = 10, characters = (1..8).map { character("c$it", "glasses", "marker_$it") })

        val withGlasses = BoardBalancer.scoreCandidate(board, setOf("glasses"), onlyGlasses)
        val withoutGlasses = BoardBalancer.scoreCandidate(board, emptySet(), onlyGlasses)

        assertTrue(withGlasses.balanceScore < 0)
        assertTrue(withoutGlasses.balanceScore > 0)
    }

    // --- scoreCandidate: correlation component ---

    @Test
    fun `scoreCandidate penalizes a pair that already co-occurs more than chance predicts`() {
        val pool = object : FeaturePool {
            override fun allFeatures() = listOf(
                FeatureDef("glasses", "Glasses", Tier.CORE, 0.0..1.0),
                FeatureDef("beard", "Beard", Tier.CORE, 0.0..1.0),
            )
        }
        // 3 of 4 characters have both glasses and beard; rate(glasses) = rate(beard) = 0.75,
        // expected co-occurrence = 4 * 0.75 * 0.75 = 2.25, actual = 3, so excess = 0.75.
        // Marker traits keep a/b/c from exactly matching the {"glasses","beard"} candidate below.
        val board = BoardState(
            targetSize = 10,
            characters = listOf(
                character("a", "glasses", "beard", "marker_a"),
                character("b", "glasses", "beard", "marker_b"),
                character("c", "glasses", "beard", "marker_c"),
                character("d"),
            ),
        )

        val score = BoardBalancer.scoreCandidate(board, setOf("glasses", "beard"), pool)

        assertEquals(0.75, score.correlationPenalty, absoluteTolerance = 1e-9)
    }

    @Test
    fun `scoreCandidate applies no correlation penalty for an empty board`() {
        val score = BoardBalancer.scoreCandidate(BoardState(targetSize = 10), setOf("glasses", "beard"), TestPool)
        assertEquals(0.0, score.correlationPenalty)
    }

    // --- suggestFeatures ---

    @Test
    fun `suggestFeatures only ranks available features and respects the limit`() {
        // glasses is already at its ceiling (6 of 4..6) and should be excluded entirely.
        val board = BoardState(targetSize = 10, characters = (1..6).map { character("c$it", "glasses") })

        val suggestions = BoardBalancer.suggestFeatures(board, limit = 2, pool = TestPool)

        assertTrue(suggestions.none { it.feature.id == "glasses" })
        assertTrue(suggestions.size <= 2)
        // scores should be sorted descending
        assertTrue(suggestions.zipWithNext().all { (a, b) -> a.score.overallScore >= b.score.overallScore })
    }

    // --- addCharacter ---

    @Test
    fun `addCharacter returns a new board without mutating the original`() {
        val original = BoardState(targetSize = 10, characters = listOf(character("a", "glasses")))

        val updated = BoardBalancer.addCharacter(original, character("b", "hat"))

        assertEquals(1, original.characters.size)
        assertEquals(2, updated.characters.size)
        assertEquals(listOf("a", "b"), updated.characters.map { it.id })
    }
}

private fun assertEquals(expected: Double, actual: Double, absoluteTolerance: Double) {
    assertTrue(
        kotlin.math.abs(expected - actual) <= absoluteTolerance,
        "Expected $actual to be within $absoluteTolerance of $expected",
    )
}
