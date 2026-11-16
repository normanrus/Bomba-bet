package com.bombabet.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.bombabet.app.ui.theme.AccentGradient
import com.bombabet.app.ui.theme.BbColors
import kotlin.math.abs

@Composable
fun BbCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val base = modifier
        .clip(RoundedCornerShape(18.dp))
        .background(BbColors.Card)
        .border(1.dp, BbColors.Border, RoundedCornerShape(18.dp))
    Box(
        modifier = if (onClick != null) base.clickable { onClick() } else base,
    ) {
        Column(Modifier.padding(16.dp)) { content() }
    }
}

@Composable
fun GradientButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    onClick: () -> Unit,
) {
    val alpha by animateFloatAsState(if (enabled) 1f else 0.45f, tween(180), label = "btnAlpha")
    Box(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (enabled) AccentGradient else Brush.linearGradient(
                listOf(BbColors.Border, BbColors.Border),
            ))
            .clickable(enabled = enabled && !loading) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                color = Color.White,
                strokeWidth = 2.5.dp,
            )
        } else {
            Text(
                text = text,
                color = Color.White.copy(alpha = alpha),
                fontWeight = FontWeight.ExtraBold,
                fontSize = 15.sp,
            )
        }
    }
}

@Composable
fun GhostButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .height(46.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(BbColors.CardHigh)
            .border(1.dp, BbColors.Border, RoundedCornerShape(12.dp))
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = BbColors.Text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}

@Composable
fun StatusChip(status: String, label: String) {
    val (fg, bg) = statusColors(status)
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(label, color = fg, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

fun statusColors(status: String): Pair<Color, Color> = when (status) {
    "won", "issued", "approved", "finished", "active" ->
        BbColors.OkSoft to BbColors.Ok.copy(alpha = 0.16f)
    "lost", "rejected", "cancelled", "blocked" ->
        BbColors.DangerSoft to BbColors.Danger.copy(alpha = 0.16f)
    "pending", "upcoming", "live" ->
        BbColors.WarnSoft to BbColors.Amber.copy(alpha = 0.16f)
    else -> BbColors.Muted to BbColors.Muted.copy(alpha = 0.14f)
}

@Composable
fun Avatar(seed: String, url: String?, size: Int = 42, border: Boolean = false) {
    val hue = remember(seed) {
        var h = 0
        for (c in seed) h = (h * 31 + c.code) % 360
        h
    }
    val bg = Brush.linearGradient(
        listOf(
            Color.hsl(hue.toFloat(), 0.68f, 0.46f),
            Color.hsl(((hue + 45) % 360).toFloat(), 0.72f, 0.40f),
        ),
    )
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(bg)
            .then(if (border) Modifier.border(2.dp, BbColors.Accent.copy(alpha = 0.6f), CircleShape) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model = url,
                contentDescription = null,
                modifier = Modifier.size(size.dp).clip(CircleShape),
            )
        } else {
            Text(
                seed.take(1).uppercase(),
                color = Color.White,
                fontWeight = FontWeight.Black,
                fontSize = (size * 0.42).sp,
            )
        }
    }
}

@Composable
fun StatTile(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    accent: Color = BbColors.Accent,
    hint: String? = null,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(BbColors.Card)
            .border(1.dp, BbColors.Border, RoundedCornerShape(16.dp)),
    ) {
        Row {
            Box(
                Modifier
                    .width(3.dp)
                    .height(74.dp)
                    .background(Brush.verticalGradient(listOf(accent, accent.copy(alpha = 0.25f)))),
            )
            Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                Text(
                    label.uppercase(),
                    color = BbColors.Muted,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                )
                Spacer(Modifier.height(5.dp))
                Text(value, color = BbColors.Text, fontSize = 22.sp, fontWeight = FontWeight.Black)
                if (hint != null) {
                    Spacer(Modifier.height(2.dp))
                    Text(hint, color = BbColors.Muted, fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, trailing: String? = null) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(width = 4.dp, height = 16.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(AccentGradient),
            )
            Spacer(Modifier.width(9.dp))
            Text(text, color = BbColors.Text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
        if (trailing != null) {
            Text(trailing, color = BbColors.Muted, fontSize = 12.sp)
        }
    }
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = BbColors.Accent, strokeWidth = 3.dp)
    }
}

@Composable
fun EmptyState(title: String, subtitle: String? = null, emoji: String = "🤷") {
    Column(
        Modifier.fillMaxWidth().padding(36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(emoji, fontSize = 34.sp)
        Spacer(Modifier.height(10.dp))
        Text(title, color = BbColors.Text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        if (subtitle != null) {
            Spacer(Modifier.height(4.dp))
            Text(subtitle, color = BbColors.Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
        }
    }
}

@Composable
fun ErrorBox(message: String, onRetry: (() -> Unit)? = null) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(BbColors.Danger.copy(alpha = 0.12f))
            .border(1.dp, BbColors.Danger.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Column {
            Text("⚠️ $message", color = BbColors.DangerSoft, fontSize = 13.sp)
            if (onRetry != null) {
                Spacer(Modifier.height(8.dp))
                GhostButton("Повторить", Modifier.fillMaxWidth()) { onRetry() }
            }
        }
    }
}

fun deltaColor(delta: Double): Color =
    if (abs(delta) < 0.001) BbColors.Muted else if (delta > 0) BbColors.OkSoft else BbColors.DangerSoft

@Composable
fun Pill(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) BbColors.Accent.copy(alpha = 0.18f) else BbColors.CardHigh)
            .border(
                1.dp,
                if (selected) BbColors.Accent else BbColors.Border,
                RoundedCornerShape(50),
            )
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text,
            color = if (selected) BbColors.Text else BbColors.Muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
fun ContentPadding() = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
