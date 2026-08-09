package com.guesswho.photobank

import com.guesswho.storage.StoredPortrait

/**
 * Persistence for the board-agnostic photo library: real people's own photos plus their detected
 * features, kept separate from any board so the same photo can later be picked as a source for
 * multiple boards' add-character flows (see `.claude/current.md`'s Photo Library chunk plan).
 * Mirrors [com.guesswho.board.BoardRepository]'s split between metadata (returned here) and image
 * bytes ([StoredPortrait], fetched separately via [getPhotoImage]) — a data-URL-sized image blows
 * past Firestore's 1 MiB per-document cap.
 *
 * Deleting a photo only affects future picks, never characters already created from it — each
 * character already holds its own independent portrait + traits.
 */
interface PhotoBankRepository {
    suspend fun addPhoto(bankId: String, detectedFeatures: Set<String>, image: StoredPortrait): PhotoBankPhoto

    suspend fun listPhotos(bankId: String): List<PhotoBankPhoto>

    suspend fun getPhoto(bankId: String, photoId: String): PhotoBankPhoto?

    suspend fun getPhotoImage(bankId: String, photoId: String): StoredPortrait?

    suspend fun deletePhoto(bankId: String, photoId: String): Boolean
}
