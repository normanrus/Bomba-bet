package com.bombabet.app.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class FormatTest {

    @Test
    fun `points are grouped with spaces for readability`() {
        assertEquals("1 000", Format.points(1000.0))
        assertEquals("35 403", Format.points(35403.0))
        assertEquals("0", Format.points(0.0))
        assertEquals("999", Format.points(999))
    }

    @Test
    fun `points truncate fractional virtual currency`() {
        assertEquals("12", Format.points(12.9))
    }

    @Test
    fun `odds use two decimals for fractional values`() {
        assertEquals("2.0", Format.odds(2.0))
        assertEquals("1.50", Format.odds(1.5))
        assertEquals("3.25", Format.odds(3.25))
    }

    @Test
    fun `percent formats with one decimal`() {
        assertEquals("85.7%", Format.percent(85.7))
        assertEquals("0.0%", Format.percent(0.0))
    }

    @Test
    fun `sport labels fall back to the raw key`() {
        assertEquals("Футбол", Format.sportLabel("football"))
        assertEquals("Хоккей", Format.sportLabel("hockey"))
        assertEquals("регби", Format.sportLabel("регби"))
    }

    @Test
    fun `status labels cover predictions events and prizes`() {
        assertEquals("Ожидает", Format.statusLabel("pending"))
        assertEquals("Выиграл", Format.statusLabel("won"))
        assertEquals("Выдан", Format.statusLabel("issued"))
        assertEquals("Завершён", Format.statusLabel("finished"))
    }

    @Test
    fun `relative time describes future events`() {
        val inThreeHours = Instant.now().plusSeconds(3 * 3600 + 30).toString()
        assertTrue(Format.relative(inThreeHours).startsWith("через 3 ч"))
    }

    @Test
    fun `relative time handles a started match`() {
        val past = Instant.now().minusSeconds(600).toString()
        assertEquals("начался", Format.relative(past))
    }

    @Test
    fun `malformed timestamps degrade gracefully`() {
        assertEquals("—", Format.dateTime(null))
        assertEquals("не дата", Format.dateTime("не дата"))
    }
}
