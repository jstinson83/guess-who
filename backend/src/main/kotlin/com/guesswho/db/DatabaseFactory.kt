package com.guesswho.db

import java.io.File
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.transactions.transaction

object DatabaseFactory {
    fun init(dbPath: String = "data/guesswho.db") {
        File(dbPath).parentFile?.mkdirs()
        Database.connect("jdbc:sqlite:$dbPath", driver = "org.sqlite.JDBC")
        transaction {
            SchemaUtils.create(BoardsTable, CharactersTable)
        }
    }
}
