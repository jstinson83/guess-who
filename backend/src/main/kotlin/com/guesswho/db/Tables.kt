package com.guesswho.db

import org.jetbrains.exposed.sql.Table

object BoardsTable : Table("boards") {
    val id = varchar("id", 36)
    val name = varchar("name", 200)
    val template = varchar("template", 32)
    val targetSize = integer("target_size")
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}

object CharactersTable : Table("characters") {
    val id = varchar("id", 36)
    val boardId = varchar("board_id", 36).references(BoardsTable.id)
    val name = varchar("name", 200)
    val sourcePhotoUrl = varchar("source_photo_url", 500)
    val portraitUrl = varchar("portrait_url", 500)
    val featuresJson = text("features_json")
    val createdAt = long("created_at")

    override val primaryKey = PrimaryKey(id)
}
