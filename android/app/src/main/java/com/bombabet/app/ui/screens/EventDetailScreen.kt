package com.bombabet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bombabet.app.data.model.Market
import com.bombabet.app.data.model.Outcome
import com.bombabet.app.data.model.PredictionSettings
import com.bombabet.app.data.model.SportEvent
import com.bombabet.app.ui.components.BbCard
import com.bombabet.app.ui.components.GhostButton
import com.bombabet.app.ui.components.GradientButton
import com.bombabet.app.ui.components.StatusChip
import com.bombabet.app.ui.theme.AccentGradient
import com.bombabet.app.ui.theme.BbColors
import com.bombabet.app.util.Format

@Composable
fun EventDetailScreen(
    event: SportEvent?,
    settings: PredictionSettings,
    balance: Double,
    busy: Boolean,
    onBack: () -> Unit,
    onPlace: (event: SportEvent, market: Market, outcome: Outcome, stake: Int) -> Unit,
) {
    var selection by remember { mutableStateOf<Pair<Market, Outcome>?>(null) }
    var stakeText by remember { mutableStateOf("") }
    var dialogError by remember { mutableStateOf<String?>(null) }

    if (event == null) {
        Box(Modifier.fillMaxSize().background(BbColors.Bg), contentAlignment = Alignment.Center) {
            com.bombabet.app.ui.components.LoadingBox()
        }
        return
    }
    val currentEvent = event

    Column(Modifier.fillMaxSize().background(BbColors.Bg)) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GhostButton("Назад", onClick = onBack)
            Spacer(Modifier.width(12.dp))
            Text("Детали события", color = BbColors.Text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }

        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(BbColors.Card)
                    .border(1.dp, BbColors.Border, RoundedCornerShape(20.dp))
                    .padding(18.dp),
            ) {
                Column {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(BbColors.Accent.copy(alpha = 0.14f))
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                        ) {
                            Text(Format.sportLabel(currentEvent.sport), color = BbColors.Accent2, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        StatusChip(currentEvent.status, Format.statusLabel(currentEvent.status))
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(
                        currentEvent.teamHome,
                        color = BbColors.Text,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Text("против", color = BbColors.Muted, fontSize = 12.sp)
                    Text(
                        currentEvent.teamAway,
                        color = BbColors.Text,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(currentEvent.league ?: "", color = BbColors.Muted, fontSize = 12.sp)
                    Text(
                        "${Format.fullDateTime(currentEvent.startsAt)} · ${Format.relative(currentEvent.startsAt)}",
                        color = BbColors.Muted,
                        fontSize = 12.sp,
                    )
                    if (currentEvent.homeScore != null && currentEvent.awayScore != null) {
                        Spacer(Modifier.height(12.dp))
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(BbColors.Bg2)
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                        ) {
                            Text(
                                "Итоговый счёт ${currentEvent.homeScore}:${currentEvent.awayScore}",
                                color = BbColors.OkSoft,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Text("ВИРТУАЛЬНЫЕ КОЭФФИЦИЕНТЫ", color = BbColors.Muted, fontSize = 10.sp, letterSpacing = 1.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))

            val bettable = currentEvent.status == "upcoming" || currentEvent.status == "live"
            currentEvent.markets.forEach { market ->
                BbCard(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                    Text(market.title, color = BbColors.Text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(12.dp))
                    market.outcomes.forEach { outcome ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(
                                    if (outcome.isWinner == true) BbColors.Ok.copy(alpha = 0.1f) else BbColors.CardHigh,
                                )
                                .clickable(enabled = bettable && settings.enabled) {
                                    selection = market to outcome
                                    stakeText = settings.minStake.toString()
                                    dialogError = null
                                }
                                .padding(14.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                outcome.label,
                                color = BbColors.Text,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (outcome.isWinner == true) {
                                    Text("✅ ", fontSize = 12.sp)
                                }
                                Text(
                                    Format.odds(outcome.odds),
                                    color = if (outcome.isWinner == true) BbColors.OkSoft else BbColors.Accent2,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Black,
                                )
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }
            }
            Spacer(Modifier.height(70.dp))
        }
    }

    val current = selection
    if (current != null) {
        val (market, outcome) = current
        val stake = stakeText.toIntOrNull() ?: 0
        AlertDialog(
            onDismissRequest = { if (!busy) selection = null },
            containerColor = BbColors.CardHigh,
            titleContentColor = BbColors.Text,
            textContentColor = BbColors.Text,
            title = { Text("Подтверждение прогноза", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text("${market.title}: ${outcome.label}", color = BbColors.Text, fontSize = 13.sp)
                    Text("Коэффициент ${Format.odds(outcome.odds)}", color = BbColors.Muted, fontSize = 12.sp)
                    Spacer(Modifier.height(12.dp))
                    BbField(
                        value = stakeText,
                        onValueChange = { stakeText = it.filter { c -> c.isDigit() }.take(7) },
                        label = "Очки",
                        keyboardType = androidx.compose.ui.text.input.KeyboardType.Number,
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Баланс", color = BbColors.Muted, fontSize = 12.sp)
                        Text(Format.points(balance), color = BbColors.Text, fontSize = 12.sp)
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Возможный выигрыш", color = BbColors.Muted, fontSize = 12.sp)
                        Text("+${Format.points(stake * outcome.odds)}", color = BbColors.OkSoft, fontSize = 13.sp, fontWeight = FontWeight.Black)
                    }
                    if (dialogError != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(dialogError!!, color = BbColors.DangerSoft, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                GradientButton(
                    text = "Сделать прогноз",
                    loading = busy,
                    enabled = stake >= settings.minStake && stake <= balance && stake <= settings.maxStake,
                    onClick = {
                        dialogError = when {
                            stake < settings.minStake -> "Минимум ${settings.minStake}"
                            stake > settings.maxStake -> "Максимум ${settings.maxStake}"
                            stake > balance -> "Недостаточно очков"
                            else -> null
                        }
                        if (dialogError == null) {
                            onPlace(currentEvent, market, outcome, stake)
                            selection = null
                        }
                    },
                )
            },
            dismissButton = { GhostButton("Отмена") { selection = null } },
        )
    }
}
