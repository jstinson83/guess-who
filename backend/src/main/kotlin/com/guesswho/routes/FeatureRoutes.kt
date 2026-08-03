package com.guesswho.routes

import com.guesswho.domain.FeaturePool
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

fun Route.featureRoutes() {
    get("/api/features") {
        call.respond(FeaturePool.all)
    }
}
