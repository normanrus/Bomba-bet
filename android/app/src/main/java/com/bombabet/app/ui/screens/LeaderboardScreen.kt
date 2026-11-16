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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bombabet.app.data.model.LeaderboardEntry
import com.bombabet.app.ui.components.BbCard
import com.bombabet.app.ui.components.EmptyState
import com.bombabet.app.ui.components.ErrorBox
import com.bombabet.app.ui.components.LoadingBox
import com.bombabet.app.ui.components.Pill
import com.bombabet.app.ui.theme.BbColors
import com.bombabet.app.ui.screens.LeaderRow

@Composable
fun LeaderboardScreen(
    leaders: List<LeaderboardEntry>?,
    sort: String,
    error: String?,
    onSort: (String) -> Unit,
    onRetry: () -> Unit,
) {
    val sorts = listOf(
        "balance" to "По балансу",
        "wins" to "По победам",
        "winrate" to "По winrate",
    )

    Column(Modifier.fillMaxSize().background(BbColors.Bg)) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text("Таблица лидеров", color = BbColors.Text, fontSize = 20.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(4.dp))
            Text("Рейтинг обновляется автоматически после каждого расчёта", color = BbColors.Muted, fontSize = 11.sp)
            Spacer(Modifier.height(12.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(sorts) { (key, label) -> Pill(label, sort == key) { onSort(key) } }
            }
        }

        when {
            error != null -> Box(Modifier.padding(16.dp)) { ErrorBox(error, onRetry) }
            leaders == null -> LoadingBox()
            leaders.isEmpty() -> EmptyState("Пока никого нет", emoji = "🏆")
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(leaders, key = { it.id }) { entry ->
                    BbCard(Modifier.fillMaxWidth()) { LeaderRow(entry) }
                }
                item { Spacer(Modifier.height(60.dp)) }
            }
        }
    }
}
