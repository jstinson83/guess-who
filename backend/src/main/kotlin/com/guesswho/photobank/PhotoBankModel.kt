package com.guesswho.photobank

/**
 * A real person's own photo in the board-agnostic photo library, plus the features
 * [com.guesswho.board.TraitDetection] found in it. [bankId] is carried on every photo even though
 * only one bank (`"default"`) exists today, so a future multi-bank feature is a query filter, not
 * a schema migration — see `.claude/current.md`'s Photo Library chunk plan.
 */
data class PhotoBankPhoto(
    val id: String,
    val bankId: String,
    val detectedFeatures: Set<String> = emptySet(),
    val createdAt: String = "",
)
