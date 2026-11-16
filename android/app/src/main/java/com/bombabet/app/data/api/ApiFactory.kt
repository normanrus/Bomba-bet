package com.bombabet.app.data.api

import com.bombabet.app.data.local.SessionStorage
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Adds the bearer token to every request. On a 401 it refreshes the token once
 * and replays the original request, so a long-lived session never breaks.
 */
class AuthInterceptor(
    private val store: SessionStorage,
    private val json: Json,
    private val baseUrl: String,
) : Interceptor {

    private val refreshClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        if (original.url.encodedPath.endsWith("/api/auth/refresh")) {
            return chain.proceed(original)
        }

        val withAuth = original.newBuilder()
            .apply { store.accessToken?.let { header("Authorization", "Bearer $it") } }
            .build()

        val response = chain.proceed(withAuth)
        if (response.code != 401) return response

        val refresh = store.refreshToken ?: return response
        response.close()

        val newToken = runBlocking { performRefresh(refresh) } ?: return chain.proceed(withAuth)

        return chain.proceed(
            original.newBuilder()
                .header("Authorization", "Bearer $newToken")
                .build(),
        )
    }

    private fun performRefresh(refreshToken: String): String? {
        val body = """{"refreshToken":"$refreshToken"}"""
            .toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder()
            .url("$baseUrl/api/auth/refresh")
            .post(body)
            .build()
        return runCatching {
            refreshClient.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    store.clear()
                    return null
                }
                val parsed = json.decodeFromString(
                    RefreshResponseDto.serializer(),
                    resp.body?.string().orEmpty(),
                )
                store.accessToken = parsed.accessToken
                store.refreshToken = parsed.refreshToken
                parsed.accessToken
            }
        }.getOrNull()
    }
}

@kotlinx.serialization.Serializable
private data class RefreshResponseDto(val accessToken: String, val refreshToken: String)

object ApiFactory {

    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    val json: Json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    fun create(baseUrl: String, store: SessionStorage): BombaBetApi {
        val client = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor(store, json, baseUrl))
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl.trimEnd('/') + "/")
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(BombaBetApi::class.java)
    }
}
