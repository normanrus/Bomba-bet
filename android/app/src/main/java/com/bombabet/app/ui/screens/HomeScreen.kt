package com.bombabet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bombabet.app.data.model.AppConfig
import com.bombabet.app.data.model.LeaderboardEntry
import com.bombabet.app.data.model.Prediction
import com.bombabet.app.data.model.PrizeRules
import com.bombabet.app.data.model.SportEvent
import com.bombabet.app.data.model.User
import com.bombabet.app.ui.components.BbCard
import com.bombabet.app.ui.components.EmptyState
import com.bombabet.app.ui.components.ErrorBox
import com.bombabet.app.ui.components.GhostButton
import com.bombabet.app.ui.components.LoadingBox
import com.bombabet.app.ui.components.SectionTitle
import com.bombabet.app.ui.components.StatusChip
import com.bombabet.app.ui.components.Avatar
import com.bombabet.app.ui.theme.AccentGradient
import com.bombabet.app.ui.theme.BbColors
import com.bombabet.app.ui.theme.CardGradient
import com.bombabet.app.util.Format

@Composable
fun HomeScreen(
    user: User?,
    config: AppConfig,
    events: List<SportEvent>?,
    results: List<Prediction>?,
    leaders: List<LeaderboardEntry>?,
    prizeRules: PrizeRules,
    error: String?,
    onRetry: () -> Unit,
    onOpenEvent: (String) -> Unit,
    onGoToPredictions: () -> Unit,
    onGoToPrizes: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(BbColors.Bg),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { LogoHeader(config) }
        item { BalanceCard(user, config) }

        if (error != null) {
            item { ErrorBox(error, onRetry) }
        }

        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                MiniStat(
                    "Прогнозов", Format.points(user?.stats?.total ?: 0),
                    Modifier.weight(1f), BbColors.Accent,
                )
                MiniStat(
                    "Побед", Format.points(user?.stats?.won ?: 0),
                    Modifier.weight(1f), BbColors.Ok,
                )
                MiniStat(
                    "Winrate", Format.percent(user?.stats?.winRate ?: 0.0),
                    Modifier.weight(1f), BbColors.Amber,
                )
            }
        }

        item {
            SectionTitle("Доступные события", trailing = "прогнозы бесплатны")
        }

        when {
            events == null -> item { LoadingBox() }
            events.isEmpty() -> item {
                BbCard(Modifier.fillMaxWidth()) {
                    EmptyState("Пока нет доступных событий", "Загляните позже")
                }
            }
            else -> items(events.take(6), key = { it.id }) { event ->
                EventCardCompact(event) { onOpenEvent(event.id) }
            }
        }

        if (events != null && events.isNotEmpty()) {
            item {
                GhostButton("Все события и прогнозы", Modifier.fillMaxWidth(), onClick = onGoToPredictions)
            }
        }

        item { SectionTitle("Таблица лидеров", trailing = "по балансу") }

        when {
            leaders == null -> item { LoadingBox() }
            leaders.isEmpty() -> item { EmptyState("Лидерборд пуст", emoji = "🏆") }
            else -> item {
                BbCard(Modifier.fillMaxWidth()) {
                    leaders.take(5).forEachIndexed { index, entry ->
                        LeaderRow(entry)
                        if (index < minOf(leaders.size, 5) - 1) Spacer(Modifier.height(10.dp))
                    }
                }
            }
        }

        item { SectionTitle("Последние результаты") }

        when {
            results == null -> item { LoadingBox() }
            results.isEmpty() -> item { EmptyState("Прогнозов ещё нет", "Сделайте первый прогноз", "🎯") }
            else -> items(results.take(5), key = { it.id }) { PredictionRow(it) }
        }

        item { SectionTitle("Текущие конкурсы", trailing = "призовой фонд") }
        item { ContestCard(prizeRules, onGoToPrizes) }

        item { Spacer(Modifier.height(8.dp)) }
        item {
            Text(
                config.disclaimer,
                color = BbColors.Muted.copy(alpha = 0.75f),
                fontSize = 11.sp,
                lineHeight = 15.sp,
            )
        }
        item { Spacer(Modifier.height(60.dp)) }
    }
}

@Composable
private fun LogoHeader(config: AppConfig) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(46.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(AccentGradient),
            contentAlignment = Alignment.Center,
        ) {
            Text("💥", fontSize = 24.sp)
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(
                config.appName.ifBlank { "БОМБА БЕТ" },
                color = BbColors.Text,
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.sp,
            )
            Text(
                config.tagline.ifBlank { "Дружеские спортивные прогнозы" },
                color = BbColors.Muted,
                fontSize = 11.sp,
            )
        }
    }
}

@Composable
private fun BalanceCard(user: User?, config: AppConfig) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(CardGradient)
            .border(1.dp, BbColors.Accent.copy(alpha = 0.35f), RoundedCornerShape(22.dp))
            .padding(20.dp),
    ) {
        Column {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(user?.avatarSeed ?: "bb", user?.avatarUrl, size = 44, border = true)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            user?.username ?: "Гость",
                            color = BbColors.Text,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                        )
                        Text(
                            "ID ${user?.id?.take(8) ?: "—"}",
                            color = BbColors.Muted,
                            fontSize = 11.sp,
                        )
                    }
                }
                StatusChip("active", "Очки")
            }

            Spacer(Modifier.height(18.dp))
            Text("БАЛАНС ОЧКОВ", color = BbColors.Muted, fontSize = 10.sp, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    Format.points(user?.balance ?: 0.0),
                    color = BbColors.Text,
                    fontSize = 36.sp,
                    fontWeight = FontWeight.Black,
                )
                Spacer(Modifier.width(8.dp))
                Text("очков", color = BbColors.Muted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 8.dp))
            }

            Spacer(Modifier.height(14.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(BbColors.Bg.copy(alpha = 0.5f))
                    .padding(12.dp),
            ) {
                InfoBit("Мин. ставка", Format.points(config.predictions.minStake), Modifier.weight(1f))
                InfoBit("Макс. ставка", Format.points(config.predictions.maxStake), Modifier.weight(1f))
                InfoBit("Мин. приз", Format.points(config.prizes.minRequest), Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun InfoBit(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, color = BbColors.Muted, fontSize = 10.sp)
        Text(value, color = BbColors.Text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun MiniStat(label: String, value: String, modifier: Modifier = Modifier, accent: Color) {
    Box(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(BbColors.Card)
            .border(1.dp, BbColors.Border, RoundedCornerShape(16.dp))
            .padding(12.dp),
    ) {
        Column {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(accent),
            )
            Spacer(Modifier.height(8.dp))
            Text(value, color = BbColors.Text, fontSize = 18.sp, fontWeight = FontWeight.Black)
            Text(label, color = BbColors.Muted, fontSize = 11.sp)
        }
    }
}

@Composable
fun EventCardCompact(event: SportEvent, onClick: () -> Unit) {
    BbCard(Modifier.fillMaxWidth(), onClick = onClick) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(BbColors.Accent.copy(alpha = 0.14f))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Text(
                        Format.sportLabel(event.sport),
                        color = BbColors.Accent2,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(Modifier.width(8.dp))
                Text(event.league ?: "", color = BbColors.Muted, fontSize = 11.sp)
            }
            Text(Format.relative(event.startsAt), color = BbColors.Muted, fontSize = 11.sp)
        }

        Spacer(Modifier.height(12.dp))
        Text(
            "${event.teamHome} — ${event.teamAway}",
            color = BbColors.Text,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(4.dp))
        Text(Format.dateTime(event.startsAt), color = BbColors.Muted, fontSize = 12.sp)

        if (event.markets.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(event.markets.first().outcomes.take(4), key = { it.id }) { outcome ->
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(BbColors.CardHigh)
                            .border(1.dp, BbColors.Border, RoundedCornerShape(10.dp))
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(outcome.label, color = BbColors.Text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                Format.odds(outcome.odds),
                                color = BbColors.Accent2,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Black,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LeaderRow(entry: LeaderboardEntry) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(26.dp)
                .clip(CircleShape)
                .background(
                    if (entry.rank <= 3) AccentGradient else androidx.compose.ui.graphics.SolidColor(BbColors.CardHigh),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "${entry.rank}",
                color = if (entry.rank <= 3) Color.White else BbColors.Muted,
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
            )
        }
        Spacer(Modifier.width(10.dp))
        Avatar(entry.avatarSeed, entry.avatarUrl, size = 34)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(entry.username, color = BbColors.Text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "W ${entry.wins} · L ${entry.losses} · ${Format.percent(entry.winRate)}",
                color = BbColors.Muted,
                fontSize = 11.sp,
            )
        }
        Text(
            Format.points(entry.balance),
            color = BbColors.Accent2,
            fontSize = 15.sp,
            fontWeight = FontWeight.Black,
        )
    }
}

@Composable
fun PredictionRow(prediction: Prediction) {
    BbCard(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "${prediction.event.teamHome} — ${prediction.event.teamAway}",
                    color = BbColors.Text,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    "${prediction.marketTitle}: ${prediction.outcomeLabel} · кэф ${Format.odds(prediction.odds)}",
                    color = BbColors.Muted,
                    fontSize = 11.sp,
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(horizontalAlignment = Alignment.End) {
                StatusChip(prediction.status, Format.statusLabel(prediction.status))
                Spacer(Modifier.height(4.dp))
                Text(
                    if (prediction.status == "won") "+${Format.points(prediction.payout)}"
                    else "${Format.points(prediction.stake)} очк.",
                    color = if (prediction.status == "won") BbColors.OkSoft else BbColors.Muted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun ContestCard(rules: PrizeRules, onGoToPrizes: () -> Unit) {
    BbCard(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("Призовой фонд друзей", color = BbColors.Text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text(
                    if (rules.enabled) "Призы в Telegram Stars, вручную" else "Приём заявок на паузе",
                    color = BbColors.Muted,
                    fontSize = 11.sp,
                )
            }
            Box(
                Modifier
                    .clip(RoundedCornerShape(50))
                    .background(AccentGradient)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text(
                    Format.points(rules.remaining) + " очк.",
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        Spacer(Modifier.height(14.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(BbColors.Bg.copy(alpha = 0.5f))
                .padding(12.dp),
        ) {
            InfoBit("Всего фонд", Format.points(rules.maxFund), Modifier.weight(1f))
            InfoBit("Мин. заявка", Format.points(rules.minRequest), Modifier.weight(1f))
            InfoBit("Использовано", Format.points(rules.used), Modifier.weight(1f))
        }

        if (rules.rulesText.isNotBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(rules.rulesText, color = BbColors.Muted, fontSize = 11.sp, lineHeight = 16.sp)
        }

        Spacer(Modifier.height(12.dp))
        GhostButton("Запросить приз", Modifier.fillMaxWidth(), enabled = rules.enabled, onClick = onGoToPrizes)
    }
}

