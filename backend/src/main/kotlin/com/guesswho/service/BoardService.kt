package com.guesswho.service

import com.guesswho.db.BoardsTable
import com.guesswho.db.CharactersTable
import com.guesswho.domain.Board
import com.guesswho.domain.BoardQuality
import com.guesswho.domain.BoardTemplate
import com.guesswho.domain.Character
import com.guesswho.domain.FeatureAvailability
import com.guesswho.domain.FeaturePool
import com.guesswho.domain.FeatureSet
import java.io.File
import java.util.UUID
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update

class FeatureNotAvailableException(message: String) : RuntimeException(message)
class NotFoundException(message: String) : RuntimeException(message)

object BoardService {
    private val json = Json { ignoreUnknownKeys = true }
    val uploadsDir = File("data/uploads")

    fun createBoard(name: String, template: BoardTemplate, targetSize: Int): Board = transaction {
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        BoardsTable.insert {
            it[BoardsTable.id] = id
            it[BoardsTable.name] = name
            it[BoardsTable.template] = template.name
            it[BoardsTable.targetSize] = targetSize
            it[BoardsTable.createdAt] = now
        }
        Board(id, name, template, targetSize, now, emptyList())
    }

    fun listBoards(): List<Board> = transaction {
        BoardsTable.selectAll().orderBy(BoardsTable.createdAt, SortOrder.DESC).map { row ->
            Board(
                id = row[BoardsTable.id],
                name = row[BoardsTable.name],
                template = BoardTemplate.valueOf(row[BoardsTable.template]),
                targetSize = row[BoardsTable.targetSize],
                createdAt = row[BoardsTable.createdAt],
                characters = charactersFor(row[BoardsTable.id]),
            )
        }
    }

    fun getBoard(boardId: String): Board? = transaction {
        val row = BoardsTable.selectAll().where { BoardsTable.id eq boardId }.singleOrNull() ?: return@transaction null
        Board(
            id = row[BoardsTable.id],
            name = row[BoardsTable.name],
            template = BoardTemplate.valueOf(row[BoardsTable.template]),
            targetSize = row[BoardsTable.targetSize],
            createdAt = row[BoardsTable.createdAt],
            characters = charactersFor(boardId),
        )
    }

    private fun charactersFor(boardId: String): List<Character> =
        CharactersTable.selectAll().where { CharactersTable.boardId eq boardId }
            .orderBy(CharactersTable.createdAt, SortOrder.ASC)
            .map { rowToCharacter(it) }

    private fun rowToCharacter(row: org.jetbrains.exposed.sql.ResultRow): Character = Character(
        id = row[CharactersTable.id],
        boardId = row[CharactersTable.boardId],
        name = row[CharactersTable.name],
        sourcePhotoUrl = row[CharactersTable.sourcePhotoUrl],
        portraitUrl = row[CharactersTable.portraitUrl],
        features = json.decodeFromString(row[CharactersTable.featuresJson]),
        createdAt = row[CharactersTable.createdAt],
    )

    private fun requireBoardRow(boardId: String) =
        transaction { BoardsTable.selectAll().where { BoardsTable.id eq boardId }.singleOrNull() }
            ?: throw NotFoundException("Board $boardId not found")

    fun getFeatureAvailability(
        boardId: String,
        selection: FeatureSet,
        excludeCharacterId: String?,
    ): List<FeatureAvailability> {
        val board = getBoard(boardId) ?: throw NotFoundException("Board $boardId not found")
        return BalancingService.getFeatureAvailability(board.characters, board.targetSize, selection, excludeCharacterId)
    }

    fun getQuality(boardId: String): BoardQuality {
        val board = getBoard(boardId) ?: throw NotFoundException("Board $boardId not found")
        return QualityService.computeQuality(board.characters, board.targetSize)
    }

    /**
     * Validates that every feature turned on in [features] is currently
     * available for this board (respecting balancing targets and duplicate
     * prevention), then adds the character.
     */
    fun addCharacter(boardId: String, name: String, features: FeatureSet, photoBytes: ByteArray): Character {
        requireBoardRow(boardId)
        val board = getBoard(boardId)!!

        validateSelection(board.characters, board.targetSize, features, excludeCharacterId = null)

        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        val (sourceUrl, portraitUrl) = storePhotos(boardId, id, photoBytes)

        transaction {
            CharactersTable.insert {
                it[CharactersTable.id] = id
                it[CharactersTable.boardId] = boardId
                it[CharactersTable.name] = name
                it[CharactersTable.sourcePhotoUrl] = sourceUrl
                it[CharactersTable.portraitUrl] = portraitUrl
                it[CharactersTable.featuresJson] = json.encodeToString(features)
                it[CharactersTable.createdAt] = now
            }
        }

        return Character(id, boardId, name, sourceUrl, portraitUrl, features, now)
    }

    fun updateCharacterFeatures(boardId: String, characterId: String, name: String?, features: FeatureSet): Character {
        val board = getBoard(boardId) ?: throw NotFoundException("Board $boardId not found")
        val existing = board.characters.find { it.id == characterId }
            ?: throw NotFoundException("Character $characterId not found")

        validateSelection(board.characters, board.targetSize, features, excludeCharacterId = characterId)

        transaction {
            CharactersTable.update({ CharactersTable.id eq characterId }) {
                if (name != null) it[CharactersTable.name] = name
                it[CharactersTable.featuresJson] = json.encodeToString(features)
            }
        }

        return existing.copy(name = name ?: existing.name, features = features)
    }

    fun deleteCharacter(boardId: String, characterId: String) {
        transaction {
            CharactersTable.deleteWhere { CharactersTable.id eq characterId }
        }
    }

    private fun validateSelection(
        characters: List<Character>,
        targetSize: Int,
        selection: FeatureSet,
        excludeCharacterId: String?,
    ) {
        val others = characters.filter { it.id != excludeCharacterId }

        val duplicate = others.any { BalancingService.featureSetsEqual(selection, it.features) }
        if (duplicate) {
            throw FeatureNotAvailableException("This combination of features would duplicate another character on the board.")
        }

        for (feature in FeaturePool.all) {
            if (selection[feature.id] != true) continue
            val currentCount = others.count { it.features[feature.id] == true }
            val targetCount = BalancingService.targetCountFor(feature, targetSize)
            if (currentCount >= targetCount) {
                throw FeatureNotAvailableException("Feature '${feature.label}' is not available: already at target distribution.")
            }
        }
    }

    private fun storePhotos(boardId: String, characterId: String, photoBytes: ByteArray): Pair<String, String> {
        val dir = File(uploadsDir, boardId)
        dir.mkdirs()

        val sourceFile = File(dir, "$characterId-source.png")
        val portraitFile = File(dir, "$characterId-portrait.png")

        sourceFile.writeBytes(PortraitService.normalize(photoBytes))
        portraitFile.writeBytes(PortraitService.stylize(photoBytes))

        return "/uploads/$boardId/${sourceFile.name}" to "/uploads/$boardId/${portraitFile.name}"
    }
}
