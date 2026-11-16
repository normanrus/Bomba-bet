package com.bombabet.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bombabet.app.ui.AppViewModel
import com.bombabet.app.ui.MainShell
import com.bombabet.app.ui.MainViewModel
import com.bombabet.app.ui.components.LoadingBox
import com.bombabet.app.ui.screens.AuthScreen
import com.bombabet.app.ui.screens.ForcePasswordChangeScreen
import com.bombabet.app.ui.theme.BbColors
import com.bombabet.app.ui.theme.BombaBetTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as BombaBetApp).container
        setContent {
            BombaBetTheme {
                BombaBetRoot(container)
            }
        }
    }
}

@Composable
private fun BombaBetRoot(container: AppContainer) {
    val appViewModel: AppViewModel = viewModel(factory = AppViewModel.Factory(container))
    val mainViewModel: MainViewModel = viewModel(factory = MainViewModel.Factory(container))
    val session by appViewModel.session.collectAsState()
    val config by appViewModel.config.collectAsState()

    Box(Modifier.fillMaxSize().background(BbColors.Bg)) {
        when {
            !session.ready -> SplashScreen()
            session.mustChangePassword -> ForcePasswordChangeScreen(
                username = session.user?.username ?: "игрок",
                onSubmit = { current, newPassword, done ->
                    appViewModel.changePassword(current, newPassword) { ok, message ->
                        done(ok, message)
                        if (ok) mainViewModel.refreshProfile()
                    }
                },
            )

            session.user == null -> AuthScreen(
                repository = container.repository,
                tagline = config.tagline,
                onAuthenticated = { outcome ->
                    appViewModel.onAuthenticated(outcome.user, outcome.mustChangePassword)
                    mainViewModel.refreshProfile()
                },
            )
            else -> MainShell(
                viewModel = mainViewModel,
                appViewModel = appViewModel,
                config = config,
            )
        }
    }
}

@Composable
private fun SplashScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        androidx.compose.foundation.layout.Column(
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("💥", fontSize = 46.sp)
            Text(
                "БОМБА БЕТ",
                color = BbColors.Text,
                fontSize = 24.sp,
                fontWeight = FontWeight.Black,
            )
            LoadingBox()
        }
    }
}
