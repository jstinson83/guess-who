package com.guesswho.board

/**
 * Persistence for boards and their characters. [addCharacter] and [completeBoard] return the
 * full updated [BoardState] (rather than just the changed piece) so a route handler can respond
 * with one consistent board snapshot — including [BoardBalancer]-derived fields the caller
 * layers on top — without a second read.
 */
interface BoardRepository {
    suspend fun createBoard(name: String, targetSize: Int): BoardState

    suspend fun listBoards(): List<BoardSummary>

    suspend fun getBoard(id: String): BoardState?

    suspend fun addCharacter(
        boardId: String,
        name: String,
        traits: Set<String>,
        portraitDataUrl: String?,
    ): BoardState?

    suspend fun completeBoard(id: String): BoardState?
}
