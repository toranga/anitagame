package com.toranga.dontdie

import java.util.Locale

/**
 * Controller state owned by the Activity. The page reads it from
 * window.__nativeButtons / window.__nativeAxis and does not poll getGamepads.
 * A press that goes down and up before the next frame is still reported for one flush.
 */
class PadState {
    private val keys = BooleanArray(GamepadMap.BUTTON_COUNT)
    private val edges = BooleanArray(GamepadMap.BUTTON_COUNT)
    var axisX: Float = 0f
        private set
    var hatX: Float = 0f
        private set
    var hatY: Float = 0f
        private set
    var rightTrigger: Float = 0f
        private set

    fun onKey(keyCode: Int, down: Boolean): Boolean {
        if (GamepadMap.isBack(keyCode)) return true
        val index = GamepadMap.buttonIndex(keyCode) ?: return GamepadMap.shouldConsume(keyCode)
        if (down) {
            if (!keys[index]) edges[index] = true
            keys[index] = true
        } else {
            keys[index] = false
        }
        return true
    }

    fun onAxes(axisX: Float, hatX: Float, hatY: Float, rightTrigger: Float) {
        this.axisX = axisX
        this.hatX = hatX
        this.hatY = hatY
        this.rightTrigger = rightTrigger
    }

    fun effective(index: Int): Boolean = when (index) {
        GamepadMap.DPAD_LEFT -> keys[index] || hatX < -0.5f
        GamepadMap.DPAD_RIGHT -> keys[index] || hatX > 0.5f
        GamepadMap.DPAD_UP -> keys[index] || hatY < -0.5f
        GamepadMap.R2 -> keys[index] || rightTrigger > 0.5f
        else -> keys[index]
    }

    /** Javascript assignment, plus whether a follow-up flush must release a tap. */
    fun toJavascript(): Pair<String, Boolean> {
        val pressed = BooleanArray(GamepadMap.BUTTON_COUNT) { index -> effective(index) || edges[index] }
        var needsRelease = false
        for (index in edges.indices) {
            if (edges[index] && !effective(index)) needsRelease = true
            edges[index] = false
        }
        return buildJs(pressed, axisX) to needsRelease
    }

    private fun buildJs(pressed: BooleanArray, axis: Float): String {
        val sb = StringBuilder(360)
        sb.append("window.__nativePad=true;window.__nativeAxis=")
        sb.append(String.format(Locale.US, "%.4f", axis))
        sb.append(";window.__nativeButtons=[")
        for (index in pressed.indices) {
            if (index > 0) sb.append(',')
            if (pressed[index]) sb.append("{pressed:true,value:1}")
            else sb.append("{pressed:false,value:0}")
        }
        sb.append("];")
        return sb.toString()
    }
}
