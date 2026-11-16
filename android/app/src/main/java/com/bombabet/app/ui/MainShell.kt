package com.bombabet.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bombabet.app.data.model.AppConfig
import com.bombabet.app.data.model.LedgerEntry
import com.bombabet.app.data.model.Market
import com.bombabet.app.data.model.Outcome
import com.bombabet.app.data.model.SportEvent
import com.bombabet.app.data.model.User
import com.bombabet.app.ui.components.Avatar
import com.bombabet.app.ui.screens.EventsScreen
import com.bombabet.app.ui.screens.HistoryScreen
import com.bombabet.app.ui.screens.HomeScreen
import com.bombabet.app.ui.screens.LeaderboardScreen
import com.bombabet.app.ui.screens.PrizesScreen
import com.bombabet.app.ui.screens.ProfileScreen
import com.bombabet.app.ui.screens.EventDetailScreen
import com.bombabet.app.ui.theme.AccentGradient
import com.bombabet.app.ui.theme.BbColors
import kotlinx.coroutines.delay

private data class Tab(val key: String, val label: String, val icon: String)

private val tabs = listOf(
    Tab("home", "Главная", "🏠"),
    Tab("events", "Прогнозы", "🎯"),
    Tab("history", "История", "📜"),
    Tab("leaders", "Лидеры", "🏆"),
    Tab("prizes", "Призы", "🎁"),
    Tab("profile", "Профиль", "👤"),
)

@Composable
fun MainShell(
    viewModel: MainViewModel,
    appViewModel: AppViewModel,
    config: AppConfig,
) {
    val user by viewModel.user.collectAsState()
    val events by viewModel.events.collectAsState()
    val myPredictions by viewModel.myPredictions.collectAsState()
    val leaders by viewModel.leaders.collectAsState()
    val prizes by viewModel.prizes.collectAsState()
    val prizeRules by viewModel.prizeRules.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val filter by viewModel.eventFilter.collectAsState()
    val leaderSort by viewModel.leaderSort.collectAsState()
    val eventDetail by viewModel.eventDetail.collectAsState()
    val toast by appViewModel.toast.collectAsState()

    var tab by remember { mutableStateOf("home") }
    var historyFilter by remember { mutableStateOf("all") }
    var showDetail by remember { mutableStateOf(false) }
    var ledger by remember { mutableStateOf<List<LedgerEntry>?>(null) }

    LaunchedEffect(Unit) {
        viewModel.loadEvents()
        viewModel.loadMyPredictions()
        viewModel.loadLeaderboard()
        viewModel.loadPrizes()
        ledger = null
    }

    LaunchedEffect(tab) {
        when (tab) {
            "home" -> {
                viewModel.refreshProfile()
                viewModel.loadEvents()
                viewModel.loadLeaderboard()
            }
            "events" -> viewModel.loadEvents()
            "history" -> viewModel.loadMyPredictions()
            "leaders" -> viewModel.loadLeaderboard()
            "prizes" -> viewModel.loadPrizes()
            "profile" -> {
                viewModel.refreshProfile()
                viewModel.loadPrizes()
            }
        }
    }

    Box(Modifier.fillMaxSize().background(BbColors.Bg)) {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) {
                when {
                    showDetail && eventDetail != null -> EventDetailScreen(
                        event = eventDetail,
                        settings = config.predictions,
                        balance = user?.balance ?: 0.0,
                        busy = busy,
                        onBack = {
                            showDetail = false
                            viewModel.clearEventDetail()
                        },
                        onPlace = { event, market, outcome, stake ->
                            viewModel.placePrediction(event, market, outcome, stake) { ok, message ->
                                appViewModel.showToast(message)
                                if (ok) viewModel.loadEventDetail(event.id)
                            }
                        },
                    )

                    tab == "home" -> HomeScreen(
                        user = user,
                        config = config,
                        events = events.items,
                        results = myPredictions.items,
                        leaders = leaders.items,
                        prizeRules = prizeRules,
                        error = events.error,
                        onRetry = { viewModel.loadEvents() },
                        onOpenEvent = { id ->
                            viewModel.loadEventDetail(id)
                            showDetail = true
                        },
                        onGoToPredictions = { tab = "events" },
                        onGoToPrizes = { tab = "prizes" },
                    )

                    tab == "events" -> EventsScreen(
                        events = events.items,
                        filter = filter,
                        settings = config.predictions,
                        balance = user?.balance ?: 0.0,
                        error = events.error,
                        busy = busy,
                        onFilter = viewModel::setFilter,
                        onRetry = { viewModel.loadEvents() },
                        onPlace = { event, market, outcome, stake ->
                            viewModel.placePrediction(event, market, outcome, stake) { _, message ->
                                appViewModel.showToast(message)
                            }
                        },
                        onOpenEvent = { id ->
                            viewModel.loadEventDetail(id)
                            showDetail = true
                        },
                    )

                    tab == "history" -> HistoryScreen(
                        predictions = myPredictions.items,
                        stats = user?.stats,
                        filter = historyFilter,
                        error = myPredictions.error,
                        onFilter = { historyFilter = it; viewModel.loadMyPredictions() },
                        onRetry = { viewModel.loadMyPredictions() },
                    )

                    tab == "leaders" -> LeaderboardScreen(
                        leaders = leaders.items,
                        sort = leaderSort,
                        error = leaders.error,
                        onSort = viewModel::setLeaderSort,
                        onRetry = { viewModel.loadLeaderboard() },
                    )

                    tab == "prizes" -> PrizesScreen(
                        user = user,
                        prizes = prizes.items,
                        rules = prizeRules,
                        error = prizes.error,
                        busy = busy,
                        onRetry = { viewModel.loadPrizes() },
                        onSubmit = { amount, telegram, note ->
                            viewModel.requestPrize(amount, telegram, note) { _, message ->
                                appViewModel.showToast(message)
                            }
                        },
                        onCancel = { id ->
                            viewModel.cancelPrize(id) { appViewModel.showToast(it) }
                        },
                    )

                    else -> ProfileScreen(
                        user = user,
                        config = config,
                        ledger = ledger,
                        busy = busy,
                        onClaimBonus = {
                            viewModel.claimDailyBonus { appViewModel.showToast(it) }
                        },
                        onSaveProfile = { tg, seed ->
                            viewModel.updateProfile(tg, seed) { _, message ->
                                appViewModel.showToast(message)
                            }
                        },
                        onChangePassword = { current, next ->
                            viewModel.changePassword(current, next) { _, message ->
                                appViewModel.showToast(message)
                            }
                        },
                        onLogout = {
                            appViewModel.logout()
                        },
                    )
                }
            }

            if (!showDetail) {
                BottomBar(tab, onSelect = { tab = it })
            }
        }

        ToastHost(toast, onConsumed = { appViewModel.consumeToast() })
    }
}

@Composable
private fun BottomBar(selected: String, onSelect: (String) -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    listOf(BbColors.Bg.copy(alpha = 0.0f), BbColors.Bg2),
                ),
            )
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(BbColors.Card)
                .border(1.dp, BbColors.Border, RoundedCornerShape(20.dp))
                .padding(vertical = 6.dp, horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tabs.forEach { item ->
                BottomTab(item, selected == item.key) { onSelect(item.key) }
            }
        }
    }
}

@Composable
private fun BottomTab(tab: Tab, active: Boolean, onClick: () -> Unit) {
    val scale by animateFloatAsState(if (active) 1.06f else 1f, tween(160), label = "tabScale")
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier = Modifier
            .scale(scale)
            .clip(RoundedCornerShape(14.dp))
            .background(if (active) BbColors.Accent.copy(alpha = 0.14f) else BbColors.Card)
            .clickable(interactionSource = interaction, indication = null) { onClick() }
            .padding(horizontal = 9.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(tab.icon, fontSize = 17.sp)
        Spacer(Modifier.height(2.dp))
        Text(
            tab.label,
            color = if (active) BbColors.Text else BbColors.Muted,
            fontSize = 9.sp,
            fontWeight = if (active) FontWeight.Bold else FontWeight.Normal,
        )
        Spacer(Modifier.height(3.dp))
        Box(
            Modifier
                .size(width = if (active) 16.dp else 0.dp, height = 2.dp)
                .clip(RoundedCornerShape(1.dp))
                .background(if (active) AccentGradient else Brush.linearGradient(listOf(BbColors.Card, BbColors.Card))),
        )
    }
}

@Composable
private fun ToastHost(message: String?, onConsumed: () -> Unit) {
    AnimatedVisibility(
        visible = message != null,
        enter = fadeIn() + slideInVertically { it / 2 },
        exit = fadeOut() + slideOutVertically { it / 2 },
        modifier = Modifier.fillMaxSize(),
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
            Box(
                Modifier
                    .padding(bottom = 110.dp, start = 20.dp, end = 20.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(BbColors.CardHigh)
                    .border(1.dp, BbColors.Accent.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Text(message.orEmpty(), color = BbColors.Text, fontSize = 13.sp)
            }
        }
    }
    LaunchedEffect(message) {
        if (message != null) {
            delay(3200)
            onConsumed()
        }
    }
}
