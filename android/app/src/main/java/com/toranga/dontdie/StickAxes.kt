package com.toranga.dontdie

import kotlin.math.abs

/**
 * The Gamepad API uses positive X for right and positive Y for down.
 * NVIDIA Shield controllers often report the right stick on AXIS_Z / AXIS_RZ
 * with the opposite sign. Negate those two axes at the source. AXIS_RX / AXIS_RY
 * are only used when Z / RZ are idle, and they already match the Gamepad API.
 */
object StickAxes {
    fun rightStick(axisZ: Float, axisRz: Float, axisRx: Float, axisRy: Float): Pair<Float, Float> {
        val x = if (abs(axisZ) >= abs(axisRx)) -axisZ else axisRx
        val y = if (abs(axisRz) >= abs(axisRy)) -axisRz else axisRy
        return x to y
    }
}
