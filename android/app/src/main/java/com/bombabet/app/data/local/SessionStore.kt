package com.bombabet.app.data.local

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.bombabet.app.data.model.User
import kotlinx.serialization.json.Json

/**
 * Session persistence contract. The Android implementation encrypts at rest;
 * tests use a plain in-memory implementation.
 */
interface SessionStorage {
    var accessToken: String?
    var refreshToken: String?
    var userId: String?
    var cachedUser: User?
    val isLoggedIn: Boolean

    fun saveSession(access: String, refresh: String, user: User)
    fun clear()
}

/**
 * Persists the session (tokens + cached profile) in an encrypted store so the
 * user stays signed in across launches and the balance survives offline.
 */
class SessionStore(context: Context) : SessionStorage {

    private val prefs = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "bombabet_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    override var accessToken: String?
        get() = prefs.getString(KEY_ACCESS, null)
        set(value) = prefs.edit().putString(KEY_ACCESS, value).apply()

    override var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH, null)
        set(value) = prefs.edit().putString(KEY_REFRESH, value).apply()

    override var userId: String?
        get() = prefs.getString(KEY_USER_ID, null)
        set(value) = prefs.edit().putString(KEY_USER_ID, value).apply()

    override var cachedUser: User?
        get() = prefs.getString(KEY_USER, null)?.let {
            runCatching { json.decodeFromString(User.serializer(), it) }.getOrNull()
        }
        set(value) = prefs.edit()
            .putString(KEY_USER, value?.let { json.encodeToString(User.serializer(), it) })
            .apply()

    override fun saveSession(access: String, refresh: String, user: User) {
        prefs.edit()
            .putString(KEY_ACCESS, access)
            .putString(KEY_REFRESH, refresh)
            .putString(KEY_USER_ID, user.id)
            .putString(KEY_USER, json.encodeToString(User.serializer(), user))
            .apply()
    }

    override fun clear() = prefs.edit().clear().apply()

    override val isLoggedIn: Boolean get() = !refreshToken.isNullOrBlank()

    private companion object {
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_USER_ID = "user_id"
        const val KEY_USER = "user_json"
    }
}
