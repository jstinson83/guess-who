package com.guesswho.board

import com.guesswho.storage.StoredPortrait
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger

/** In-process [BoardRepository] fake for route tests — no GCP credentials required. */
class InMemoryBoardRepository : BoardRepository {
    private val nextId = AtomicInteger(1)
    private val boards = linkedMapOf<String, BoardState>()
    private val portraits = mutableMapOf<String, StoredPortrait>()

    override suspend fun createBoard(name: String, targetSize: Int): BoardState {
        val now = Instant.now().toString()
        val board = BoardState(
            targetSize = targetSize,
            id = "board-${nextId.getAndIncrement()}",
            name = name,
            status = BoardStatus.IN_PROGRESS,
            createdAt = now,
            updatedAt = now,
        )
        boards[board.id] = board
        return board
    }

    override suspend fun listBoards(): List<BoardSummary> =
        boards.values.sortedByDescending { it.updatedAt }.map {
            BoardSummary(it.id, it.name, it.targetSize, it.characters.size, it.status, it.updatedAt)
        }

    override suspend fun getBoard(id: String): BoardState? = boards[id]

    override suspend fun addCharacter(
        boardId: String,
        name: String,
        traits: Set<String>,
        portrait: StoredPortrait?,
        sourcePhotoId: String?,
    ): BoardState? {
        val board = boards[boardId] ?: return null
        val characterId = "character-${nextId.getAndIncrement()}"
        val character = Character(
            id = characterId,
            traits = traits,
            name = name,
            hasPortrait = portrait != null,
            sourcePhotoId = sourcePhotoId,
        )
        if (portrait != null) portraits["$boardId/$characterId"] = portrait
        val updated = board.copy(characters = board.characters + character, updatedAt = Instant.now().toString())
        boards[boardId] = updated
        return updated
    }

    override suspend fun getCharacterPortrait(boardId: String, characterId: String): StoredPortrait? =
        portraits["$boardId/$characterId"]

    override suspend fun completeBoard(id: String): BoardState? {
        val board = boards[id] ?: return null
        val updated = board.copy(status = BoardStatus.COMPLETE, updatedAt = Instant.now().toString())
        boards[id] = updated
        return updated
    }
}
