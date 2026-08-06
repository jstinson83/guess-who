package com.guesswho.board

import com.google.api.core.ApiFuture
import com.google.api.core.ApiFutureCallback
import com.google.api.core.ApiFutures
import com.google.common.util.concurrent.MoreExecutors
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Bridges Firestore's [ApiFuture] (not a Guava `ListenableFuture`, so
 * `kotlinx-coroutines-guava`'s `.await()` doesn't apply) to a suspend call.
 */
suspend fun <T> ApiFuture<T>.await(): T = suspendCancellableCoroutine { continuation ->
    ApiFutures.addCallback(
        this,
        object : ApiFutureCallback<T> {
            override fun onSuccess(result: T) = continuation.resume(result)
            override fun onFailure(throwable: Throwable) = continuation.resumeWithException(throwable)
        },
        MoreExecutors.directExecutor(),
    )
    continuation.invokeOnCancellation { cancel(false) }
}
