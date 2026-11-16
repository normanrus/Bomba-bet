package com.bombabet.app.data.repo

import com.bombabet.app.data.api.BombaBetApi
import com.bombabet.app.data.local.SessionStorage
import com.bombabet.app.data.model.AppConfig
import com.bombabet.app.data.model.DailyBonusResponse
import com.bombabet.app.data.model.LedgerEntry
import com.bombabet.app.data.model.PlacePredictionResponse
import com.bombabet.app.data.model.Prediction
import com.bombabet.app.data.model.Prize
import com.bombabet.app.data.model.PrizeRules
import com.bombabet.app.data.model.SportEvent
import com.bombabet.app.data.model.User
import com.bombabet.app.data.model.UserStats
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.io.IOException
import java.util.UUID

data class AuthOutcome(val user: User, val mustChangePassword: Boolean)

sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Err(val message: String, val code: String = "error") : ApiResult<Nothing>
}

suspend fun <T> apiCall(block: suspend () -> T): ApiResult<T> = withContext(Dispatchers.IO) {
    try {
        ApiResult.Ok(block())
    } catch (e: HttpException) {
        val parsed = runCatching {
            val raw = e.response()?.errorBody()?.string()
            if (raw.isNullOrBlank()) null
            else Json { ignoreUnknownKeys = true }
                .decodeFromString(com.bombabet.app.data.model.ApiErrorBody.serializer(), raw)
        }.getOrNull()
        ApiResult.Err(
            parsed?.error?.message ?: "Ошибка сервера (${e.code()})",
            parsed?.error?.code ?: "http_${e.code()}",
        )
    } catch (e: IOException) {
        ApiResult.Err("Нет связи с сервером. Проверьте подключение.", "network")
    } catch (e: Exception) {
        ApiResult.Err(e.message ?: "Неизвестная ошибка", "unknown")
    }
}

class BombaBetRepository(
    private val api: BombaBetApi,
    private val store: SessionStorage,
) {

    val isLoggedIn: Boolean get() = store.isLoggedIn
    val cachedUser: User? get() = store.cachedUser

    suspend fun config(): ApiResult<AppConfig> = apiCall { api.config() }

    suspend fun register(username: String, password: String, telegram: String?): ApiResult<AuthOutcome> =
        apiCall {
            val res = api.register(
                com.bombabet.app.data.model.RegisterRequest(
                    username = username,
                    password = password,
                    telegramUsername = telegram?.takeIf { it.isNotBlank() },
                ),
            )
            store.saveSession(res.accessToken, res.refreshToken, res.user)
            AuthOutcome(res.user, res.mustChangePassword)
        }

    suspend fun login(username: String, password: String): ApiResult<AuthOutcome> = apiCall {
        val res = api.login(com.bombabet.app.data.model.LoginRequest(username, password))
        store.saveSession(res.accessToken, res.refreshToken, res.user)
        AuthOutcome(res.user, res.mustChangePassword)
    }

    suspend fun logout() {
        val refresh = store.refreshToken
        if (refresh != null) {
            runCatching { api.logout(com.bombabet.app.data.model.RefreshRequest(refresh)) }
        }
        store.clear()
    }

    suspend fun refreshProfile(): ApiResult<User> = apiCall {
        val res = api.me()
        store.cachedUser = res.user
        res.user
    }

    suspend fun sessionInfo(): ApiResult<Pair<User, Boolean>> = apiCall {
        val res = api.me()
        store.cachedUser = res.user
        res.user to res.mustChangePassword
    }

    suspend fun updateProfile(telegram: String?, avatarSeed: String?): ApiResult<User> = apiCall {
        val res = api.updateProfile(
            com.bombabet.app.data.model.UpdateProfileRequest(
                telegramUsername = telegram,
                avatarSeed = avatarSeed,
            ),
        )
        store.cachedUser = res.user
        res.user
    }

    suspend fun claimDailyBonus(): ApiResult<DailyBonusResponse> = apiCall { api.claimDailyBonus() }

    suspend fun events(status: String): ApiResult<List<SportEvent>> =
        apiCall { api.events(status = status).events }

    suspend fun event(id: String): ApiResult<SportEvent> = apiCall { api.event(id).event }

    suspend fun placePrediction(
        eventId: String,
        marketId: String,
        outcomeId: String,
        stake: Int,
    ): ApiResult<PlacePredictionResponse> = apiCall {
        api.placePrediction(
            com.bombabet.app.data.model.PlacePredictionRequest(
                eventId = eventId,
                marketId = marketId,
                outcomeId = outcomeId,
                stake = stake,
                // Guards against a double tap creating two identical predictions.
                idempotencyKey = UUID.randomUUID().toString(),
            ),
        )
    }

    suspend fun myPredictions(status: String = "all"): ApiResult<Pair<List<Prediction>, UserStats>> =
        apiCall {
            val res = api.myPredictions(status = status)
            res.predictions to res.stats
        }

    suspend fun leaderboard(sort: String = "balance"): ApiResult<List<com.bombabet.app.data.model.LeaderboardEntry>> =
        apiCall { api.leaderboard(sort = sort).leaderboard }

    suspend fun ledger(): ApiResult<List<LedgerEntry>> = apiCall { api.ledger().entries }

    suspend fun prizeRules(): ApiResult<PrizeRules> = apiCall { api.prizeRules() }

    suspend fun myPrizes(): ApiResult<List<Prize>> = apiCall { api.myPrizes().prizes }

    suspend fun requestPrize(amount: Int, telegram: String, note: String?): ApiResult<Prize> =
        apiCall {
            api.requestPrize(
                com.bombabet.app.data.model.CreatePrizeRequest(
                    amount = amount,
                    telegramUsername = telegram,
                    userNote = note,
                    idempotencyKey = UUID.randomUUID().toString(),
                ),
            ).prize
        }

    suspend fun cancelPrize(id: String): ApiResult<Prize> = apiCall { api.cancelPrize(id).prize }

    suspend fun changePassword(current: String?, newPassword: String): ApiResult<Unit> = apiCall {
        val res = api.changePassword(
            com.bombabet.app.data.model.ChangePasswordRequest(current, newPassword),
        )
        store.accessToken = res.accessToken
        store.refreshToken = res.refreshToken
    }
}
