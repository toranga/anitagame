package com.toranga.dontdie

import kotlin.math.abs

/**
 * The Gamepad API uses positive X for right and positive Y for down.
 * The Shield's left stick already uses that sign on AXIS_X / AXIS_Y, so those
 * values are forwarded unchanged. AXIS_Z / AXIS_RZ still arrive with the
 * opposite sign from the Gamepad API: a push right is negative Z, and a push
 * up is positive RZ. Negate those two so positive right-X matches axis 2.
 * The view itself turns from the yaw sign in the game, not from this flip.
 * AXIS_RX / AXIS_RY are only used when Z / RZ are idle, and they already
 * match the Gamepad API.
 */
object StickAxes {
    fun leftStick(axisX: Float, axisY: Float): Pair<Float, Float> = axisX to axisY

    fun rightStick(axisZ: Float, axisRz: Float, axisRx: Float, axisRy: Float): Pair<Float, Float> {
        val x = if (abs(axisZ) >= abs(axisRx)) -axisZ else axisRx
        val y = if (abs(axisRz) >= abs(axisRy)) -axisRz else axisRy
        return x to y
    }
}
