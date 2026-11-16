package com.bombabet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bombabet.app.data.model.Market
import com.bombabet.app.data.model.Outcome
import com.bombabet.app.data.model.PredictionSettings
import com.bombabet.app.data.model.SportEvent
import com.bombabet.app.ui.components.BbCard
import com.bombabet.app.ui.components.EmptyState
import com.bombabet.app.ui.components.ErrorBox
import com.bombabet.app.ui.components.GradientButton
import com.bombabet.app.ui.components.LoadingBox
import com.bombabet.app.ui.components.Pill
import com.bombabet.app.ui.components.StatusChip
import com.bombabet.app.ui.theme.BbColors
import com.bombabet.app.util.Format

private val filters = listOf(
    "upcoming" to "Предстоящие",
    "live" to "В игре",
    "finished" to "Завершённые",
    "all" to "Все",
)

@Composable
fun EventsScreen(
    events: List<SportEvent>?,
    filter: String,
    settings: PredictionSettings,
    balance: Double,
    error: String?,
    busy: Boolean,
    onFilter: (String) -> Unit,
    onRetry: () -> Unit,
    onPlace: (event: SportEvent, market: Market, outcome: Outcome, stake: Int) -> Unit,
    onOpenEvent: (String) -> Unit,
) {
    var selection by remember { mutableStateOf<Triple<SportEvent, Market, Outcome>?>(null) }
    var stakeText by remember { mutableStateOf("") }
    var dialogError by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().background(BbColors.Bg)) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text("События и прогнозы", color = BbColors.Text, fontSize = 20.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(4.dp))
            Text(
                "Прогнозы бесплатные. Коэффициенты — виртуальные игровые множители.",
                color = BbColors.Muted,
                fontSize = 11.sp,
            )
            Spacer(Modifier.height(12.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(filters) { (key, label) ->
                    Pill(label, filter == key) { onFilter(key) }
                }
            }
        }

        when {
            error != null -> Box(Modifier.padding(16.dp)) { ErrorBox(error, onRetry) }
            events == null -> LoadingBox()
            events.isEmpty() -> EmptyState("Нет событий в этой категории", "Выберите другой фильтр", "🏟️")
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(events, key = { it.id }) { event ->
                    EventCardFull(
                        event = event,
                        settings = settings,
                        onOpenEvent = { onOpenEvent(event.id) },
                        onPick = { market, outcome ->
                            selection = Triple(event, market, outcome)
                            stakeText = settings.minStake.toString()
                            dialogError = null
                        },
                    )
                }
                item { Spacer(Modifier.height(60.dp)) }
            }
        }
    }

    val current = selection
    if (current != null) {
        val (event, market, outcome) = current
        val stake = stakeText.toIntOrNull() ?: 0
        val potential = stake * outcome.odds
        AlertDialog(
            onDismissRequest = { if (!busy) selection = null },
            containerColor = BbColors.CardHigh,
            titleContentColor = BbColors.Text,
            textContentColor = BbColors.Text,
            title = { Text("Подтверждение прогноза", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(
                        "${event.teamHome} — ${event.teamAway}",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text("${market.title}: ${outcome.label}", color = BbColors.Muted, fontSize = 12.sp)
                    Text("Коэффициент: ${Format.odds(outcome.odds)}", color = BbColors.Muted, fontSize = 12.sp)
                    Spacer(Modifier.height(14.dp))
                    OutlinedTextField(
                        value = stakeText,
                        onValueChange = { stakeText = it.filter { c -> c.isDigit() }.take(7) },
                        label = { Text("Очки на прогноз", fontSize = 12.sp) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = BbColors.Accent,
                            unfocusedBorderColor = BbColors.Border,
                            focusedTextColor = BbColors.Text,
                            unfocusedTextColor = BbColors.Text,
                            focusedLabelColor = BbColors.Accent,
                            unfocusedLabelColor = BbColors.Muted,
                            cursorColor = BbColors.Accent,
                        ),
                    )
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(settings.minStake, 100, 500).distinct().forEach { preset ->
                            Pill("+$preset", false) { stakeText = preset.toString() }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Баланс", color = BbColors.Muted, fontSize = 12.sp)
                        Text(Format.points(balance), color = BbColors.Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Возможный выигрыш", color = BbColors.Muted, fontSize = 12.sp)
                        Text(
                            "+${Format.points(potential)}",
                            color = BbColors.OkSoft,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Black,
                        )
                    }
                    if (dialogError != null) {
                        Spacer(Modifier.height(10.dp))
                        Text(dialogError!!, color = BbColors.DangerSoft, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                GradientButton(
                    text = "Сделать прогноз",
                    loading = busy,
                    enabled = stake >= settings.minStake && stake <= settings.maxStake && stake <= balance,
                    onClick = {
                        dialogError = when {
                            stake < settings.minStake -> "Минимальная ставка ${settings.minStake}"
                            stake > settings.maxStake -> "Максимальная ставка ${settings.maxStake}"
                            stake > balance -> "Недостаточно очков на балансе"
                            else -> null
                        }
                        if (dialogError == null) {
                            onPlace(event, market, outcome, stake)
                            selection = null
                        }
                    },
                )
            },
            dismissButton = {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .clickable(enabled = !busy) { selection = null }
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    Text("Отмена", color = BbColors.Muted, fontSize = 14.sp)
                }
            },
        )
    }
}

@Composable
private fun EventCardFull(
    event: SportEvent,
    settings: PredictionSettings,
    onOpenEvent: () -> Unit,
    onPick: (Market, Outcome) -> Unit,
) {
    BbCard(Modifier.fillMaxWidth()) {
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
                    Text(Format.sportLabel(event.sport), color = BbColors.Accent2, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(8.dp))
                Text(event.league ?: "", color = BbColors.Muted, fontSize = 11.sp)
            }
            StatusChip(event.status, Format.statusLabel(event.status))
        }

        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth().clickable { onOpenEvent() }, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    "${event.teamHome} — ${event.teamAway}",
                    color = BbColors.Text,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    "${Format.dateTime(event.startsAt)} · ${Format.relative(event.startsAt)}",
                    color = BbColors.Muted,
                    fontSize = 11.sp,
                )
            }
            if (event.status == "finished" && event.homeScore != null && event.awayScore != null) {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(BbColors.Bg2)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Text(
                        "${event.homeScore}:${event.awayScore}",
                        color = BbColors.Text,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Black,
                    )
                }
            }
        }

        val bettable = event.status == "upcoming" || event.status == "live"
        event.markets.forEach { market ->
            Spacer(Modifier.height(14.dp))
            Text(
                market.title.uppercase(),
                color = BbColors.Muted,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
            )
            Spacer(Modifier.height(8.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(market.outcomes, key = { it.id }) { outcome ->
                    OutcomeButton(
                        outcome = outcome,
                        enabled = bettable && settings.enabled && outcome.isActive,
                        onClick = { onPick(market, outcome) },
                    )
                }
            }
        }

        if (!settings.enabled) {
            Spacer(Modifier.height(12.dp))
            Text("Приём прогнозов временно отключён администратором", color = BbColors.DangerSoft, fontSize = 11.sp)
        }
    }
}

@Composable
private fun OutcomeButton(outcome: Outcome, enabled: Boolean, onClick: () -> Unit) {
    val isWinner = outcome.isWinner == true
    val border = when {
        isWinner -> BbColors.Ok
        enabled -> BbColors.Border
        else -> BbColors.Border.copy(alpha = 0.4f)
    }
    Column(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (isWinner) BbColors.Ok.copy(alpha = 0.12f) else BbColors.CardHigh)
            .border(1.dp, border, RoundedCornerShape(12.dp))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            outcome.label,
            color = if (enabled || isWinner) BbColors.Text else BbColors.Muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            Format.odds(outcome.odds),
            color = when {
                isWinner -> BbColors.OkSoft
                enabled -> BbColors.Accent2
                else -> BbColors.Muted
            },
            fontSize = 13.sp,
            fontWeight = FontWeight.Black,
        )
    }
}
