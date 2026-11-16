package com.bombabet.app.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

object BbColors {
    val Bg = Color(0xFF0A0A0C)
    val Bg2 = Color(0xFF121216)
    val Card = Color(0xFF15151B)
    val CardHigh = Color(0xFF1C1C23)
    val Border = Color(0xFF26262F)
    val Text = Color(0xFFF2F2F5)
    val Muted = Color(0xFF8B8B99)
    val Accent = Color(0xFFFF3B30)
    val Accent2 = Color(0xFFFF7A18)
    val Amber = Color(0xFFFFB020)
    val Ok = Color(0xFF2FBF71)
    val OkSoft = Color(0xFF6EE7A4)
    val Danger = Color(0xFFFF5A50)
    val DangerSoft = Color(0xFFFF9B95)
    val WarnSoft = Color(0xFFFFCE6B)
}

val AccentGradient = Brush.linearGradient(listOf(BbColors.Accent, BbColors.Accent2))

val CardGradient = Brush.verticalGradient(
    listOf(Color(0xFF1A1A22), Color(0xFF131318)),
)
