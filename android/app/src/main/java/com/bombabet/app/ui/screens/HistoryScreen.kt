package com.bombabet.app.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bombabet.app.data.model.Prediction
import com.bombabet.app.data.model.UserStats
import com.bombabet.app.ui.components.BbCard
import com.bombabet.app.ui.components.EmptyState
import com.bombabet.app.ui.components.ErrorBox
import com.bombabet.app.ui.components.LoadingBox
import com.bombabet.app.ui.components.Pill
import com.bombabet.app.ui.components.SectionTitle
import com.bombabet.app.ui.theme.BbColors
import com.bombabet.app.util.Format

@Composable
fun HistoryScreen(
    predictions: List<Prediction>?,
    stats: UserStats?,
    filter: String,
    error: String?,
    onFilter: (String) -> Unit,
    onRetry: () -> Unit,
) {
    val filters = listOf(
        "all" to "Все",
        "pending" to "Ожидают",
        "won" to "Выиграли",
        "lost" to "Проиграли",
    )

    Column(Modifier.fillMaxSize().background(BbColors.Bg)) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text("Мои прогнозы", color = BbColors.Text, fontSize = 20.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                HistoryStat("Всего", Format.points(stats?.total ?: 0), Modifier.weight(1f), BbColors.Accent)
                HistoryStat("Побед", Format.points(stats?.won ?: 0), Modifier.weight(1f), BbColors.Ok)
                HistoryStat("Пораж.", Format.points(stats?.lost ?: 0), Modifier.weight(1f), BbColors.Danger)
                HistoryStat("Winrate", Format.percent(stats?.winRate ?: 0.0), Modifier.weight(1f), BbColors.Amber)
            }
            Spacer(Modifier.height(12.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(filters) { (key, label) -> Pill(label, filter == key) { onFilter(key) } }
            }
        }

        when {
            error != null -> Box(Modifier.padding(16.dp)) { ErrorBox(error, onRetry) }
            predictions == null -> LoadingBox()
            predictions.isEmpty() -> EmptyState("Прогнозов нет", "Сделайте первый прогноз на событие", "🎯")
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(predictions, key = { it.id }) { PredictionDetailCard(it) }
                item { Spacer(Modifier.height(60.dp)) }
            }
        }
    }
}

@Composable
private fun HistoryStat(label: String, value: String, modifier: Modifier = Modifier, accent: androidx.compose.ui.graphics.Color) {
    Box(
        modifier
            .background(BbColors.Card, androidx.compose.foundation.shape.RoundedCornerShape(14.dp))
            .padding(10.dp),
    ) {
        Column {
            Text(value, color = accent, fontSize = 16.sp, fontWeight = FontWeight.Black)
            Text(label, color = BbColors.Muted, fontSize = 10.sp)
        }
    }
}

@Composable
private fun PredictionDetailCard(prediction: Prediction) {
    BbCard(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text(
                    "${prediction.event.teamHome} — ${prediction.event.teamAway}",
                    color = BbColors.Text,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    "${prediction.marketTitle} · ${prediction.outcomeLabel}",
                    color = BbColors.Muted,
                    fontSize = 12.sp,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    Format.fullDateTime(prediction.placedAt),
                    color = BbColors.Muted.copy(alpha = 0.7f),
                    fontSize = 10.sp,
                )
            }
            com.bombabet.app.ui.components.StatusChip(
                prediction.status,
                Format.statusLabel(prediction.status),
            )
        }

        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            StatPair("Ставка", "${Format.points(prediction.stake)} очк.")
            StatPair("Кэф", Format.odds(prediction.odds))
            StatPair(
                if (prediction.status == "won") "Выплата" else "Потенциал",
                if (prediction.status == "won") "+${Format.points(prediction.payout)}"
                else Format.points(prediction.potentialPayout),
                if (prediction.status == "won") BbColors.OkSoft else BbColors.Muted,
            )
        }

        if (prediction.event.status == "finished" && prediction.event.homeScore != null) {
            Spacer(Modifier.height(10.dp))
            Text(
                "Итоговый счёт: ${prediction.event.homeScore}:${prediction.event.awayScore}",
                color = BbColors.Muted,
                fontSize = 11.sp,
            )
        }
    }
}

@Composable
private fun StatPair(label: String, value: String, valueColor: androidx.compose.ui.graphics.Color = BbColors.Text) {
    Column {
        Text(label, color = BbColors.Muted, fontSize = 10.sp)
        Text(value, color = valueColor, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}
