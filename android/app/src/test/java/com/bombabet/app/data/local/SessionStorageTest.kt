package com.bombabet.app.data.local

import com.bombabet.app.InMemorySessionStorage
import com.bombabet.app.data.model.User
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionStorageTest {

    private val user = User(id = "u-1", username = "игрок", balance = 1000.0)

    @Test
    fun `a fresh store is signed out`() {
        val store = InMemorySessionStorage()
        assertFalse(store.isLoggedIn)
        assertNull(store.accessToken)
        assertNull(store.cachedUser)
    }

    @Test
    fun `saving a session keeps tokens and the cached profile`() {
        val store = InMemorySessionStorage()
        store.saveSession("a", "r", user)

        assertTrue(store.isLoggedIn)
        assertEquals("a", store.accessToken)
        assertEquals("r", store.refreshToken)
        assertEquals("u-1", store.userId)
        assertEquals(1000.0, store.cachedUser!!.balance, 0.001)
    }

    @Test
    fun `clearing wipes every field`() {
        val store = InMemorySessionStorage()
        store.saveSession("a", "r", user)
        store.clear()

        assertFalse(store.isLoggedIn)
        assertNull(store.accessToken)
        assertNull(store.refreshToken)
        assertNull(store.userId)
        assertNull(store.cachedUser)
    }

    @Test
    fun `balance updates are reflected in the cached profile`() {
        val store = InMemorySessionStorage()
        store.saveSession("a", "r", user)
        store.cachedUser = store.cachedUser!!.copy(balance = 750.0)

        assertEquals(750.0, store.cachedUser!!.balance, 0.001)
        assertTrue(store.isLoggedIn)
    }
}
