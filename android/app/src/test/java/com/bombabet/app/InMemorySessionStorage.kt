package com.bombabet.app

import com.bombabet.app.data.local.SessionStorage
import com.bombabet.app.data.model.User

/**
 * In-memory session storage for JVM tests. The production store is
 * EncryptedSharedPreferences; this mirrors its contract without Android APIs.
 */
class InMemorySessionStorage : SessionStorage {
    override var accessToken: String? = null
    override var refreshToken: String? = null
    override var userId: String? = null
    override var cachedUser: User? = null

    override val isLoggedIn: Boolean get() = !refreshToken.isNullOrBlank()

    override fun saveSession(access: String, refresh: String, user: User) {
        accessToken = access
        refreshToken = refresh
        userId = user.id
        cachedUser = user
    }

    override fun clear() {
        accessToken = null
        refreshToken = null
        userId = null
        cachedUser = null
    }
}
