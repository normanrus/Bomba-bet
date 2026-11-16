package com.bombabet.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bombabet.app.data.repo.ApiResult
import com.bombabet.app.data.repo.AuthOutcome
import com.bombabet.app.data.repo.BombaBetRepository
import com.bombabet.app.ui.components.BbCard
import com.bombabet.app.ui.components.GradientButton
import com.bombabet.app.ui.theme.AccentGradient
import com.bombabet.app.ui.theme.BbColors
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

@Composable
fun AuthScreen(
    repository: BombaBetRepository,
    tagline: String,
    onAuthenticated: (AuthOutcome) -> Unit,
) {
    var mode by remember { mutableStateOf(AuthMode.Login) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var telegram by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun submit() {
        error = null
        if (username.trim().length < 3) {
            error = "Никнейм минимум 3 символа"
            return
        }
        if (password.length < 8) {
            error = "Пароль минимум 8 символов"
            return
        }
        busy = true
        scope.launch {
            val result = if (mode == AuthMode.Login) {
                repository.login(username.trim(), password)
            } else {
                repository.register(username.trim(), password, telegram.trim().ifBlank { null })
            }
            busy = false
            when (result) {
                is ApiResult.Ok -> onAuthenticated(result.value)
                is ApiResult.Err -> error = result.message
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BbColors.Bg)
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spacer(Modifier.height(40.dp))

        Box(
            Modifier
                .size(74.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(AccentGradient),
            contentAlignment = Alignment.Center,
        ) {
            Text("💥", fontSize = 38.sp)
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "БОМБА БЕТ",
            color = BbColors.Text,
            fontSize = 28.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 1.5.sp,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            tagline.ifBlank { "Дружеские спортивные прогнозы" },
            color = BbColors.Muted,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(28.dp))

        BbCard(Modifier.fillMaxWidth()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(BbColors.Bg2)
                    .padding(4.dp),
            ) {
                ModeTab("Вход", mode == AuthMode.Login, Modifier.weight(1f)) {
                    mode = AuthMode.Login
                    error = null
                }
                ModeTab("Регистрация", mode == AuthMode.Register, Modifier.weight(1f)) {
                    mode = AuthMode.Register
                    error = null
                }
            }

            Spacer(Modifier.height(18.dp))

            BbField(
                value = username,
                onValueChange = { username = it },
                label = "Никнейм",
                keyboardType = KeyboardType.Text,
            )
            Spacer(Modifier.height(12.dp))
            BbField(
                value = password,
                onValueChange = { password = it },
                label = "Пароль",
                isPassword = true,
            )

            AnimatedVisibility(visible = mode == AuthMode.Register) {
                Column {
                    Spacer(Modifier.height(12.dp))
                    BbField(
                        value = telegram,
                        onValueChange = { telegram = it },
                        label = "Telegram @username (для призов)",
                        keyboardType = KeyboardType.Text,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Призы выдаются вручную в Telegram Stars. Укажите свой @username, чтобы администратор мог связаться с вами.",
                        color = BbColors.Muted,
                        fontSize = 11.sp,
                    )
                }
            }

            if (error != null) {
                Spacer(Modifier.height(14.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(BbColors.Danger.copy(alpha = 0.12f))
                        .padding(12.dp),
                ) {
                    Text(error!!, color = BbColors.DangerSoft, fontSize = 12.sp)
                }
            }

            Spacer(Modifier.height(20.dp))
            GradientButton(
                text = if (mode == AuthMode.Login) "Войти" else "Создать аккаунт",
                modifier = Modifier.fillMaxWidth(),
                loading = busy,
                onClick = { submit() },
            )
        }

        Spacer(Modifier.height(22.dp))
        Text(
            "Очки виртуальные. Депозиты, платные ставки и азартные игры отсутствуют — участие бесплатное.",
            color = BbColors.Muted.copy(alpha = 0.8f),
            fontSize = 11.sp,
            textAlign = TextAlign.Center,
            lineHeight = 16.sp,
        )
        Spacer(Modifier.height(30.dp))
    }
}

private enum class AuthMode { Login, Register }

@Composable
private fun ModeTab(text: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) BbColors.Accent.copy(alpha = 0.18f) else Color.Transparent)
            .clickable { onClick() }
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = if (selected) BbColors.Text else BbColors.Muted,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
        )
    }
}

@Composable
fun BbField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    isPassword: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, fontSize = 12.sp) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        visualTransformation = if (isPassword) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = BbColors.Accent,
            unfocusedBorderColor = BbColors.Border,
            focusedLabelColor = BbColors.Accent,
            unfocusedLabelColor = BbColors.Muted,
            focusedTextColor = BbColors.Text,
            unfocusedTextColor = BbColors.Text,
            cursorColor = BbColors.Accent,
            focusedContainerColor = BbColors.Bg2,
            unfocusedContainerColor = BbColors.Bg2,
        ),
    )
}
