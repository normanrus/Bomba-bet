package com.bombabet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bombabet.app.ui.components.BbCard
import com.bombabet.app.ui.components.GradientButton
import com.bombabet.app.ui.theme.BbColors

/**
 * Shown once for a freshly seeded account: the bootstrap password must be
 * replaced before the app unlocks.
 */
@Composable
fun ForcePasswordChangeScreen(
    username: String,
    onSubmit: (current: String?, newPassword: String, onDone: (Boolean, String) -> Unit) -> Unit,
) {
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BbColors.Bg)
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(BbColors.Amber.copy(alpha = 0.16f))
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Text("🔐 Требуется смена пароля", color = BbColors.WarnSoft, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
        Spacer(Modifier.height(18.dp))
        Text(
            "Привет, $username!",
            color = BbColors.Text,
            fontSize = 22.sp,
            fontWeight = FontWeight.Black,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Учётная запись создана с временным паролем. Задайте свой пароль, чтобы продолжить.",
            color = BbColors.Muted,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            lineHeight = 17.sp,
        )
        Spacer(Modifier.height(22.dp))

        BbCard(Modifier.fillMaxWidth()) {
            BbField(current, { current = it }, "Текущий (временный) пароль", isPassword = true, keyboardType = KeyboardType.Password)
            Spacer(Modifier.height(12.dp))
            BbField(next, { next = it }, "Новый пароль (мин. 8)", isPassword = true, keyboardType = KeyboardType.Password)
            Spacer(Modifier.height(12.dp))
            BbField(confirm, { confirm = it }, "Повторите новый пароль", isPassword = true, keyboardType = KeyboardType.Password)
            if (error != null) {
                Spacer(Modifier.height(12.dp))
                Text(error!!, color = BbColors.DangerSoft, fontSize = 12.sp)
            }
            Spacer(Modifier.height(18.dp))
            GradientButton("Сохранить пароль", Modifier.fillMaxWidth(), loading = busy) {
                error = when {
                    next.length < 8 -> "Пароль минимум 8 символов"
                    next != confirm -> "Пароли не совпадают"
                    else -> null
                }
                if (error == null) {
                    busy = true
                    onSubmit(current.ifBlank { null }, next) { ok, message ->
                        busy = false
                        if (!ok) error = message
                    }
                }
            }
        }
    }
}
