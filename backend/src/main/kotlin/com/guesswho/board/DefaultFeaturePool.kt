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
        FeatureDef("glasses", "Glasses", Tier.CORE, range(10.0, 14.0), groupLabel = "Accessories"),
        FeatureDef("hat", "Hat", Tier.CORE, range(8.0, 12.0), groupLabel = "Accessories"),
        FeatureDef("facial_hair", "Facial hair", Tier.CORE, range(8.0, 12.0), groupLabel = "Hair"),
        FeatureDef("long_hair", "Long hair", Tier.CORE, range(8.0, 12.0), groupLabel = "Hair"),
        FeatureDef("hair_light", "Light hair", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("hair_dark"), groupLabel = "Hair"),
        FeatureDef("hair_dark", "Dark hair", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("hair_light"), groupLabel = "Hair"),
        FeatureDef("eyes_big", "Big eyes", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("eyes_small"), groupLabel = "Facial features"),
        FeatureDef("eyes_small", "Small eyes", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("eyes_big"), groupLabel = "Facial features"),
        FeatureDef("skin_light", "Light skin", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("skin_dark"), groupLabel = "Skin tone"),
        FeatureDef("skin_dark", "Dark skin", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("skin_light"), groupLabel = "Skin tone"),
        FeatureDef("young", "Young", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("old"), groupLabel = "Age"),
        FeatureDef("old", "Old", Tier.CORE, range(10.0, 14.0), exclusiveWith = setOf("young"), groupLabel = "Age"),

        // Tier 2: secondary
        FeatureDef("big_nose", "Big nose", Tier.SECONDARY, range(5.0, 8.0), groupLabel = "Facial features"),
        FeatureDef("big_ears", "Big ears", Tier.SECONDARY, range(4.0, 7.0), groupLabel = "Facial features"),
        FeatureDef("curly_hair", "Curly hair", Tier.SECONDARY, range(4.0, 8.0), groupLabel = "Hair"),
        FeatureDef("earrings", "Earrings", Tier.SECONDARY, range(4.0, 8.0), groupLabel = "Accessories"),
        FeatureDef("mustache", "Mustache", Tier.SECONDARY, range(3.0, 6.0), groupLabel = "Hair"),
        FeatureDef("beard", "Beard", Tier.SECONDARY, range(4.0, 8.0), groupLabel = "Hair"),
        FeatureDef("freckles", "Freckles", Tier.SECONDARY, range(3.0, 6.0), groupLabel = "Facial features"),
        FeatureDef("bald", "Bald", Tier.SECONDARY, range(2.0, 4.0), groupLabel = "Hair"),

        // Tier 3: spice
        FeatureDef("bow_tie", "Bow tie", Tier.SPICE, range(1.0, 3.0), groupLabel = "Accessories"),
        FeatureDef("cowboy_hat", "Cowboy hat", Tier.SPICE, range(1.0, 3.0), groupLabel = "Accessories"),
    )

    override fun allFeatures(): List<FeatureDef> = features
}
