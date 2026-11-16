package com.bombabet.app.data.api

import com.bombabet.app.data.model.AppConfig
import com.bombabet.app.data.model.AuthResponse
import com.bombabet.app.data.model.ChangePasswordRequest
import com.bombabet.app.data.model.CreatePrizeRequest
import com.bombabet.app.data.model.DailyBonusResponse
import com.bombabet.app.data.model.EventResponse
import com.bombabet.app.data.model.EventsResponse
import com.bombabet.app.data.model.LeaderboardResponse
import com.bombabet.app.data.model.LedgerResponse
import com.bombabet.app.data.model.LoginRequest
import com.bombabet.app.data.model.MeResponse
import com.bombabet.app.data.model.PlacePredictionRequest
import com.bombabet.app.data.model.PlacePredictionResponse
import com.bombabet.app.data.model.PredictionsResponse
import com.bombabet.app.data.model.PrizeResponse
import com.bombabet.app.data.model.PrizeRules
import com.bombabet.app.data.model.PrizesResponse
import com.bombabet.app.data.model.RefreshRequest
import com.bombabet.app.data.model.RefreshResponse
import com.bombabet.app.data.model.RegisterRequest
import com.bombabet.app.data.model.UpdateProfileRequest
import com.bombabet.app.data.model.UserResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface BombaBetApi {

    @GET("api/config")
    suspend fun config(): AppConfig

    @POST("api/auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponse

    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("api/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): RefreshResponse

    @POST("api/auth/logout")
    suspend fun logout(@Body body: RefreshRequest)

    @POST("api/auth/change-password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): RefreshResponse

    @GET("api/me")
    suspend fun me(): MeResponse

    @PATCH("api/me")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): UserResponse

    @POST("api/me/daily-bonus")
    suspend fun claimDailyBonus(): DailyBonusResponse

    @GET("api/me/ledger")
    suspend fun ledger(@Query("limit") limit: Int = 50): LedgerResponse

    @GET("api/events")
    suspend fun events(
        @Query("status") status: String = "upcoming",
        @Query("limit") limit: Int = 50,
    ): EventsResponse

    @GET("api/events/{id}")
    suspend fun event(@Path("id") id: String): EventResponse

    @POST("api/predictions")
    suspend fun placePrediction(@Body body: PlacePredictionRequest): PlacePredictionResponse

    @GET("api/predictions/my")
    suspend fun myPredictions(
        @Query("status") status: String = "all",
        @Query("limit") limit: Int = 50,
    ): PredictionsResponse

    @GET("api/leaderboard")
    suspend fun leaderboard(
        @Query("limit") limit: Int = 50,
        @Query("sort") sort: String = "balance",
    ): LeaderboardResponse

    @GET("api/prizes/rules")
    suspend fun prizeRules(): PrizeRules

    @POST("api/prizes")
    suspend fun requestPrize(@Body body: CreatePrizeRequest): PrizeResponse

    @GET("api/prizes/my")
    suspend fun myPrizes(): PrizesResponse

    @POST("api/prizes/{id}/cancel")
    suspend fun cancelPrize(@Path("id") id: String): PrizeResponse
}
