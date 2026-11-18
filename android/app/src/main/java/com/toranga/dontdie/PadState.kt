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
    var leftTrigger: Float = 0f
        private set
    var axisY: Float = 0f
        private set
    var rightX: Float = 0f
        private set
    var rightY: Float = 0f
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

    fun onAxes(
        axisX: Float,
        hatX: Float,
        hatY: Float,
        rightTrigger: Float,
        axisY: Float = 0f,
        rightX: Float = 0f,
        rightY: Float = 0f,
        leftTrigger: Float = 0f,
    ) {
        this.axisX = axisX
        this.axisY = axisY
        this.rightX = rightX
        this.rightY = rightY
        this.hatX = hatX
        this.hatY = hatY
        this.rightTrigger = rightTrigger
        this.leftTrigger = leftTrigger
    }

    fun effective(index: Int): Boolean = when (index) {
        GamepadMap.DPAD_LEFT -> keys[index] || hatX < -0.5f
        GamepadMap.DPAD_RIGHT -> keys[index] || hatX > 0.5f
        GamepadMap.DPAD_UP -> keys[index] || hatY < -0.5f
        GamepadMap.DPAD_DOWN -> keys[index] || hatY > 0.5f
        GamepadMap.L2 -> keys[index] || leftTrigger > 0.5f
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
        return buildJs(pressed) to needsRelease
    }

    private fun fmt(n: Float) = String.format(Locale.US, "%.4f", n)

    private fun buildJs(pressed: BooleanArray): String {
        val sb = StringBuilder(420)
        sb.append("window.__nativePad=true;window.__nativeAxis=")
        sb.append(fmt(axisX))
        sb.append(";window.__nativeAxisY=")
        sb.append(fmt(axisY))
        sb.append(";window.__nativeRightX=")
        sb.append(fmt(rightX))
        sb.append(";window.__nativeRightY=")
        sb.append(fmt(rightY))
        sb.append(";window.__nativeL2=")
        sb.append(fmt(leftTrigger))
        sb.append(";window.__nativeR2=")
        sb.append(fmt(rightTrigger))
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
