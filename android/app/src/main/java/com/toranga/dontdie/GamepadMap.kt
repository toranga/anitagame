package com.toranga.dontdie

import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent

/**
 * Standard gamepad indexes, matching the browser game in index.html.
 * Button B is KEYCODE_BUTTON_B and is never treated as Back.
 */
object GamepadMap {
    const val BUTTON_COUNT = 16
    const val A = 0
    const val B = 1
    const val X = 2
    const val Y = 3
    const val R1 = 5
    const val R2 = 7
    const val SELECT = 8
    const val START = 9
    const val DPAD_UP = 12
    const val DPAD_LEFT = 14
    const val DPAD_RIGHT = 15

    fun isBack(keyCode: Int): Boolean {
        return keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE
    }

    fun buttonIndex(keyCode: Int): Int? = when (keyCode) {
        KeyEvent.KEYCODE_BUTTON_A -> A
        KeyEvent.KEYCODE_DPAD_UP -> DPAD_UP
        KeyEvent.KEYCODE_BUTTON_B -> B
        KeyEvent.KEYCODE_BUTTON_Y -> Y
        KeyEvent.KEYCODE_BUTTON_X -> X
        KeyEvent.KEYCODE_BUTTON_R1 -> R1
        KeyEvent.KEYCODE_BUTTON_R2 -> R2
        KeyEvent.KEYCODE_BUTTON_START,
        KeyEvent.KEYCODE_DPAD_CENTER,
        KeyEvent.KEYCODE_ENTER,
        KeyEvent.KEYCODE_NUMPAD_ENTER -> START
        KeyEvent.KEYCODE_BUTTON_SELECT -> SELECT
        KeyEvent.KEYCODE_DPAD_LEFT -> DPAD_LEFT
        KeyEvent.KEYCODE_DPAD_RIGHT -> DPAD_RIGHT
        else -> null
    }

    fun shouldConsume(keyCode: Int): Boolean {
        if (isBack(keyCode) || buttonIndex(keyCode) != null) return true
        return keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
            keyCode == KeyEvent.KEYCODE_BUTTON_L1 ||
            keyCode == KeyEvent.KEYCODE_BUTTON_L2 ||
            keyCode == KeyEvent.KEYCODE_BUTTON_THUMBL ||
            keyCode == KeyEvent.KEYCODE_BUTTON_THUMBR
    }

    fun isJoystick(event: MotionEvent): Boolean {
        if (event.action != MotionEvent.ACTION_MOVE) return false
        val source = event.source
        return (source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK ||
            (source and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
    }
}
