package com.toranga.dontdie

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.PointerIcon
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.JavascriptInterface
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import android.view.Choreographer

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val pad = PadState()
    private var pageReady = false
    private var flushPosted = false
    private var lastBackMs = 0L
    private var lastBackDeliveryMs = 0L
    private lateinit var updates: AppUpdateController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT
            ) { handleBack() }
        }
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.web)
        enterImmersive()
        hidePointer()
        configureWebView(webView)
        updates = AppUpdateController(this)
        webView.addJavascriptInterface(UpdateBridge(), "AndroidUpdates")
        webView.addJavascriptInterface(AppBridge(), "AnitaApp")
        webView.loadUrl(GAME_URL)
        updates.checkOnLaunch()
    }

    override fun onResume() {
        super.onResume()
        if (::updates.isInitialized) updates.onResume()
    }

    override fun onDestroy() {
        if (::updates.isInitialized) updates.destroy()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    @Deprecated("Back is handled here so the framework cannot finish the activity.")
    override fun onBackPressed() {
        handleBack()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (::updates.isInitialized && updates.onKey(event)) return true
        if (event.keyCode == KeyEvent.KEYCODE_HOME) return super.dispatchKeyEvent(event)
        if (GamepadMap.isBack(event.keyCode)) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) handleBack()
            return true
        }
        val down = when (event.action) {
            KeyEvent.ACTION_DOWN -> true
            KeyEvent.ACTION_UP -> false
            else -> return if (GamepadMap.shouldConsume(event.keyCode)) true else super.dispatchKeyEvent(event)
        }
        if (GamepadMap.isCenter(event.keyCode)) {
            pad.onCenter(down)
            if (down && event.repeatCount == 0) menuPress("confirm")
            scheduleFlush()
            return true
        }
        if (!pad.onKey(event.keyCode, down)) return super.dispatchKeyEvent(event)
        if (down && event.repeatCount == 0) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_UP -> menuPress("up")
                KeyEvent.KEYCODE_DPAD_DOWN -> menuPress("down")
                KeyEvent.KEYCODE_DPAD_LEFT -> menuPress("left")
                KeyEvent.KEYCODE_DPAD_RIGHT -> menuPress("right")
                KeyEvent.KEYCODE_BUTTON_A -> menuPress("confirm")
                KeyEvent.KEYCODE_BUTTON_B -> menuPress("cancel")
                KeyEvent.KEYCODE_BUTTON_START -> menuPress("start")
            }
        }
        scheduleFlush()
        return true
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        if (!GamepadMap.isJoystick(event)) return super.dispatchGenericMotionEvent(event)
        val right = StickAxes.rightStick(
            event.getAxisValue(MotionEvent.AXIS_Z),
            event.getAxisValue(MotionEvent.AXIS_RZ),
            event.getAxisValue(MotionEvent.AXIS_RX),
            event.getAxisValue(MotionEvent.AXIS_RY)
        )
        pad.onAxes(
            event.getAxisValue(MotionEvent.AXIS_X),
            event.getAxisValue(MotionEvent.AXIS_HAT_X),
            event.getAxisValue(MotionEvent.AXIS_HAT_Y),
            maxOf(
                event.getAxisValue(MotionEvent.AXIS_RTRIGGER),
                event.getAxisValue(MotionEvent.AXIS_GAS)
            ),
            event.getAxisValue(MotionEvent.AXIS_Y),
            right.first,
            right.second,
            maxOf(
                event.getAxisValue(MotionEvent.AXIS_LTRIGGER),
                event.getAxisValue(MotionEvent.AXIS_BRAKE)
            )
        )
        scheduleFlush()
        return true
    }

    private fun handleBack() {
        val now = SystemClock.uptimeMillis()
        // Key delivery and OnBackInvokedCallback can both see one physical press.
        if (now - lastBackDeliveryMs < 200L) return
        lastBackDeliveryMs = now
        if (lastBackMs != 0L && now - lastBackMs <= 2000L) {
            finish()
            return
        }
        lastBackMs = now
        if (::webView.isInitialized && pageReady) {
            webView.evaluateJavascript(
                "(function(){if(window.__game&&window.__game.forcePause)window.__game.forcePause();})()",
                null
            )
        }
        Toast.makeText(this, "Press BACK again to quit", Toast.LENGTH_SHORT).show()
    }

    private fun menuPress(name: String) {
        if (!pageReady || !::webView.isInitialized) return
        webView.evaluateJavascript("window.__menuPress&&window.__menuPress('" + name + "')", null)
    }

    private fun scheduleFlush() {
        if (flushPosted) return
        flushPosted = true
        Choreographer.getInstance().postFrameCallback {
            flushPosted = false
            if (!pageReady || !::webView.isInitialized) return@postFrameCallback
            val (js, again) = pad.toJavascript()
            webView.evaluateJavascript(js, null)
            if (again) scheduleFlush()
        }
    }

    private fun configureWebView(view: WebView) {
        view.setBackgroundColor(0xFF05071C.toInt())
        view.keepScreenOn = true
        view.isVerticalScrollBarEnabled = false
        view.isHorizontalScrollBarEnabled = false
        view.overScrollMode = View.OVER_SCROLL_NEVER
        view.isLongClickable = false
        view.setOnLongClickListener { true }
        if (Build.VERSION.SDK_INT >= 26) view.defaultFocusHighlightEnabled = false
        val settings = view.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        @Suppress("DEPRECATION")
        settings.allowFileAccess = false
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = true
                view.evaluateJavascript(CURSOR_CSS, null)
                scheduleFlush()
                view.requestFocus()
            }
        }
    }

    private fun enterImmersive() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            val controller = try {
                window.insetsController
            } catch (e: NullPointerException) {
                null
            }
            controller?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                )
        }
    }

    private fun hidePointer() {
        if (Build.VERSION.SDK_INT < 24) return
        val empty = PointerIcon.getSystemIcon(this, PointerIcon.TYPE_NULL)
        webView.pointerIcon = empty
        window.decorView.pointerIcon = empty
    }

    private inner class UpdateBridge {
        @JavascriptInterface
        fun check() {
            runOnUiThread { updates.checkFromMenu() }
        }
    }

    private inner class AppBridge {
        @JavascriptInterface
        fun quit() {
            runOnUiThread { finishAndRemoveTask() }
        }
    }

    companion object {
        private const val GAME_URL = "https://appassets.androidplatform.net/assets/launcher.html?native=1"

        private const val CURSOR_CSS =
            "(function(){var s=document.createElement('style');s.textContent='html,body,canvas,button,div{cursor:none !important}';document.head.appendChild(s);})();"
    }
}
