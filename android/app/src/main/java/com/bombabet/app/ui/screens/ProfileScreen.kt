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
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bombabet.app.data.model.AppConfig
import com.bombabet.app.data.model.LedgerEntry
import com.bombabet.app.data.model.User
import com.bombabet.app.ui.components.Avatar
import com.bombabet.app.ui.components.BbCard
import com.bombabet.app.ui.components.EmptyState
import com.bombabet.app.ui.components.GhostButton
import com.bombabet.app.ui.components.GradientButton
import com.bombabet.app.ui.components.SectionTitle
import com.bombabet.app.ui.components.deltaColor
import com.bombabet.app.ui.theme.AccentGradient
import com.bombabet.app.ui.theme.BbColors
import com.bombabet.app.util.Format

@Composable
fun ProfileScreen(
    user: User?,
    config: AppConfig,
    ledger: List<LedgerEntry>?,
    busy: Boolean,
    onClaimBonus: () -> Unit,
    onSaveProfile: (telegram: String?, avatarSeed: String?) -> Unit,
    onChangePassword: (current: String?, newPassword: String) -> Unit,
    onLogout: () -> Unit,
) {
    var showTelegramDialog by remember { mutableStateOf(false) }
    var showPasswordDialog by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(BbColors.Bg),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column {
                Text("Профиль", color = BbColors.Text, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(12.dp))
                ProfileHeaderCard(user)
            }
        }

        item {
            BbCard(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column {
                        Text("Ежедневный бонус", color = BbColors.Text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Spacer(Modifier.height(3.dp))
                        Text(
                            "Шанс ${Format.percent(config.bonuses.dailyChance * 100)} · от ${config.bonuses.dailyMin} до ${config.bonuses.dailyMax} очков",
                            color = BbColors.Muted,
                            fontSize = 11.sp,
                        )
                        Text("Не чаще одного раза в сутки", color = BbColors.Muted, fontSize = 10.sp)
                    }
                }
                Spacer(Modifier.height(12.dp))
                GradientButton(
                    text = "Забрать бонус",
                    modifier = Modifier.fillMaxWidth(),
                    loading = busy,
                    enabled = config.bonuses.enabled,
                    onClick = onClaimBonus,
                )
                if (!config.bonuses.enabled) {
                    Spacer(Modifier.height(8.dp))
                    Text("Бонусы отключены администратором", color = BbColors.DangerSoft, fontSize = 11.sp)
                }
            }
        }

        item {
            BbCard(Modifier.fillMaxWidth()) {
                SectionTitle("Настройки аккаунта")
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("Telegram", color = BbColors.Text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            user?.telegramUsername?.let { "@$it" } ?: "не указан",
                            color = BbColors.Muted,
                            fontSize = 11.sp,
                        )
                    }
                    GhostButton("Изменить") { showTelegramDialog = true }
                }
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("Пароль", color = BbColors.Text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Text("смена пароля", color = BbColors.Muted, fontSize = 11.sp)
                    }
                    GhostButton("Сменить") { showPasswordDialog = true }
                }
            }
        }

        item { SectionTitle("История баланса") }

        when {
            ledger == null -> item { com.bombabet.app.ui.components.LoadingBox() }
            ledger.isEmpty() -> item { EmptyState("Операций пока нет", emoji = "🧾") }
            else -> items(ledger, key = { it.id }) { LedgerRow(it) }
        }

        item {
            BbCard(Modifier.fillMaxWidth()) {
                Text("О проекте", color = BbColors.Text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Spacer(Modifier.height(8.dp))
                Text(
                    config.disclaimer,
                    color = BbColors.Muted,
                    fontSize = 11.sp,
                    lineHeight = 16.sp,
                )
                Spacer(Modifier.height(8.dp))
                Text("ID аккаунта: ${user?.id ?: "—"}", color = BbColors.Muted, fontSize = 10.sp)
                Text("Зарегистрирован: ${Format.date(user?.createdAt)}", color = BbColors.Muted, fontSize = 10.sp)
            }
        }

        item {
            GhostButton("Выйти из аккаунта", Modifier.fillMaxWidth(), onClick = onLogout)
        }

        item { Spacer(Modifier.height(60.dp)) }
    }

    if (showTelegramDialog) {
        var tg by remember { mutableStateOf(user?.telegramUsername ?: "") }
        AlertDialog(
            onDismissRequest = { showTelegramDialog = false },
            containerColor = BbColors.CardHigh,
            titleContentColor = BbColors.Text,
            textContentColor = BbColors.Text,
            title = { Text("Telegram для призов", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    BbField(tg, { tg = it }, "Ваш Telegram @username")
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Администратор использует этот @username, чтобы выдать приз в Telegram Stars.",
                        color = BbColors.Muted,
                        fontSize = 11.sp,
                    )
                }
            },
            confirmButton = {
                GradientButton("Сохранить") {
                    onSaveProfile(tg.trim().removePrefix("@").ifBlank { null }, null)
                    showTelegramDialog = false
                }
            },
            dismissButton = { GhostButton("Отмена") { showTelegramDialog = false } },
        )
    }

    if (showPasswordDialog) {
        var current by remember { mutableStateOf("") }
        var next by remember { mutableStateOf("") }
        var localError by remember { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { showPasswordDialog = false },
            containerColor = BbColors.CardHigh,
            titleContentColor = BbColors.Text,
            textContentColor = BbColors.Text,
            title = { Text("Смена пароля", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    BbField(current, { current = it }, "Текущий пароль", isPassword = true)
                    Spacer(Modifier.height(10.dp))
                    BbField(next, { next = it }, "Новый пароль (мин. 8)", isPassword = true, keyboardType = KeyboardType.Password)
                    if (localError != null) {
                        Spacer(Modifier.height(10.dp))
                        Text(localError!!, color = BbColors.DangerSoft, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                GradientButton("Сменить пароль") {
                    if (next.length < 8) {
                        localError = "Новый пароль минимум 8 символов"
                    } else {
                        onChangePassword(current.ifBlank { null }, next)
                        showPasswordDialog = false
                    }
                }
            },
            dismissButton = { GhostButton("Отмена") { showPasswordDialog = false } },
        )
    }
}

@Composable
private fun ProfileHeaderCard(user: User?) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(BbColors.Card)
            .border(1.dp, BbColors.Border, RoundedCornerShape(20.dp))
            .padding(18.dp),
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .width(4.dp)
                        .height(58.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(AccentGradient),
                )
                Spacer(Modifier.width(14.dp))
                Avatar(user?.avatarSeed ?: "bb", user?.avatarUrl, size = 58, border = true)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        user?.username ?: "Гость",
                        color = BbColors.Text,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Text(
                        "ID ${user?.id?.take(8) ?: "—"}",
                        color = BbColors.Muted,
                        fontSize = 11.sp,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "${Format.points(user?.balance ?: 0.0)} очков",
                        color = BbColors.Accent2,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Text(
                        "выводимо: ${Format.points(user?.withdrawableBalance ?: 0.0)}",
                        color = BbColors.Muted,
                        fontSize = 11.sp,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                ProfileStat("Прогнозов", Format.points(user?.stats?.total ?: 0))
                ProfileStat("Побед", Format.points(user?.stats?.won ?: 0))
                ProfileStat("Поражений", Format.points(user?.stats?.lost ?: 0))
                ProfileStat("Winrate", Format.percent(user?.stats?.winRate ?: 0.0))
            }
        }
    }
}

@Composable
private fun ProfileStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = BbColors.Text, fontSize = 15.sp, fontWeight = FontWeight.Black)
        Text(label, color = BbColors.Muted, fontSize = 10.sp)
    }
}

@Composable
private fun LedgerRow(entry: LedgerEntry) {
    BbCard(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(ledgerReason(entry.reason), color = BbColors.Text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                if (!entry.note.isNullOrBlank()) {
                    Text(entry.note, color = BbColors.Muted, fontSize = 11.sp)
                }
                Text(Format.fullDateTime(entry.createdAt), color = BbColors.Muted.copy(alpha = 0.7f), fontSize = 10.sp)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    (if (entry.delta > 0) "+" else "") + Format.points(entry.delta),
                    color = deltaColor(entry.delta),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                )
                Text(
                    "баланс ${Format.points(entry.balanceAfter)} · выводимо ${Format.points(entry.withdrawableAfter)}",
                    color = BbColors.Muted,
                    fontSize = 10.sp,
                )
            }
        }
    }
}

private fun ledgerReason(reason: String): String = when (reason) {
    "signup_bonus" -> "Приветственный бонус"
    "daily_bonus" -> "Случайный бонус"
    "prediction_stake" -> "Ставка на прогноз"
    "prediction_win" -> "Выигрыш по прогнозу"
    "prize_request" -> "Заявка на приз"
    "prize_refund" -> "Возврат по заявке"
    "admin_adjustment" -> "Корректировка администратором"
    "prize_cancel" -> "Отмена заявки"
    else -> reason
}
