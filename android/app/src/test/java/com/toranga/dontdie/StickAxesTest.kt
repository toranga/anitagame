package com.toranga.dontdie

import org.junit.Assert.assertEquals
import org.junit.Test

class StickAxesTest {
    @Test
    fun leftStickKeepsTheGamepadSign() {
        val stick = StickAxes.leftStick(axisX = 0.7f, axisY = -0.4f)
        assertEquals(0.7f, stick.first, 0.001f)
        assertEquals(-0.4f, stick.second, 0.001f)
    }

    @Test
    fun shieldRightStickIsFlippedToMatchTheGamepadApi() {
        val stick = StickAxes.rightStick(axisZ = -0.8f, axisRz = 0.6f, axisRx = 0f, axisRy = 0f)
        assertEquals(0.8f, stick.first, 0.001f)
        assertEquals(-0.6f, stick.second, 0.001f)
    }

    @Test
    fun rxRyAreUsedWhenTheShieldAxesAreIdle() {
        val stick = StickAxes.rightStick(axisZ = 0f, axisRz = 0f, axisRx = 0.4f, axisRy = -0.5f)
        assertEquals(0.4f, stick.first, 0.001f)
        assertEquals(-0.5f, stick.second, 0.001f)
    }
}
