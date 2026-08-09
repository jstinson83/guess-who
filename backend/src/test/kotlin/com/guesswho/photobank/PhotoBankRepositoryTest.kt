package com.guesswho.photobank

import com.guesswho.storage.StoredPortrait
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Exercises [PhotoBankRepository] against its [InMemoryPhotoBankRepository] fake — Chunk 1 of the
 * Photo Library plan has no HTTP routes yet, so this is the repository's only coverage for now.
 */
class PhotoBankRepositoryTest {

    private fun image() = StoredPortrait(byteArrayOf(1, 2, 3), "image/jpeg")

    @Test
    fun `add then list returns the photo with its detected features`() = runBlocking {
        val repo: PhotoBankRepository = InMemoryPhotoBankRepository()

        val added = repo.addPhoto("default", setOf("glasses", "hat"), image())

        assertEquals(setOf("glasses", "hat"), added.detectedFeatures)
        assertEquals("default", added.bankId)
        assertEquals(listOf(added), repo.listPhotos("default"))
    }

    @Test
    fun `get and delete are scoped to the given bank`() = runBlocking {
        val repo: PhotoBankRepository = InMemoryPhotoBankRepository()
        val photo = repo.addPhoto("default", emptySet(), image())

        assertNull(repo.getPhoto("other-bank", photo.id))
        assertTrue(repo.listPhotos("other-bank").isEmpty())
        assertEquals(false, repo.deletePhoto("other-bank", photo.id))

        assertEquals(photo, repo.getPhoto("default", photo.id))
    }

    @Test
    fun `getPhotoImage returns the stored image bytes`() = runBlocking {
        val repo: PhotoBankRepository = InMemoryPhotoBankRepository()
        val stored = image()
        val photo = repo.addPhoto("default", setOf("beard"), stored)

        assertEquals(stored, repo.getPhotoImage("default", photo.id))
    }

    @Test
    fun `deleting a photo removes it and its image`() = runBlocking {
        val repo: PhotoBankRepository = InMemoryPhotoBankRepository()
        val photo = repo.addPhoto("default", emptySet(), image())

        assertTrue(repo.deletePhoto("default", photo.id))

        assertNull(repo.getPhoto("default", photo.id))
        assertNull(repo.getPhotoImage("default", photo.id))
        assertTrue(repo.listPhotos("default").isEmpty())
    }

    @Test
    fun `deleting an unknown photo returns false`() = runBlocking {
        val repo: PhotoBankRepository = InMemoryPhotoBankRepository()

        assertEquals(false, repo.deletePhoto("default", "no-such-photo"))
    }
}
