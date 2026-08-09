package com.guesswho.photobank

import com.guesswho.storage.StoredPortrait
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger

/** In-process [PhotoBankRepository] fake for tests — no GCP credentials required. */
class InMemoryPhotoBankRepository : PhotoBankRepository {
    private val nextId = AtomicInteger(1)
    private val photos = linkedMapOf<String, PhotoBankPhoto>()
    private val images = mutableMapOf<String, StoredPortrait>()

    override suspend fun addPhoto(bankId: String, detectedFeatures: Set<String>, image: StoredPortrait): PhotoBankPhoto {
        val photo = PhotoBankPhoto(
            id = "photo-${nextId.getAndIncrement()}",
            bankId = bankId,
            detectedFeatures = detectedFeatures,
            createdAt = Instant.now().toString(),
        )
        photos[photo.id] = photo
        images[photo.id] = image
        return photo
    }

    override suspend fun listPhotos(bankId: String): List<PhotoBankPhoto> =
        photos.values.filter { it.bankId == bankId }.sortedByDescending { it.createdAt }

    override suspend fun getPhoto(bankId: String, photoId: String): PhotoBankPhoto? =
        photos[photoId]?.takeIf { it.bankId == bankId }

    override suspend fun getPhotoImage(bankId: String, photoId: String): StoredPortrait? {
        getPhoto(bankId, photoId) ?: return null
        return images[photoId]
    }

    override suspend fun deletePhoto(bankId: String, photoId: String): Boolean {
        if (getPhoto(bankId, photoId) == null) return false
        photos.remove(photoId)
        images.remove(photoId)
        return true
    }
}
