package com.guesswho.board

import com.guesswho.photobank.PhotoBankPhoto
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private fun photo(id: String, vararg detected: String) = PhotoBankPhoto(id = id, bankId = "default", detectedFeatures = detected.toSet())

class RandomBoardGeneratorTest {

    @Test
    fun `keeps a photo's detected traits when the board has room and pads up to at least MIN`() {
        val board = BoardState(targetSize = 24)
        val plans = RandomBoardGenerator.plan(board, listOf(photo("p1", "glasses", "hat")), random = Random(1))

        val plan = plans.single()
        assertTrue("glasses" in plan.traits)
        assertTrue("hat" in plan.traits)
        assertTrue(plan.droppedDetectedTraits.isEmpty())
        assertTrue(plan.traits.size in BoardBalancer.MIN_TRAITS_PER_CHARACTER..BoardBalancer.MAX_TRAITS_PER_CHARACTER)
    }

    @Test
    fun `drops a detected trait once the board's quota for it is already full`() {
        // big_nose targets 5..8 of 24 (DefaultFeaturePool) — eight existing characters with it
        // pins currentYes at the top of its range, so a ninth can't take it.
        val maxedCharacters = (1..8).map { Character(id = "c$it", traits = setOf("big_nose")) }
        val board = BoardState(targetSize = 24, characters = maxedCharacters)

        val plans = RandomBoardGenerator.plan(board, listOf(photo("p1", "big_nose", "glasses")), random = Random(1))

        val plan = plans.single()
        assertTrue("big_nose" in plan.droppedDetectedTraits)
        assertTrue("big_nose" !in plan.traits)
        assertTrue("glasses" in plan.traits)
    }

    @Test
    fun `drops one side of an exclusive pair if a photo somehow detects both`() {
        val board = BoardState(targetSize = 24)
        val plans = RandomBoardGenerator.plan(board, listOf(photo("p1", "hair_light", "hair_dark")), random = Random(1))

        val plan = plans.single()
        val keptCount = setOf("hair_light", "hair_dark").count { it in plan.traits }
        assertEquals(1, keptCount)
        assertEquals(1, plan.droppedDetectedTraits.size)
    }

    @Test
    fun `never exceeds MAX_TRAITS_PER_CHARACTER even if a photo detects the whole pool`() {
        val board = BoardState(targetSize = 24)
        val allIds = DefaultFeaturePool.allFeatures().map { it.id }.toTypedArray()
        val plans = RandomBoardGenerator.plan(board, listOf(photo("p1", *allIds)), random = Random(1))

        assertTrue(plans.single().traits.size <= BoardBalancer.MAX_TRAITS_PER_CHARACTER)
    }

    @Test
    fun `skips a photo entirely if the board can't offer it enough available features`() {
        // Every feature maxed out (mirrors five characters covering the whole CORE/SECONDARY
        // pool) leaves nothing available to pad a bare photo up to MIN.
        val maxedCharacters = (1..24).map { Character(id = "c$it", traits = DefaultFeaturePool.allFeatures().map { it.id }.toSet()) }
        val board = BoardState(targetSize = 24, characters = maxedCharacters)

        val plans = RandomBoardGenerator.plan(board, listOf(photo("p1")), random = Random(1))

        assertTrue(plans.isEmpty())
    }

    @Test
    fun `plans at most as many characters as slots remaining`() {
        val board = BoardState(targetSize = 2, characters = listOf(Character(id = "existing", traits = setOf("glasses"))))
        val photos = (1..5).map { photo("p$it", "glasses") }

        val plans = RandomBoardGenerator.plan(board, photos, random = Random(1))

        assertEquals(1, plans.size)
    }

    @Test
    fun `an empty photo list plans nothing`() {
        val board = BoardState(targetSize = 24)
        assertTrue(RandomBoardGenerator.plan(board, emptyList(), random = Random(1)).isEmpty())
    }

    @Test
    fun `spreads reuse evenly across many more characters than distinct photos`() {
        // Mirrors how BoardRoutes.kt's runOneRandomStep drives this one character at a time,
        // feeding each planned character's sourcePhotoId back into the board before the next
        // round — three photos, twelve characters, so each photo should back exactly four.
        val photos = (1..3).map { photo("p$it", "glasses") }
        var board = BoardState(targetSize = 12)

        repeat(12) { round ->
            val plan = RandomBoardGenerator.plan(board, photos, random = Random(round)).first()
            board = board.copy(
                characters = board.characters + Character(id = "c$round", traits = plan.traits, sourcePhotoId = plan.photo.id),
            )
        }

        val usageCounts = board.characters.groupingBy { it.sourcePhotoId }.eachCount()
        assertEquals(setOf("p1", "p2", "p3"), usageCounts.keys)
        assertTrue(usageCounts.values.all { it == 4 })
    }
}
