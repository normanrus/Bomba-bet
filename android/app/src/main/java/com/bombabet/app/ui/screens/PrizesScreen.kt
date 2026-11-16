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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.bombabet.app.data.model.Prize
import com.bombabet.app.data.model.PrizeRules
import com.bombabet.app.data.model.User
import com.bombabet.app.ui.components.BbCard
import com.bombabet.app.ui.components.EmptyState
import com.bombabet.app.ui.components.ErrorBox
import com.bombabet.app.ui.components.GhostButton
import com.bombabet.app.ui.components.GradientButton
import com.bombabet.app.ui.components.LoadingBox
import com.bombabet.app.ui.components.SectionTitle
import com.bombabet.app.ui.components.StatusChip
import com.bombabet.app.ui.theme.BbColors
import com.bombabet.app.util.Format

@Composable
fun PrizesScreen(
    user: User?,
    prizes: List<Prize>?,
    rules: PrizeRules,
    error: String?,
    busy: Boolean,
    onRetry: () -> Unit,
    onSubmit: (amount: Int, telegram: String, note: String?) -> Unit,
    onCancel: (String) -> Unit,
) {
    var showDialog by remember { mutableStateOf(false) }
    var amount by remember { mutableStateOf("") }
    var telegram by remember { mutableStateOf(user?.telegramUsername ?: "") }
    var note by remember { mutableStateOf("") }
    var formError by remember { mutableStateOf<String?>(null) }

    val hasPending = prizes?.any { it.status == "pending" || it.status == "approved" } == true

    Column(Modifier.fillMaxSize().background(BbColors.Bg)) {
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Column {
                    Text("Призы", color = BbColors.Text, fontSize = 20.sp, fontWeight = FontWeight.Black)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Призы выдаются вручную администратором в Telegram Stars вне приложения.",
                        color = BbColors.Muted,
                        fontSize = 11.sp,
                    )
                }
            }

            item { FundCard(rules, user) }

            item {
                BbCard(Modifier.fillMaxWidth()) {
                    Text("Правила", color = BbColors.Text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        rules.rulesText.ifBlank {
                            "Заявка на приз попадает в очередь администратора. Он видит ваш никнейм, ID и историю выигрыша, после чего вручную подтверждает или отклоняет выдачу."
                        },
                        color = BbColors.Muted,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                    )
                    if (rules.note.isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(rules.note, color = BbColors.Accent2, fontSize = 11.sp)
                    }
                }
            }

            item {
                GradientButton(
                    text = if (hasPending) "Заявка уже в обработке" else "Запросить приз",
                    modifier = Modifier.fillMaxWidth(),
                    enabled = rules.enabled && !hasPending && !busy,
                    onClick = {
                        amount = (rules.minRequest.toInt().coerceAtLeast(1)).toString()
                        formError = null
                        showDialog = true
                    },
                )
            }

            if (!rules.enabled) {
                item {
                    Text(
                        "Заявки на призы временно отключены администратором.",
                        color = BbColors.DangerSoft,
                        fontSize = 12.sp,
                    )
                }
            }

            item { SectionTitle("История заявок") }

            if (error != null) {
                item { ErrorBox(error, onRetry) }
            }

            when {
                prizes == null -> item { LoadingBox() }
                prizes.isEmpty() -> item { EmptyState("Заявок пока нет", "Запросите приз, когда накопите очки", "🎁") }
                else -> items(prizes, key = { it.id }) { prize ->
                    PrizeCard(prize, onCancel)
                }
            }

            item { Spacer(Modifier.height(60.dp)) }
        }
    }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { if (!busy) showDialog = false },
            containerColor = BbColors.CardHigh,
            titleContentColor = BbColors.Text,
            textContentColor = BbColors.Text,
            title = { Text("Заявка на приз", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    BbField(
                        value = amount,
                        onValueChange = { amount = it.filter { c -> c.isDigit() }.take(7) },
                        label = "Сумма (мин. ${Format.points(rules.minRequest)})",
                        keyboardType = androidx.compose.ui.text.input.KeyboardType.Number,
                    )
                    Spacer(Modifier.height(10.dp))
                    BbField(
                        value = telegram,
                        onValueChange = { telegram = it },
                        label = "Ваш Telegram @username",
                    )
                    Spacer(Modifier.height(10.dp))
                    BbField(
                        value = note,
                        onValueChange = { note = it },
                        label = "Комментарий (необязательно)",
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Приз выдаётся вне приложения, в Telegram Stars. Администратор свяжется с вами по указанному @username.",
                        color = BbColors.Muted,
                        fontSize = 11.sp,
                        lineHeight = 15.sp,
                    )
                    if (formError != null) {
                        Spacer(Modifier.height(10.dp))
                        Text(formError!!, color = BbColors.DangerSoft, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                GradientButton(
                    text = "Отправить заявку",
                    loading = busy,
                    onClick = {
                        val value = amount.toIntOrNull() ?: 0
                        val cleanTg = telegram.trim().removePrefix("@")
                        formError = when {
                            value < rules.minRequest -> "Минимальная сумма ${Format.points(rules.minRequest)}"
                            value > (user?.balance ?: 0.0) -> "Недостаточно очков на балансе"
                            cleanTg.length < 5 -> "Укажите Telegram @username"
                            else -> null
                        }
                        if (formError == null) {
                            onSubmit(value, cleanTg, note.ifBlank { null })
                            showDialog = false
                        }
                    },
                )
            },
            dismissButton = {
                GhostButton("Отмена") { showDialog = false }
            },
        )
    }
}

@Composable
private fun FundCard(rules: PrizeRules, user: User?) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(BbColors.Card)
            .border(1.dp, BbColors.Accent.copy(alpha = 0.3f), RoundedCornerShape(20.dp))
            .padding(18.dp),
    ) {
        Column {
            Text("ПРИЗОВОЙ ФОНД", color = BbColors.Muted, fontSize = 10.sp, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Text(
                "${Format.points(rules.remaining)} / ${Format.points(rules.maxFund)}",
                color = BbColors.Text,
                fontSize = 24.sp,
                fontWeight = FontWeight.Black,
            )
            Spacer(Modifier.height(4.dp))
            Text("Выдано: ${Format.points(rules.used)} очков", color = BbColors.Muted, fontSize = 11.sp)
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("Ваш баланс", color = BbColors.Muted, fontSize = 10.sp)
                    Text(
                        Format.points(user?.balance ?: 0.0),
                        color = BbColors.Accent2,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Минимальная заявка", color = BbColors.Muted, fontSize = 10.sp)
                    Text(
                        Format.points(rules.minRequest),
                        color = BbColors.Text,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                    )
                }
            }
        }
    }
}

@Composable
private fun PrizeCard(prize: Prize, onCancel: (String) -> Unit) {
    BbCard(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    "${Format.points(prize.amount)} очков",
                    color = BbColors.Text,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Black,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    "Telegram: @${prize.telegramUsername}",
                    color = BbColors.Muted,
                    fontSize = 11.sp,
                )
                Text(
                    Format.fullDateTime(prize.requestedAt),
                    color = BbColors.Muted.copy(alpha = 0.7f),
                    fontSize = 10.sp,
                )
            }
            StatusChip(prize.status, Format.statusLabel(prize.status))
        }

        if (prize.rejectReason != null) {
            Spacer(Modifier.height(10.dp))
            Text("Причина отказа: ${prize.rejectReason}", color = BbColors.DangerSoft, fontSize = 11.sp)
        }
        if (prize.adminNote != null) {
            Spacer(Modifier.height(6.dp))
            Text("Комментарий админа: ${prize.adminNote}", color = BbColors.Muted, fontSize = 11.sp)
        }

        if (prize.status == "pending") {
            Spacer(Modifier.height(12.dp))
            GhostButton("Отменить заявку", Modifier.fillMaxWidth()) { onCancel(prize.id) }
        }
    }
}
