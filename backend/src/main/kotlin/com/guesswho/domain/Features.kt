package com.guesswho.domain

import kotlinx.serialization.Serializable

@Serializable
enum class FeatureCategory {
    Accessories,
    Hair,
    Face,
    FacialHair,
    Clothing,
}

/**
 * A single feature in the controlled pool. Every feature maps to a natural
 * "Do they have...?" Guess Who question. [targetRate] is the fraction of a
 * board that should ideally carry the feature, used by [com.guesswho.service.BalancingService]
 * to keep boards fair and free of near-duplicate characters.
 */
@Serializable
data class FeatureDef(
    val id: String,
    val label: String,
    val category: FeatureCategory,
    val question: String,
    val targetRate: Double,
)

object FeaturePool {
    val all: List<FeatureDef> = listOf(
        // Accessories
        FeatureDef("glasses", "Glasses", FeatureCategory.Accessories, "Do they wear glasses?", 0.5),
        FeatureDef("sunglasses", "Sunglasses", FeatureCategory.Accessories, "Do they wear sunglasses?", 0.25),
        FeatureDef("hat", "Hat", FeatureCategory.Accessories, "Are they wearing a hat?", 0.33),
        FeatureDef("bow", "Bow", FeatureCategory.Accessories, "Do they wear a bow?", 0.2),
        FeatureDef("earrings", "Earrings", FeatureCategory.Accessories, "Do they have earrings?", 0.4),
        FeatureDef("necklace", "Necklace", FeatureCategory.Accessories, "Do they wear a necklace?", 0.3),
        FeatureDef("tie", "Tie", FeatureCategory.Accessories, "Do they wear a tie?", 0.25),
        FeatureDef("bowtie", "Bow tie", FeatureCategory.Accessories, "Do they wear a bow tie?", 0.2),

        // Hair
        FeatureDef("long-hair", "Long hair", FeatureCategory.Hair, "Do they have long hair?", 0.42),
        FeatureDef("curly-hair", "Curly hair", FeatureCategory.Hair, "Do they have curly hair?", 0.3),
        FeatureDef("bald", "Bald", FeatureCategory.Hair, "Are they bald?", 0.2),
        FeatureDef("ponytail", "Ponytail", FeatureCategory.Hair, "Do they have a ponytail?", 0.25),
        FeatureDef("afro", "Afro", FeatureCategory.Hair, "Do they have an afro?", 0.15),
        FeatureDef("mohawk", "Mohawk", FeatureCategory.Hair, "Do they have a mohawk?", 0.1),

        // Face
        FeatureDef("big-nose", "Big nose", FeatureCategory.Face, "Do they have a big nose?", 0.3),
        FeatureDef("big-ears", "Big ears", FeatureCategory.Face, "Do they have big ears?", 0.3),
        FeatureDef("thick-eyebrows", "Thick eyebrows", FeatureCategory.Face, "Do they have thick eyebrows?", 0.35),
        FeatureDef("freckles", "Freckles", FeatureCategory.Face, "Do they have freckles?", 0.25),
        FeatureDef("dimples", "Dimples", FeatureCategory.Face, "Do they have dimples?", 0.25),
        FeatureDef("rosy-cheeks", "Rosy cheeks", FeatureCategory.Face, "Do they have rosy cheeks?", 0.2),
        FeatureDef("chin-cleft", "Chin cleft", FeatureCategory.Face, "Do they have a cleft chin?", 0.2),

        // Facial Hair
        FeatureDef("mustache", "Mustache", FeatureCategory.FacialHair, "Do they have a mustache?", 0.25),
        FeatureDef("beard", "Beard", FeatureCategory.FacialHair, "Do they have a beard?", 0.25),
        FeatureDef("goatee", "Goatee", FeatureCategory.FacialHair, "Do they have a goatee?", 0.2),
        FeatureDef("sideburns", "Sideburns", FeatureCategory.FacialHair, "Do they have sideburns?", 0.2),

        // Clothing
        FeatureDef("hoodie", "Hoodie", FeatureCategory.Clothing, "Are they wearing a hoodie?", 0.3),
        FeatureDef("suit", "Suit", FeatureCategory.Clothing, "Are they wearing a suit?", 0.25),
        FeatureDef("scarf", "Scarf", FeatureCategory.Clothing, "Are they wearing a scarf?", 0.2),
        FeatureDef("vest", "Vest", FeatureCategory.Clothing, "Are they wearing a vest?", 0.2),
        FeatureDef("bright-sweater", "Bright sweater", FeatureCategory.Clothing, "Are they wearing a bright sweater?", 0.25),
    )

    val byId: Map<String, FeatureDef> = all.associateBy { it.id }

    const val DEFAULT_TARGET_SIZE = 24
}
