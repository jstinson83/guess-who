package com.guesswho.board

import com.google.cloud.firestore.DocumentSnapshot
import com.google.cloud.firestore.Firestore
import com.google.cloud.firestore.Query
import com.google.cloud.firestore.QueryDocumentSnapshot
import com.guesswho.storage.PortraitStore
import com.guesswho.storage.StoredPortrait
import java.time.Instant

/**
 * Boards live in a `boards` collection, one document per board; characters live in a
 * `characters` subcollection per board rather than a top-level collection, since every read
 * pattern we have (board detail, add-character) is scoped to a single board and a subcollection
 * lets Firestore's security rules and indexes reflect that scoping directly.
 *
 * `characterCount` is denormalized onto the board document (kept in step by [addCharacter]) so
 * [listBoards] can render progress ("3/12") without an N+1 read of every board's characters.
 *
 * Portrait image bytes live in [portraitStore] (Cloud Storage), not inline on the Firestore
 * document — a data-URL-sized image can exceed Firestore's 1 MiB per-document cap. The document
 * only stores [Character.hasPortrait]; the object name is derived deterministically from the
 * board and character ids (see [portraitObjectName]) rather than stored, so there's nothing to
 * keep in sync.
 */
class FirestoreBoardRepository(
    private val db: Firestore,
    private val portraitStore: PortraitStore,
) : BoardRepository {

    private val boards = db.collection("boards")

    private fun portraitObjectName(boardId: String, characterId: String) = "boards/$boardId/characters/$characterId"

    override suspend fun createBoard(name: String, targetSize: Int): BoardState {
        val ref = boards.document()
        val now = Instant.now().toString()
        ref.set(
            mapOf(
                "name" to name,
                "targetSize" to targetSize.toLong(),
                "characterCount" to 0L,
                "status" to BoardStatus.IN_PROGRESS.name,
                "createdAt" to now,
                "updatedAt" to now,
            ),
        ).await()

        return BoardState(
            targetSize = targetSize,
            id = ref.id,
            name = name,
            status = BoardStatus.IN_PROGRESS,
            createdAt = now,
            updatedAt = now,
        )
    }

    override suspend fun listBoards(): List<BoardSummary> =
        boards.orderBy("updatedAt", Query.Direction.DESCENDING).get().await()
            .documents.map { it.toBoardSummary() }

    override suspend fun getBoard(id: String): BoardState? {
        val boardDoc = boards.document(id).get().await()
        if (!boardDoc.exists()) return null

        val characters = boards.document(id).collection("characters")
            .orderBy("position")
            .get().await()
            .documents.map { it.toCharacter() }

        return boardDoc.toBoardState(characters)
    }

    override suspend fun addCharacter(
        boardId: String,
        name: String,
        traits: Set<String>,
        portrait: StoredPortrait?,
        sourcePhotoId: String?,
    ): BoardState? {
        val boardRef = boards.document(boardId)
        if (!boardRef.get().await().exists()) return null

        val charactersRef = boardRef.collection("characters")
        val position = charactersRef.get().await().size()
        val now = Instant.now().toString()

        // Allocated up front (rather than letting .set() assign an id) so the object name below
        // can be derived from it before the Firestore write happens.
        val characterRef = charactersRef.document()
        if (portrait != null) {
            portraitStore.upload(portraitObjectName(boardId, characterRef.id), portrait)
        }

        characterRef.set(
            mapOf(
                "name" to name,
                "traits" to traits.toList(),
                "hasPortrait" to (portrait != null),
                "position" to position.toLong(),
                "createdAt" to now,
                "sourcePhotoId" to sourcePhotoId,
            ),
        ).await()

        boardRef.update(
            mapOf(
                "characterCount" to (position + 1).toLong(),
                "updatedAt" to now,
            ),
        ).await()

        return getBoard(boardId)
    }

    override suspend fun getCharacterPortrait(boardId: String, characterId: String): StoredPortrait? =
        portraitStore.fetch(portraitObjectName(boardId, characterId))

    override suspend fun completeBoard(id: String): BoardState? {
        val boardRef = boards.document(id)
        if (!boardRef.get().await().exists()) return null

        boardRef.update(
            mapOf(
                "status" to BoardStatus.COMPLETE.name,
                "updatedAt" to Instant.now().toString(),
            ),
        ).await()

        return getBoard(id)
    }

    override suspend fun startGenerating(id: String): BoardState? {
        val boardRef = boards.document(id)
        if (!boardRef.get().await().exists()) return null

        boardRef.update(
            mapOf(
                "status" to BoardStatus.GENERATING.name,
                "generationError" to null,
                "updatedAt" to Instant.now().toString(),
            ),
        ).await()

        return getBoard(id)
    }

    override suspend fun stopGenerating(id: String, error: String?): BoardState? {
        val boardRef = boards.document(id)
        if (!boardRef.get().await().exists()) return null

        boardRef.update(
            mapOf(
                "status" to BoardStatus.IN_PROGRESS.name,
                "generationError" to error,
                "updatedAt" to Instant.now().toString(),
            ),
        ).await()

        return getBoard(id)
    }

    private fun DocumentSnapshot.toBoardState(characters: List<Character>) = BoardState(
        targetSize = (getLong("targetSize") ?: 0L).toInt(),
        characters = characters,
        id = id,
        name = getString("name") ?: "",
        status = parseStatus(getString("status")),
        createdAt = getString("createdAt") ?: "",
        updatedAt = getString("updatedAt") ?: "",
        generationError = getString("generationError"),
    )

    private fun DocumentSnapshot.toBoardSummary() = BoardSummary(
        id = id,
        name = getString("name") ?: "",
        targetSize = (getLong("targetSize") ?: 0L).toInt(),
        characterCount = (getLong("characterCount") ?: 0L).toInt(),
        status = parseStatus(getString("status")),
        updatedAt = getString("updatedAt") ?: "",
    )

    private fun QueryDocumentSnapshot.toCharacter() = Character(
        id = id,
        traits = (get("traits") as? List<*>)?.filterIsInstance<String>()?.toSet() ?: emptySet(),
        name = getString("name") ?: "",
        hasPortrait = getBoolean("hasPortrait") ?: false,
        sourcePhotoId = getString("sourcePhotoId"),
    )

    private fun parseStatus(raw: String?): BoardStatus =
        runCatching { BoardStatus.valueOf(raw ?: "") }.getOrDefault(BoardStatus.IN_PROGRESS)
}
