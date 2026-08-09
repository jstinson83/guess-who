package com.guesswho.photobank

import com.google.cloud.firestore.DocumentSnapshot
import com.google.cloud.firestore.Firestore
import com.google.cloud.firestore.Query
import com.guesswho.board.await
import com.guesswho.storage.PortraitStore
import com.guesswho.storage.StoredPortrait
import java.time.Instant

/**
 * Photos live in a single top-level `photoBankPhotos` collection, filtered by [PhotoBankPhoto.bankId],
 * rather than nested under a `photoBanks/{bankId}` document — there's only one bank (hardcoded
 * `"default"`, chosen by the caller) today, but every photo document already carries its own
 * `bankId` field so a future multi-bank feature is a `whereEqualTo` filter, not a schema
 * migration.
 *
 * Image bytes live in [portraitStore] (Cloud Storage) at `photobank/{bankId}/{photoId}`, not
 * inline on the Firestore document — same reasoning as `FirestoreBoardRepository`'s character
 * portraits.
 */
class FirestorePhotoBankRepository(
    private val db: Firestore,
    private val portraitStore: PortraitStore,
) : PhotoBankRepository {

    private val photos = db.collection("photoBankPhotos")

    private fun imageObjectName(bankId: String, photoId: String) = "photobank/$bankId/$photoId"

    override suspend fun addPhoto(bankId: String, detectedFeatures: Set<String>, image: StoredPortrait): PhotoBankPhoto {
        val ref = photos.document()
        portraitStore.upload(imageObjectName(bankId, ref.id), image)

        val now = Instant.now().toString()
        ref.set(
            mapOf(
                "bankId" to bankId,
                "detectedFeatures" to detectedFeatures.toList(),
                "createdAt" to now,
            ),
        ).await()

        return PhotoBankPhoto(id = ref.id, bankId = bankId, detectedFeatures = detectedFeatures, createdAt = now)
    }

    override suspend fun listPhotos(bankId: String): List<PhotoBankPhoto> =
        photos.whereEqualTo("bankId", bankId)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .get().await()
            .documents.map { it.toPhoto() }

    override suspend fun getPhoto(bankId: String, photoId: String): PhotoBankPhoto? {
        val doc = photos.document(photoId).get().await()
        if (!doc.exists() || doc.getString("bankId") != bankId) return null
        return doc.toPhoto()
    }

    override suspend fun getPhotoImage(bankId: String, photoId: String): StoredPortrait? {
        getPhoto(bankId, photoId) ?: return null
        return portraitStore.fetch(imageObjectName(bankId, photoId))
    }

    override suspend fun deletePhoto(bankId: String, photoId: String): Boolean {
        if (getPhoto(bankId, photoId) == null) return false
        portraitStore.delete(imageObjectName(bankId, photoId))
        photos.document(photoId).delete().await()
        return true
    }

    private fun DocumentSnapshot.toPhoto() = PhotoBankPhoto(
        id = id,
        bankId = getString("bankId") ?: "",
        detectedFeatures = (get("detectedFeatures") as? List<*>)?.filterIsInstance<String>()?.toSet() ?: emptySet(),
        createdAt = getString("createdAt") ?: "",
    )
}
