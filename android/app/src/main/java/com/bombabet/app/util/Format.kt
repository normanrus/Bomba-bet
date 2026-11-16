package com.bombabet.app.util

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

object Format {

    private val dayFmt = DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale("ru"))
    private val fullFmt = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale("ru"))
    private val dateFmt = DateTimeFormatter.ofPattern("d MMM yyyy", Locale("ru"))

    fun points(value: Double): String =
        String.format(Locale.US, "%,d", value.toLong()).replace(',', ' ')

    fun points(value: Int): String = points(value.toDouble())

    fun odds(value: Double): String =
        if (value == value.toLong().toDouble()) "${value.toLong()}.0" else String.format(Locale.US, "%.2f", value)

    fun dateTime(iso: String?): String = iso?.let {
        runCatching {
            Instant.parse(it).atZone(ZoneId.systemDefault()).format(dayFmt)
        }.getOrNull() ?: it
    } ?: "—"

    fun fullDateTime(iso: String?): String = iso?.let {
        runCatching {
            Instant.parse(it).atZone(ZoneId.systemDefault()).format(fullFmt)
        }.getOrNull() ?: it
    } ?: "—"

    fun date(iso: String?): String = iso?.let {
        runCatching {
            Instant.parse(it).atZone(ZoneId.systemDefault()).format(dateFmt)
        }.getOrNull() ?: it
    } ?: "—"

    fun relative(iso: String?): String {
        val instant = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return "—"
        val diff = Duration.between(Instant.now(), instant)
        val mins = diff.toMinutes()
        return when {
            mins < 0 -> "начался"
            mins < 60 -> "через ${mins} мин"
            mins < 60 * 24 -> "через ${mins / 60} ч"
            else -> "через ${mins / (60 * 24)} дн"
        }
    }

    fun percent(value: Double): String = String.format(Locale.US, "%.1f%%", value)

    val sportLabels = mapOf(
        "football" to "Футбол",
        "basketball" to "Баскетбол",
        "hockey" to "Хоккей",
        "tennis" to "Теннис",
        "esports" to "Киберспорт",
        "other" to "Спорт",
    )

    fun sportLabel(key: String): String = sportLabels[key] ?: key

    val statusLabels = mapOf(
        "pending" to "Ожидает",
        "won" to "Выиграл",
        "lost" to "Проиграл",
        "void" to "Возврат",
        "upcoming" to "Скоро",
        "live" to "В игре",
        "finished" to "Завершён",
        "cancelled" to "Отменён",
        "approved" to "Одобрена",
        "issued" to "Выдан",
        "rejected" to "Отклонена",
    )

    fun statusLabel(key: String): String = statusLabels[key] ?: key
}
