package com.bombabet.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.bombabet.app.AppContainer
import com.bombabet.app.data.model.AppConfig
import com.bombabet.app.data.model.User
import com.bombabet.app.data.repo.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SessionState(
    val ready: Boolean = false,
    val user: User? = null,
    val mustChangePassword: Boolean = false,
)

class AppViewModel(private val container: AppContainer) : ViewModel() {

    private val repo = container.repository

    private val _session = MutableStateFlow(
        SessionState(ready = false, user = container.repository.cachedUser),
    )
    val session: StateFlow<SessionState> = _session.asStateFlow()

    private val _config = MutableStateFlow(AppConfig())
    val config: StateFlow<AppConfig> = _config.asStateFlow()

    private val _toast = MutableStateFlow<String?>(null)
    val toast: StateFlow<String?> = _toast.asStateFlow()

    init {
        viewModelScope.launch {
            when (val res = repo.config()) {
                is ApiResult.Ok -> _config.value = res.value
                is ApiResult.Err -> Unit
            }
            refreshSession()
        }
    }

    fun showToast(message: String) {
        _toast.value = message
    }

    fun consumeToast() {
        _toast.value = null
    }

    fun refreshSession() {
        viewModelScope.launch {
            if (!repo.isLoggedIn) {
                _session.value = SessionState(ready = true, user = null)
                return@launch
            }
            when (val res = repo.sessionInfo()) {
                is ApiResult.Ok -> _session.value = SessionState(
                    ready = true,
                    user = res.value.first,
                    mustChangePassword = res.value.second,
                )
                is ApiResult.Err ->
                    // Keep the cached profile so the UI stays usable offline.
                    _session.value = SessionState(
                        ready = true,
                        user = repo.cachedUser,
                        mustChangePassword = false,
                    )
            }
        }
    }

    fun onAuthenticated(user: User, mustChangePassword: Boolean = false) {
        _session.value = SessionState(ready = true, user = user, mustChangePassword = mustChangePassword)
    }

    fun onLoggedOut() {
        _session.value = SessionState(ready = true, user = null)
    }

    fun logout() {
        viewModelScope.launch {
            repo.logout()
            _session.value = SessionState(ready = true, user = null)
        }
    }

    fun changePassword(current: String?, newPassword: String, onDone: (Boolean, String) -> Unit) {
        viewModelScope.launch {
            when (val res = repo.changePassword(current, newPassword)) {
                is ApiResult.Ok -> {
                    _session.value = SessionState(ready = true, user = _session.value.user, mustChangePassword = false)
                    onDone(true, "Пароль изменён")
                }
                is ApiResult.Err -> onDone(false, res.message)
            }
        }
    }

    fun reloadConfig() {
        viewModelScope.launch {
            when (val res = repo.config()) {
                is ApiResult.Ok -> _config.value = res.value
                is ApiResult.Err -> Unit
            }
        }
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AppViewModel(container) as T
    }
}
