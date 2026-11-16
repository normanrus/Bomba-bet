package com.bombabet.app

import android.app.Application
import com.bombabet.app.data.api.ApiFactory
import com.bombabet.app.data.local.SessionStore
import com.bombabet.app.data.repo.BombaBetRepository

/**
 * Single app-wide container. The API client and repository are created once and
 * shared, so token refresh state is consistent everywhere.
 */
class BombaBetApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

class AppContainer(app: Application) {
    val sessionStore = SessionStore(app)
    val api = ApiFactory.create(BuildConfig.API_BASE_URL, sessionStore)
    val repository = BombaBetRepository(api, sessionStore)
}
