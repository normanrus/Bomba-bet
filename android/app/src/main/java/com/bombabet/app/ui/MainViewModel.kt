package com.bombabet.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.bombabet.app.AppContainer
import com.bombabet.app.data.model.LeaderboardEntry
import com.bombabet.app.data.model.Market
import com.bombabet.app.data.model.Outcome
import com.bombabet.app.data.model.Prediction
import com.bombabet.app.data.model.Prize
import com.bombabet.app.data.model.PrizeRules
import com.bombabet.app.data.model.SportEvent
import com.bombabet.app.data.model.User
import com.bombabet.app.data.repo.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ListState<T>(
    val items: List<T>? = null,
    val loading: Boolean = false,
    val error: String? = null,
)

class MainViewModel(private val container: AppContainer) : ViewModel() {

    private val repo = container.repository

    private val _user = MutableStateFlow(repo.cachedUser)
    val user: StateFlow<User?> = _user.asStateFlow()

    private val _events = MutableStateFlow(ListState<SportEvent>())
    val events: StateFlow<ListState<SportEvent>> = _events.asStateFlow()

    private val _eventFilter = MutableStateFlow("upcoming")
    val eventFilter: StateFlow<String> = _eventFilter.asStateFlow()

    private val _myPredictions = MutableStateFlow(ListState<Prediction>())
    val myPredictions: StateFlow<ListState<Prediction>> = _myPredictions.asStateFlow()

    private val _leaders = MutableStateFlow(ListState<LeaderboardEntry>())
    val leaders: StateFlow<ListState<LeaderboardEntry>> = _leaders.asStateFlow()

    private val _leaderSort = MutableStateFlow("balance")
    val leaderSort: StateFlow<String> = _leaderSort.asStateFlow()

    private val _prizes = MutableStateFlow(ListState<Prize>())
    val prizes: StateFlow<ListState<Prize>> = _prizes.asStateFlow()

    private val _prizeRules = MutableStateFlow(PrizeRules())
    val prizeRules: StateFlow<PrizeRules> = _prizeRules.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _eventDetail = MutableStateFlow<SportEvent?>(null)
    val eventDetail: StateFlow<SportEvent?> = _eventDetail.asStateFlow()

    fun setFilter(filter: String) {
        _eventFilter.value = filter
        loadEvents()
    }

    fun setLeaderSort(sort: String) {
        _leaderSort.value = sort
        loadLeaderboard()
    }

    fun refreshProfile() {
        viewModelScope.launch {
            when (val res = repo.refreshProfile()) {
                is ApiResult.Ok -> _user.value = res.value
                is ApiResult.Err -> Unit
            }
        }
    }

    fun loadEvents() {
        _events.value = _events.value.copy(loading = true, error = null)
        viewModelScope.launch {
            when (val res = repo.events(_eventFilter.value)) {
                is ApiResult.Ok -> _events.value = ListState(items = res.value)
                is ApiResult.Err -> _events.value = ListState(items = _events.value.items, error = res.message)
            }
        }
    }

    fun loadEventDetail(id: String) {
        viewModelScope.launch {
            when (val res = repo.event(id)) {
                is ApiResult.Ok -> _eventDetail.value = res.value
                is ApiResult.Err -> Unit
            }
        }
    }

    fun clearEventDetail() {
        _eventDetail.value = null
    }

    fun loadMyPredictions() {
        _myPredictions.value = _myPredictions.value.copy(loading = true, error = null)
        viewModelScope.launch {
            when (val res = repo.myPredictions()) {
                is ApiResult.Ok -> {
                    _myPredictions.value = ListState(items = res.value.first)
                    _user.value = _user.value?.copy(stats = res.value.second)
                }
                is ApiResult.Err ->
                    _myPredictions.value = ListState(items = _myPredictions.value.items, error = res.message)
            }
        }
    }

    fun loadLeaderboard() {
        _leaders.value = _leaders.value.copy(loading = true, error = null)
        viewModelScope.launch {
            when (val res = repo.leaderboard(_leaderSort.value)) {
                is ApiResult.Ok -> _leaders.value = ListState(items = res.value)
                is ApiResult.Err -> _leaders.value = ListState(items = _leaders.value.items, error = res.message)
            }
        }
    }

    fun loadPrizes() {
        _prizes.value = _prizes.value.copy(loading = true, error = null)
        viewModelScope.launch {
            when (val res = repo.prizeRules()) {
                is ApiResult.Ok -> _prizeRules.value = res.value
                is ApiResult.Err -> Unit
            }
            when (val res = repo.myPrizes()) {
                is ApiResult.Ok -> _prizes.value = ListState(items = res.value)
                is ApiResult.Err -> _prizes.value = ListState(items = _prizes.value.items, error = res.message)
            }
        }
    }

    fun placePrediction(
        event: SportEvent,
        market: Market,
        outcome: Outcome,
        stake: Int,
        onDone: (ok: Boolean, message: String) -> Unit,
    ) {
        _busy.value = true
        viewModelScope.launch {
            val res = repo.placePrediction(event.id, market.id, outcome.id, stake)
            _busy.value = false
            when (res) {
                is ApiResult.Ok -> {
                    _user.value = _user.value?.copy(balance = res.value.balance)
                    loadEvents()
                    loadMyPredictions()
                    onDone(true, "Прогноз принят! Возможный выигрыш ${res.value.prediction.potentialPayout.toLong()} очков")
                }
                is ApiResult.Err -> onDone(false, res.message)
            }
        }
    }

    fun claimDailyBonus(onDone: (String) -> Unit) {
        _busy.value = true
        viewModelScope.launch {
            val res = repo.claimDailyBonus()
            _busy.value = false
            when (res) {
                is ApiResult.Ok -> {
                    _user.value = _user.value?.copy(balance = res.value.balance)
                    onDone(
                        if (res.value.granted) "🎉 Бонус +${res.value.amount.toLong()} очков!"
                        else res.value.reason ?: "Сегодня бонус не выпал. Попробуйте завтра!",
                    )
                }
                is ApiResult.Err -> onDone(res.message)
            }
        }
    }

    fun requestPrize(amount: Int, telegram: String, note: String?, onDone: (ok: Boolean, message: String) -> Unit) {
        _busy.value = true
        viewModelScope.launch {
            val res = repo.requestPrize(amount, telegram, note)
            _busy.value = false
            when (res) {
                is ApiResult.Ok -> {
                    loadPrizes()
                    refreshProfile()
                    onDone(true, "Заявка создана. Ожидайте решения администратора.")
                }
                is ApiResult.Err -> onDone(false, res.message)
            }
        }
    }

    fun cancelPrize(id: String, onDone: (String) -> Unit) {
        viewModelScope.launch {
            when (val res = repo.cancelPrize(id)) {
                is ApiResult.Ok -> {
                    loadPrizes()
                    refreshProfile()
                    onDone("Заявка отменена, очки возвращены")
                }
                is ApiResult.Err -> onDone(res.message)
            }
        }
    }

    fun updateProfile(telegram: String?, avatarSeed: String?, onDone: (ok: Boolean, message: String) -> Unit) {
        viewModelScope.launch {
            when (val res = repo.updateProfile(telegram, avatarSeed)) {
                is ApiResult.Ok -> {
                    _user.value = res.value
                    onDone(true, "Профиль обновлён")
                }
                is ApiResult.Err -> onDone(false, res.message)
            }
        }
    }

    fun changePassword(current: String?, newPassword: String, onDone: (ok: Boolean, message: String) -> Unit) {
        viewModelScope.launch {
            when (val res = repo.changePassword(current, newPassword)) {
                is ApiResult.Ok -> onDone(true, "Пароль изменён")
                is ApiResult.Err -> onDone(false, res.message)
            }
        }
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            MainViewModel(container) as T
    }
}
