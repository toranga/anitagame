package com.toranga.dontdie

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PadStateTest {
    @Test
    fun bIsLaserAndBackDoesNotPressAnything() {
        assertFalse(GamepadMap.isBack(KeyEvent.KEYCODE_BUTTON_B))
        assertEquals(GamepadMap.B, GamepadMap.buttonIndex(KeyEvent.KEYCODE_BUTTON_B))
        assertTrue(GamepadMap.isBack(KeyEvent.KEYCODE_BACK))
        assertNull(GamepadMap.buttonIndex(KeyEvent.KEYCODE_BACK))

        val pad = PadState()
        assertTrue(pad.onKey(KeyEvent.KEYCODE_BUTTON_B, true))
        val (laser, release) = pad.toJavascript()
        assertEquals(listOf(GamepadMap.B), downs(laser))
        assertFalse(release)

        assertTrue(pad.onKey(KeyEvent.KEYCODE_BACK, true))
        val (afterBack, _) = pad.toJavascript()
        assertEquals(listOf(GamepadMap.B), downs(afterBack))
    }

    @Test
    fun tapShorterThanAFrameStillShowsOnePress() {
        val pad = PadState()
        pad.onKey(KeyEvent.KEYCODE_BUTTON_X, true)
        pad.onKey(KeyEvent.KEYCODE_BUTTON_X, false)
        val (down, release) = pad.toJavascript()
        assertEquals(listOf(GamepadMap.X), downs(down))
        assertTrue(release)
        val (up, releaseAgain) = pad.toJavascript()
        assertEquals(emptyList<Int>(), downs(up))
        assertFalse(releaseAgain)
    }

    @Test
    fun mappingMatchesTheWebGame() {
        assertEquals(GamepadMap.A, GamepadMap.buttonIndex(KeyEvent.KEYCODE_BUTTON_A))
        assertEquals(GamepadMap.DPAD_UP, GamepadMap.buttonIndex(KeyEvent.KEYCODE_DPAD_UP))
        assertEquals(GamepadMap.Y, GamepadMap.buttonIndex(KeyEvent.KEYCODE_BUTTON_Y))
        assertEquals(GamepadMap.R1, GamepadMap.buttonIndex(KeyEvent.KEYCODE_BUTTON_R1))
        assertEquals(GamepadMap.R2, GamepadMap.buttonIndex(KeyEvent.KEYCODE_BUTTON_R2))
        assertEquals(GamepadMap.START, GamepadMap.buttonIndex(KeyEvent.KEYCODE_BUTTON_START))
        assertEquals(GamepadMap.START, GamepadMap.buttonIndex(KeyEvent.KEYCODE_DPAD_CENTER))
        assertEquals(GamepadMap.SELECT, GamepadMap.buttonIndex(KeyEvent.KEYCODE_BUTTON_SELECT))
        assertEquals(GamepadMap.DPAD_LEFT, GamepadMap.buttonIndex(KeyEvent.KEYCODE_DPAD_LEFT))
        assertEquals(GamepadMap.DPAD_RIGHT, GamepadMap.buttonIndex(KeyEvent.KEYCODE_DPAD_RIGHT))
        assertEquals(GamepadMap.DPAD_DOWN, GamepadMap.buttonIndex(KeyEvent.KEYCODE_DPAD_DOWN))
        assertTrue(GamepadMap.shouldConsume(KeyEvent.KEYCODE_DPAD_DOWN))
        assertFalse(GamepadMap.shouldConsume(KeyEvent.KEYCODE_HOME))
    }

    @Test
    fun stickHatAndTriggerFeedAxisAndButtons() {
        val pad = PadState()
        pad.onAxes(0.2f, -1f, -1f, 0.8f)
        val (js, _) = pad.toJavascript()
        assertTrue(js.contains("window.__nativeAxis=0.2000"))
        assertEquals(setOf(GamepadMap.DPAD_LEFT, GamepadMap.DPAD_UP, GamepadMap.R2), downs(js).toSet())
    }

    private fun downs(js: String): List<Int> {
        val body = js.substringAfter("window.__nativeButtons=[").substringBefore("];")
        return body.split("},{").mapIndexedNotNull { index, part ->
            if (part.contains("pressed:true")) index else null
        }
    }
}
