package com.guesswho.board

/**
 * Target ranges transcribed from the maintainer's 24-person board example,
 * expressed as fractions of board size so they scale to other board sizes.
 */
object DefaultFeaturePool : FeaturePool {
    private const val BASE = 24.0

    private fun range(loOf24: Double, hiOf24: Double) = (loOf24 / BASE)..(hiOf24 / BASE)

    private val features = listOf(
        // Tier 1: core
        FeatureDef("glasses", "Glasses", Tier.CORE, range(10.0, 14.0)),
        FeatureDef("hat", "Hat", Tier.CORE, range(8.0, 12.0)),
        FeatureDef("facial_hair", "Facial hair", Tier.CORE, range(8.0, 12.0)),
        FeatureDef("long_hair", "Long hair", Tier.CORE, range(8.0, 12.0)),
        FeatureDef("hair_light", "Light hair", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("hair_dark")),
        FeatureDef("hair_dark", "Dark hair", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("hair_light")),
        FeatureDef("eyes_big", "Big eyes", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("eyes_small")),
        FeatureDef("eyes_small", "Small eyes", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("eyes_big")),

        // Tier 2: secondary
        FeatureDef("big_nose", "Big nose", Tier.SECONDARY, range(5.0, 8.0)),
        FeatureDef("big_ears", "Big ears", Tier.SECONDARY, range(4.0, 7.0)),
        FeatureDef("curly_hair", "Curly hair", Tier.SECONDARY, range(4.0, 8.0)),
        FeatureDef("earrings", "Earrings", Tier.SECONDARY, range(4.0, 8.0)),
        FeatureDef("mustache", "Mustache", Tier.SECONDARY, range(3.0, 6.0)),
        FeatureDef("beard", "Beard", Tier.SECONDARY, range(4.0, 8.0)),
        FeatureDef("freckles", "Freckles", Tier.SECONDARY, range(3.0, 6.0)),
        FeatureDef("bald", "Bald", Tier.SECONDARY, range(2.0, 4.0)),

        // Tier 3: spice
        FeatureDef("bow_tie", "Bow tie", Tier.SPICE, range(1.0, 3.0)),
        FeatureDef("cowboy_hat", "Cowboy hat", Tier.SPICE, range(1.0, 3.0)),
        FeatureDef("scar", "Scar", Tier.SPICE, range(1.0, 2.0)),
        FeatureDef("giant_eyebrows", "Giant eyebrows", Tier.SPICE, range(2.0, 4.0)),
        FeatureDef("weird_hairstyle", "Weird hairstyle", Tier.SPICE, range(1.0, 3.0)),
    )

    override fun allFeatures(): List<FeatureDef> = features
}
