package com.bombabet.app.data

import com.bombabet.app.InMemorySessionStorage
import com.bombabet.app.TestHttpServer
import com.bombabet.app.data.api.ApiFactory
import com.bombabet.app.data.repo.ApiResult
import com.bombabet.app.data.repo.BombaBetRepository
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Exercises the real networking stack (Retrofit + OkHttp + kotlinx.serialization)
 * against a live loopback HTTP server. No app code is mocked.
 */
class BombaBetRepositoryTest {

    private lateinit var server: TestHttpServer
    private lateinit var baseUrl: String
    private lateinit var store: InMemorySessionStorage
    private lateinit var repo: BombaBetRepository

    @Before
    fun setUp() {
        server = TestHttpServer()
        baseUrl = server.start()
        store = InMemorySessionStorage()
        repo = BombaBetRepository(ApiFactory.create(baseUrl, store), store)
    }

    @After
    fun tearDown() = server.stop()

    @Test
    fun `login stores tokens and returns the profile`() = runBlocking {
        server.on("POST", "/api/auth/login") { _: TestHttpServer.Recorded ->
            TestHttpServer.Response(200, TestHttpServer.fixture("auth_response.json"))
        }

        val result = repo.login("игрок", "secret-password")

        assertTrue(result is ApiResult.Ok)
        val outcome = (result as ApiResult.Ok).value
        assertEquals("игрок", outcome.user.username)
        assertEquals(1000.0, outcome.user.balance, 0.001)
        assertFalse(outcome.mustChangePassword)
        assertEquals("access-1", store.accessToken)
        assertEquals("refresh-1", store.refreshToken)
        assertTrue(store.isLoggedIn)
    }

    @Test
    fun `login surfaces the server error message`() = runBlocking {
        server.on("POST", "/api/auth/login") { _: TestHttpServer.Recorded ->
            TestHttpServer.Response(401,
                """{"error":{"code":"invalid_credentials","message":"Неверный логин или пароль"}}""",
            )
        }

        val result = repo.login("игрок", "wrong")

        assertTrue(result is ApiResult.Err)
        val err = result as ApiResult.Err
        assertEquals("Неверный логин или пароль", err.message)
        assertEquals("invalid_credentials", err.code)
        assertFalse(store.isLoggedIn)
    }

    @Test
    fun `must_change_password flag is propagated from login`() = runBlocking {
        server.on("POST", "/api/auth/login") { _: TestHttpServer.Recorded ->
            TestHttpServer.Response(200,
                TestHttpServer.fixture("auth_response.json")
                    .replace("\"mustChangePassword\": false", "\"mustChangePassword\": true"),
            )
        }

        val outcome = (repo.login("owner", "bootstrap") as ApiResult.Ok).value
        assertTrue(outcome.mustChangePassword)
    }

    @Test
    fun `events are parsed with nested markets and outcomes`() = runBlocking {
        server.on("GET", "/api/events") { _: TestHttpServer.Recorded ->
            TestHttpServer.Response(200, TestHttpServer.fixture("events.json"))
        }

        val result = repo.events("upcoming")

        assertTrue(result is ApiResult.Ok)
        val events = (result as ApiResult.Ok).value
        assertEquals(2, events.size)
        assertEquals("Заря", events[0].teamHome)
        assertEquals(1, events[0].markets.size)
        assertEquals(3, events[0].markets[0].outcomes.size)
        assertEquals(2.1, events[0].markets[0].outcomes[0].odds, 0.001)
        assertEquals(3, events[1].homeScore)
    }

    @Test
    fun `placing a prediction sends the bearer token and the exact payload`() = runBlocking {
        store.accessToken = "access-1"
        store.refreshToken = "refresh-1"

        server.on("POST", "/api/predictions") { record: TestHttpServer.Recorded ->
            assertEquals("Bearer access-1", record.auth)
            assertTrue(record.body.contains("\"stake\":250"))
            assertTrue(record.body.contains("\"outcomeId\":\"o-1\""))
            TestHttpServer.Response(201,
                """
                {"prediction":{"id":"p-1","stake":250,"odds":2.1,"potentialPayout":525,
                "payout":0,"status":"pending","placedAt":"2026-01-01T10:00:00.000Z",
                "outcomeLabel":"Победа 1","marketTitle":"Исход матча",
                "event":{"id":"e-1","teamHome":"Заря","teamAway":"Восход","startsAt":"2026-12-01T18:00:00.000Z","status":"upcoming"}},
                "balance":750,"idempotentReplay":false}
                """.trimIndent(),
            )
        }

        val result = repo.placePrediction("e-1", "m-1", "o-1", 250)

        assertTrue(result is ApiResult.Ok)
        val value = (result as ApiResult.Ok).value
        assertEquals(750.0, value.balance, 0.001)
        assertEquals(525.0, value.prediction.potentialPayout, 0.001)
    }

    @Test
    fun `a 401 triggers one refresh and the original request is replayed`() = runBlocking {
        store.accessToken = "stale"
        store.refreshToken = "refresh-1"
        var refreshCalls = 0
        var meCalls = 0

        server.on("POST", "/api/auth/refresh") { _: TestHttpServer.Recorded ->
            refreshCalls++
            TestHttpServer.Response(200, """{"accessToken":"fresh","refreshToken":"refresh-2"}""")
        }
        server.on("GET", "/api/me") { record: TestHttpServer.Recorded ->
            meCalls++
            if (record.auth == "Bearer fresh") {
                TestHttpServer.Response(200,
                    """{"user":{"id":"u-1","username":"игрок","balance":750,"role":"user","status":"active"}}""",
                )
            } else {
                TestHttpServer.Response(401, """{"error":{"code":"unauthorized","message":"токен истёк"}}""")
            }
        }

        val result = repo.refreshProfile()

        assertTrue(result is ApiResult.Ok)
        assertEquals(750.0, (result as ApiResult.Ok).value.balance, 0.001)
        assertEquals(1, refreshCalls)
        assertEquals(2, meCalls)
        assertEquals("fresh", store.accessToken)
    }

    @Test
    fun `a failed refresh clears the session instead of retrying forever`() = runBlocking {
        store.accessToken = "stale"
        store.refreshToken = "revoked"

        server.on("POST", "/api/auth/refresh") { _: TestHttpServer.Recorded ->
            TestHttpServer.Response(401, """{"error":{"code":"invalid_refresh","message":"отозван"}}""")
        }
        server.on("GET", "/api/me") { _: TestHttpServer.Recorded ->
            TestHttpServer.Response(401, """{"error":{"code":"unauthorized","message":"токен истёк"}}""")
        }

        val result = repo.refreshProfile()

        assertTrue(result is ApiResult.Err)
        assertNull(store.accessToken)
        assertNull(store.refreshToken)
        assertFalse(store.isLoggedIn)
    }

    @Test
    fun `daily bonus response is decoded with its rules`() = runBlocking {
        store.accessToken = "access-1"
        server.on("POST", "/api/me/daily-bonus") { _: TestHttpServer.Recorded ->
            TestHttpServer.Response(200,
                """{"granted":true,"amount":300,"balance":1300,
                    "rules":{"enabled":true,"chance":0.5,"min":100,"max":500,"text":"открытые правила"}}""",
            )
        }

        val value = (repo.claimDailyBonus() as ApiResult.Ok).value
        assertTrue(value.granted)
        assertEquals(300.0, value.amount, 0.001)
        assertEquals(0.5, value.rules.chance, 0.001)
    }

    @Test
    fun `prize request rejects an amount above the virtual fund`() = runBlocking {
        store.accessToken = "access-1"
        server.on("POST", "/api/prizes") { _: TestHttpServer.Recorded ->
            TestHttpServer.Response(400,
                """{"error":{"code":"prize_limit","message":"Превышен лимит призового фонда"}}""",
            )
        }

        val result = repo.requestPrize(999_999, "friend", null)
        assertTrue(result is ApiResult.Err)
        assertEquals("prize_limit", (result as ApiResult.Err).code)
    }

    @Test
    fun `network failure is reported as a connection error, not a crash`() = runBlocking {
        server.stop()
        val result = repo.config()
        assertTrue(result is ApiResult.Err)
        assertEquals("network", (result as ApiResult.Err).code)
    }

    @Test
    fun `config decodes the full app configuration`() = runBlocking {
        server.on("GET", "/api/config") { _: TestHttpServer.Recorded ->
            TestHttpServer.Response(200,
                """{"appName":"БОМБА БЕТ","logoUrl":"","tagline":"Прогнозы для своих",
                    "maintenance":{"enabled":false,"message":""},
                    "predictions":{"enabled":true,"minStake":10,"maxStake":50000,"maxOpenPerUser":100},
                    "bonuses":{"enabled":true,"signupAmount":1000,"dailyChance":0.4,"dailyMin":50,"dailyMax":400,"rulesText":""},
                    "prizes":{"enabled":true,"minStars":5,"maxStars":125,"pointsPerStar":100,"rulesText":""},
                    "disclaimer":"Бесплатный проект"}""",
            )
        }

        val cfg = (repo.config() as ApiResult.Ok).value
        assertEquals("БОМБА БЕТ", cfg.appName)
        assertEquals(125, cfg.prizes.maxStars)
        assertEquals(100, cfg.prizes.pointsPerStar)
        assertNotNull(cfg.bonuses)
        assertEquals(0.4, cfg.bonuses.dailyChance, 0.001)
    }

    @Test
    fun `leaderboard keeps the requested sort and maps ranks`() = runBlocking {
        server.on("GET", "/api/leaderboard") { record: TestHttpServer.Recorded ->
            assertTrue(record.path.startsWith("/api/leaderboard"))
            TestHttpServer.Response(200,
                """{"leaderboard":[
                    {"rank":1,"id":"u-2","username":"чемпион","balance":42000,"wins":18,"losses":3,"winRate":85.7},
                    {"rank":2,"id":"u-1","username":"игрок","balance":750,"wins":1,"losses":4,"winRate":20.0}]}""",
            )
        }

        val board = (repo.leaderboard("wins") as ApiResult.Ok).value
        assertEquals(2, board.size)
        assertEquals("чемпион", board[0].username)
        assertEquals(1, board[0].rank)
        assertEquals(85.7, board[0].winRate, 0.001)
    }
}
