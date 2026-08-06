package com.guesswho.board

import com.google.cloud.firestore.DocumentSnapshot
import com.google.cloud.firestore.Firestore
import com.google.cloud.firestore.Query
import com.google.cloud.firestore.QueryDocumentSnapshot
import java.time.Instant

/**
 * Boards live in a `boards` collection, one document per board; characters live in a
 * `characters` subcollection per board rather than a top-level collection, since every read
 * pattern we have (board detail, add-character) is scoped to a single board and a subcollection
 * lets Firestore's security rules and indexes reflect that scoping directly.
 *
 * `characterCount` is denormalized onto the board document (kept in step by [addCharacter]) so
 * [listBoards] can render progress ("3/12") without an N+1 read of every board's characters.
 */
class FirestoreBoardRepository(private val db: Firestore) : BoardRepository {

    private val boards = db.collection("boards")

    override suspend fun createBoard(name: String, category: String, targetSize: Int): BoardState {
        val ref = boards.document()
        val now = Instant.now().toString()
        ref.set(
            mapOf(
                "name" to name,
                "category" to category,
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
            category = category,
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
        portraitDataUrl: String?,
    ): BoardState? {
        val boardRef = boards.document(boardId)
        if (!boardRef.get().await().exists()) return null

        val charactersRef = boardRef.collection("characters")
        val position = charactersRef.get().await().size()
        val now = Instant.now().toString()

        charactersRef.document().set(
            mapOf(
                "name" to name,
                "traits" to traits.toList(),
                "portraitDataUrl" to portraitDataUrl,
                "position" to position.toLong(),
                "createdAt" to now,
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

    private fun DocumentSnapshot.toBoardState(characters: List<Character>) = BoardState(
        targetSize = (getLong("targetSize") ?: 0L).toInt(),
        characters = characters,
        id = id,
        name = getString("name") ?: "",
        category = getString("category") ?: "Custom",
        status = parseStatus(getString("status")),
        createdAt = getString("createdAt") ?: "",
        updatedAt = getString("updatedAt") ?: "",
    )

    private fun DocumentSnapshot.toBoardSummary() = BoardSummary(
        id = id,
        name = getString("name") ?: "",
        category = getString("category") ?: "Custom",
        targetSize = (getLong("targetSize") ?: 0L).toInt(),
        characterCount = (getLong("characterCount") ?: 0L).toInt(),
        status = parseStatus(getString("status")),
        updatedAt = getString("updatedAt") ?: "",
    )

    private fun QueryDocumentSnapshot.toCharacter() = Character(
        id = id,
        traits = (get("traits") as? List<*>)?.filterIsInstance<String>()?.toSet() ?: emptySet(),
        name = getString("name") ?: "",
        portraitDataUrl = getString("portraitDataUrl"),
    )

    private fun parseStatus(raw: String?): BoardStatus =
        runCatching { BoardStatus.valueOf(raw ?: "") }.getOrDefault(BoardStatus.IN_PROGRESS)
}
