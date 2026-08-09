package com.guesswho.storage

import com.google.cloud.storage.BlobId
import com.google.cloud.storage.BlobInfo
import com.google.cloud.storage.Storage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class StoredPortrait(val bytes: ByteArray, val contentType: String)

/** Object storage for portrait images, keyed by an opaque object name chosen by the caller. */
interface PortraitStore {
    suspend fun upload(objectName: String, portrait: StoredPortrait)

    suspend fun fetch(objectName: String): StoredPortrait?

    suspend fun delete(objectName: String)
}

/**
 * Google Cloud Storage's client is blocking, not `ApiFuture`-based like Firestore's, so calls
 * are pushed onto [Dispatchers.IO] rather than bridged through `ApiFuture<T>.await()`.
 */
class GcsPortraitStore(private val storage: Storage, private val bucketName: String) : PortraitStore {

    override suspend fun upload(objectName: String, portrait: StoredPortrait): Unit = withContext(Dispatchers.IO) {
        val blobInfo = BlobInfo.newBuilder(BlobId.of(bucketName, objectName))
            .setContentType(portrait.contentType)
            .build()
        storage.create(blobInfo, portrait.bytes)
        Unit
    }

    override suspend fun fetch(objectName: String): StoredPortrait? = withContext(Dispatchers.IO) {
        val blob = storage.get(BlobId.of(bucketName, objectName)) ?: return@withContext null
        StoredPortrait(blob.getContent(), blob.contentType ?: "application/octet-stream")
    }

    override suspend fun delete(objectName: String): Unit = withContext(Dispatchers.IO) {
        storage.delete(BlobId.of(bucketName, objectName))
        Unit
    }
}
