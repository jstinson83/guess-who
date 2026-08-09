package com.guesswho.board

import com.guesswho.storage.PortraitStore
import com.guesswho.storage.StoredPortrait

/** In-process [PortraitStore] fake for route tests — no GCP credentials required. */
class InMemoryPortraitStore : PortraitStore {
    private val objects = mutableMapOf<String, StoredPortrait>()

    override suspend fun upload(objectName: String, portrait: StoredPortrait) {
        objects[objectName] = portrait
    }

    override suspend fun fetch(objectName: String): StoredPortrait? = objects[objectName]

    override suspend fun delete(objectName: String) {
        objects.remove(objectName)
    }
}
