package com.guesswho.board

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DefaultFeaturePoolTest {

    @Test
    fun `feature ids are unique`() {
        val ids = DefaultFeaturePool.allFeatures().map { it.id }
        assertEquals(ids.size, ids.toSet().size)
    }

    @Test
    fun `target fractions are valid probabilities with lo less than or equal to hi`() {
        for (feature in DefaultFeaturePool.allFeatures()) {
            assertTrue(feature.targetYesFraction.start in 0.0..1.0, "${feature.id} lo out of range")
            assertTrue(feature.targetYesFraction.endInclusive in 0.0..1.0, "${feature.id} hi out of range")
            assertTrue(
                feature.targetYesFraction.start <= feature.targetYesFraction.endInclusive,
                "${feature.id} has lo > hi",
            )
        }
    }

    @Test
    fun `exclusiveWith links are symmetric and point at real feature ids`() {
        val byId = DefaultFeaturePool.allFeatures().associateBy { it.id }
        for (feature in byId.values) {
            for (partnerId in feature.exclusiveWith) {
                val partner = byId[partnerId]
                assertTrue(partner != null, "${feature.id} references unknown feature '$partnerId'")
                assertTrue(
                    feature.id in partner!!.exclusiveWith,
                    "${feature.id} -> $partnerId is not symmetric",
                )
            }
        }
    }
}
