package com.guesswho.board

import com.guesswho.storage.StoredPortrait

/**
 * Persistence for boards and their characters. [addCharacter] and [completeBoard] return the
 * full updated [BoardState] (rather than just the changed piece) so a route handler can respond
 * with one consistent board snapshot — including [BoardBalancer]-derived fields the caller
 * layers on top — without a second read.
 *
 * Portrait bytes are stored separately from the [BoardState]/[Character] shape returned here —
 * [Character.hasPortrait] just says whether one exists; fetch the bytes via
 * [getCharacterPortrait].
 */
interface BoardRepository {
    suspend fun createBoard(name: String, targetSize: Int): BoardState

    suspend fun listBoards(): List<BoardSummary>

    suspend fun getBoard(id: String): BoardState?

    suspend fun addCharacter(
        boardId: String,
        name: String,
        traits: Set<String>,
        portrait: StoredPortrait?,
        sourcePhotoId: String? = null,
    ): BoardState?

    suspend fun getCharacterPortrait(boardId: String, characterId: String): StoredPortrait?

    suspend fun completeBoard(id: String): BoardState?

    /** Marks a freshly-created board as mid random-fill (see [BoardStatus.GENERATING]) — called
     * once, right before the background job in `POST /api/boards/random` starts adding
     * characters. */
    suspend fun startGenerating(id: String): BoardState?

    /** Flips a [BoardStatus.GENERATING] board back to [BoardStatus.IN_PROGRESS] once the
     * background job stops, whether it filled the board completely ([error] null) or not
     * (e.g. the photo library ran out of usable photos, or a Gemini call failed). */
    suspend fun stopGenerating(id: String, error: String?): BoardState?
}
