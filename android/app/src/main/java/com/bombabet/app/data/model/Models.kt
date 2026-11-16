package com.bombabet.app.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class UserStats(
    val total: Int = 0,
    val won: Int = 0,
    val lost: Int = 0,
    val pending: Int = 0,
    val winRate: Double = 0.0,
    val staked: Double = 0.0,
    val returned: Double = 0.0,
    val net: Double = 0.0,
)

@Serializable
data class User(
    val id: String,
    val username: String,
    val avatarSeed: String = "bb",
    val avatarUrl: String? = null,
    val balance: Double = 0.0,
    val role: String = "user",
    val status: String = "active",
    val telegramUsername: String? = null,
    val createdAt: String? = null,
    val stats: UserStats? = null,
)

@Serializable
data class AuthResponse(
    val user: User,
    val accessToken: String,
    val refreshToken: String,
    val mustChangePassword: Boolean = false,
)

@Serializable
data class RefreshResponse(
    val accessToken: String,
    val refreshToken: String,
)

@Serializable
data class MeResponse(
    val user: User,
    val mustChangePassword: Boolean = false,
)

@Serializable
data class Outcome(
    val id: String,
    val code: String? = null,
    val label: String,
    val odds: Double,
    val isWinner: Boolean? = null,
    val isActive: Boolean = true,
)

@Serializable
data class Market(
    val id: String,
    val title: String,
    val kind: String = "outcome",
    val isActive: Boolean = true,
    val outcomes: List<Outcome> = emptyList(),
)

@Serializable
data class SportEvent(
    val id: String,
    val sport: String = "football",
    val league: String? = null,
    val teamHome: String,
    val teamAway: String,
    val startsAt: String,
    val status: String = "upcoming",
    val homeScore: Int? = null,
    val awayScore: Int? = null,
    val markets: List<Market> = emptyList(),
)

@Serializable
data class EventsResponse(val events: List<SportEvent> = emptyList())

@Serializable
data class EventResponse(val event: SportEvent)

@Serializable
data class EventRef(
    val id: String,
    val teamHome: String,
    val teamAway: String,
    val league: String? = null,
    val startsAt: String,
    val status: String,
    val homeScore: Int? = null,
    val awayScore: Int? = null,
)

@Serializable
data class Prediction(
    val id: String,
    val stake: Double,
    val odds: Double,
    val potentialPayout: Double = 0.0,
    val payout: Double = 0.0,
    val status: String,
    val placedAt: String,
    val settledAt: String? = null,
    val outcomeLabel: String,
    val marketTitle: String,
    val event: EventRef,
)

@Serializable
data class PredictionsResponse(
    val predictions: List<Prediction> = emptyList(),
    val stats: UserStats = UserStats(),
)

@Serializable
data class PlacePredictionRequest(
    val eventId: String,
    val marketId: String,
    val outcomeId: String,
    val stake: Int,
    val idempotencyKey: String? = null,
)

@Serializable
data class PlacePredictionResponse(
    val prediction: Prediction,
    val balance: Double,
    val idempotentReplay: Boolean = false,
)

@Serializable
data class Prize(
    val id: String,
    val userId: String,
    val amount: Double,
    val telegramUsername: String,
    val status: String,
    val userNote: String? = null,
    val adminNote: String? = null,
    val rejectReason: String? = null,
    val requestedAt: String,
    val processedAt: String? = null,
)

@Serializable
data class PrizesResponse(val prizes: List<Prize> = emptyList())

@Serializable
data class PrizeRules(
    val enabled: Boolean = true,
    val minRequest: Double = 0.0,
    val maxFund: Double = 0.0,
    val used: Double = 0.0,
    val remaining: Double = 0.0,
    val rulesText: String = "",
    val note: String = "",
)

@Serializable
data class CreatePrizeRequest(
    val amount: Int,
    val telegramUsername: String,
    val userNote: String? = null,
    val idempotencyKey: String? = null,
)

@Serializable
data class PrizeResponse(
    val prize: Prize,
    val balance: Double = 0.0,
)

@Serializable
data class LeaderboardEntry(
    val rank: Int,
    val id: String,
    val username: String,
    val avatarSeed: String = "bb",
    val avatarUrl: String? = null,
    val balance: Double,
    val wins: Int = 0,
    val losses: Int = 0,
    val winRate: Double = 0.0,
)

@Serializable
data class LeaderboardResponse(val leaderboard: List<LeaderboardEntry> = emptyList())

@Serializable
data class LedgerEntry(
    val id: Long,
    val delta: Double,
    val balanceAfter: Double,
    val reason: String,
    val note: String? = null,
    val createdAt: String,
)

@Serializable
data class LedgerResponse(val entries: List<LedgerEntry> = emptyList())

@Serializable
data class BonusRules(
    val enabled: Boolean = true,
    val chance: Double = 0.0,
    val min: Double = 0.0,
    val max: Double = 0.0,
    val text: String = "",
)

@Serializable
data class DailyBonusResponse(
    val granted: Boolean = false,
    val amount: Double = 0.0,
    val balance: Double = 0.0,
    val nextAvailableAt: String? = null,
    val reason: String? = null,
    val rules: BonusRules = BonusRules(),
)

@Serializable
data class Maintenance(
    val enabled: Boolean = false,
    val message: String = "",
)

@Serializable
data class PredictionSettings(
    val enabled: Boolean = true,
    val minStake: Int = 10,
    val maxStake: Int = 50000,
    val maxOpenPerUser: Int = 100,
)

@Serializable
data class BonusSettings(
    val enabled: Boolean = true,
    val signupAmount: Int = 1000,
    val dailyChance: Double = 0.0,
    val dailyMin: Int = 0,
    val dailyMax: Int = 0,
    val rulesText: String = "",
)

@Serializable
data class PrizeSettings(
    val enabled: Boolean = true,
    val minRequest: Int = 0,
    val maxFund: Int = 0,
    val rulesText: String = "",
)

@Serializable
data class AppConfig(
    val appName: String = "БОМБА БЕТ",
    val logoUrl: String = "",
    val tagline: String = "",
    val maintenance: Maintenance = Maintenance(),
    val predictions: PredictionSettings = PredictionSettings(),
    val bonuses: BonusSettings = BonusSettings(),
    val prizes: PrizeSettings = PrizeSettings(),
    val disclaimer: String = "",
)

@Serializable
data class UpdateProfileRequest(
    val telegramUsername: String? = null,
    val avatarSeed: String? = null,
)

@Serializable
data class UserResponse(val user: User)

@Serializable
data class ChangePasswordRequest(
    val currentPassword: String? = null,
    val newPassword: String,
)

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
)

@Serializable
data class RegisterRequest(
    val username: String,
    val password: String,
    val telegramUsername: String? = null,
    val avatarSeed: String? = null,
)

@Serializable
data class RefreshRequest(@SerialName("refreshToken") val refreshToken: String)

@Serializable
data class ApiErrorBody(val error: ApiErrorDetail? = null)

@Serializable
data class ApiErrorDetail(
    val code: String = "error",
    val message: String = "Ошибка запроса",
)
